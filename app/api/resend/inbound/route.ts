import { NextRequest, NextResponse } from "next/server";
import { importInsurancePolicyFromPayload } from "@/lib/insurance-policy-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResendReceivedAttachment = {
  id?: string;
  filename?: string;
  content_type?: string;
};

const resendApiGet = async (path: string) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY eksik");
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Resend API hatasi: ${path}`);
  }
  return res.json();
};

const looksLikePoliceAttachment = (name: string) =>
  name
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .startsWith("police_tr");

export async function POST(req: NextRequest) {
  const enabled = process.env.INSURANCE_POLICY_AUTO_IMPORT_ENABLED === "true";
  if (!enabled) {
    return NextResponse.json({ error: "Otomatik sigorta importu kapali." }, { status: 403 });
  }

  const event = await req.json().catch(() => null);
  if (event?.type !== "email.received") {
    return NextResponse.json({ skipped: true, reason: "Desteklenmeyen event tipi." });
  }

  const subject = String(event?.data?.subject ?? "").trim();
  const emailId = String(event?.data?.email_id ?? "").trim();
  const eventAttachments = (Array.isArray(event?.data?.attachments)
    ? event.data.attachments
    : []) as ResendReceivedAttachment[];

  if (!subject || !emailId || !eventAttachments.length) {
    return NextResponse.json({ skipped: true, reason: "Email verisi eksik." });
  }

  const attachmentMeta = eventAttachments.find((a) =>
    looksLikePoliceAttachment(String(a?.filename ?? ""))
  );
  if (!attachmentMeta?.id || !attachmentMeta.filename) {
    return NextResponse.json({ skipped: true, reason: "Poliçe_TR eki yok." });
  }

  try {
    const attachmentDetail = await resendApiGet(
      `/emails/receiving/${emailId}/attachments/${attachmentMeta.id}`
    );
    const downloadUrl =
      attachmentDetail?.data?.download_url ??
      attachmentDetail?.download_url ??
      attachmentDetail?.data?.url ??
      attachmentDetail?.url ??
      null;

    if (!downloadUrl) {
      return NextResponse.json({ skipped: true, reason: "Attachment download URL bulunamadi." });
    }

    const fileRes = await fetch(String(downloadUrl), { cache: "no-store" });
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Attachment indirilemedi." }, { status: 500 });
    }
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    const importResult = await importInsurancePolicyFromPayload({
      subject,
      attachments: [
        {
          filename: attachmentMeta.filename,
          contentBase64: fileBuffer.toString("base64"),
          contentType: attachmentMeta.content_type ?? "application/octet-stream",
        },
      ],
    });

    if (!importResult.ok) {
      const { status, ...payload } = importResult;
      return NextResponse.json(payload, { status });
    }
    return NextResponse.json(importResult, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inbound isleme hatasi" },
      { status: 500 }
    );
  }
}

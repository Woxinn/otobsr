import { NextRequest, NextResponse } from "next/server";
import { importInsurancePolicyFromPayload } from "@/lib/insurance-policy-import";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
    .startsWith("police_");

export async function POST(req: NextRequest) {
  const captureEnabled =
    process.env.INSURANCE_POLICY_INBOX_CAPTURE_ENABLED !== "false";
  if (!captureEnabled) {
    return NextResponse.json({ error: "Sigorta inbox yakalama kapali." }, { status: 403 });
  }

  const event = await req.json().catch(() => null);
  if (event?.type !== "email.received") {
    return NextResponse.json({ skipped: true, reason: "Desteklenmeyen event tipi." });
  }

  const subject = String(event?.data?.subject ?? "").trim();
  const emailId = String(event?.data?.email_id ?? "").trim();
  const fromEmail = String(
    event?.data?.from?.email ??
      event?.data?.from_email ??
      event?.data?.from ??
      ""
  ).trim();
  const receivedAt = String(event?.data?.created_at ?? event?.created_at ?? "").trim();
  const eventAttachments = (Array.isArray(event?.data?.attachments)
    ? event.data.attachments
    : []) as ResendReceivedAttachment[];

  if (!subject || !emailId || !eventAttachments.length) {
    return NextResponse.json({ skipped: true, reason: "Email verisi eksik." });
  }

  const attachmentMetas = eventAttachments.filter((a) =>
    looksLikePoliceAttachment(String(a?.filename ?? ""))
  );

  const admin = createSupabaseAdminClient();
  const { data: mailRow, error: mailError } = await admin
    .from("insurance_inbound_mails")
    .upsert(
      {
        provider_message_id: emailId,
        subject,
        from_email: fromEmail || null,
        received_at: receivedAt || null,
        has_policy_attachment: attachmentMetas.length > 0,
        policy_attachment_count: attachmentMetas.length,
        raw_payload: event?.data ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_message_id" }
    )
    .select("id")
    .single();
  if (mailError || !mailRow?.id) {
    return NextResponse.json({ error: mailError?.message ?? "Inbound mail kaydi yapilamadi." }, { status: 500 });
  }

  for (const attachment of eventAttachments) {
    if (!attachment?.id) continue;
    await admin
      .from("insurance_inbound_attachments")
      .upsert(
        {
          mail_id: mailRow.id,
          provider_attachment_id: attachment.id,
          filename: attachment.filename ?? null,
          content_type: attachment.content_type ?? null,
          is_policy_candidate: looksLikePoliceAttachment(String(attachment.filename ?? "")),
        },
        { onConflict: "mail_id,provider_attachment_id" }
      );
  }

  if (!attachmentMetas.length) {
    return NextResponse.json({ ok: true, captured: true, skipped: true, reason: "Police_ eki yok." });
  }

  try {
    const payloadAttachments: Array<{
      filename: string;
      contentBase64: string;
      contentType?: string;
    }> = [];

    for (const attachmentMeta of attachmentMetas) {
      if (!attachmentMeta.id || !attachmentMeta.filename) continue;
      const attachmentDetail = await resendApiGet(
        `/emails/receiving/${emailId}/attachments/${attachmentMeta.id}`
      );
      const downloadUrl =
        attachmentDetail?.data?.download_url ??
        attachmentDetail?.download_url ??
        attachmentDetail?.data?.url ??
        attachmentDetail?.url ??
        null;
      if (!downloadUrl) continue;

      const fileRes = await fetch(String(downloadUrl), { cache: "no-store" });
      if (!fileRes.ok) {
        return NextResponse.json({ error: "Attachment indirilemedi." }, { status: 500 });
      }
      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
      payloadAttachments.push({
        filename: attachmentMeta.filename,
        contentBase64: fileBuffer.toString("base64"),
        contentType: attachmentMeta.content_type ?? "application/octet-stream",
      });
    }

    if (!payloadAttachments.length) {
      return NextResponse.json({ skipped: true, reason: "Police_ eki indirilemedi." });
    }

    const autoImportEnabled = process.env.INSURANCE_POLICY_AUTO_IMPORT_ENABLED === "true";
    if (!autoImportEnabled) {
      return NextResponse.json({
        ok: true,
        captured: true,
        skipped: true,
        reason: "Yari-otomatik mod: mail kaydedildi, manuel eslestirme bekleniyor.",
      });
    }

    const importResult = await importInsurancePolicyFromPayload({ subject, attachments: payloadAttachments });

    if (!importResult.ok) {
      await admin
        .from("insurance_inbound_mails")
        .update({
          import_status: "failed",
          import_note: (importResult as any).reason ?? (importResult as any).error ?? "Import basarisiz",
          updated_at: new Date().toISOString(),
        })
        .eq("id", mailRow.id);
      const { status, ...payload } = importResult;
      return NextResponse.json(payload, { status });
    }
    await admin
      .from("insurance_inbound_mails")
      .update({
        import_status: "imported",
        imported_order_id: (importResult as any).orderId ?? null,
        imported_at: new Date().toISOString(),
        import_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mailRow.id);
    return NextResponse.json(importResult, { status: 200 });
  } catch (error) {
    await admin
      .from("insurance_inbound_mails")
      .update({
        import_status: "failed",
        import_note: error instanceof Error ? error.message : "Inbound isleme hatasi",
        updated_at: new Date().toISOString(),
      })
      .eq("id", mailRow.id);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Inbound isleme hatasi" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import { importInsurancePolicyFromPayload } from "@/lib/insurance-policy-import";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const resendApiGet = async (path: string) => {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY eksik");
  const res = await fetch(`https://api.resend.com${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Resend API hatasi: ${path}`);
  }
  return res.json();
};

export async function POST(req: NextRequest) {
  const { role } = await getCurrentUserRole();
  if (!canViewFinance(role)) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const mailId = String(body?.mailId ?? "").trim();
  const orderId = String(body?.orderId ?? "").trim();
  if (!mailId || !orderId) {
    return NextResponse.json({ error: "mailId ve orderId zorunlu." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: mailRow, error: mailError } = await admin
    .from("insurance_inbound_mails")
    .select("id, provider_message_id, subject")
    .eq("id", mailId)
    .maybeSingle();
  if (mailError || !mailRow) {
    return NextResponse.json({ error: mailError?.message ?? "Mail kaydi bulunamadi." }, { status: 404 });
  }

  const { data: attachments, error: attError } = await admin
    .from("insurance_inbound_attachments")
    .select("provider_attachment_id, filename, content_type, is_policy_candidate")
    .eq("mail_id", mailId)
    .eq("is_policy_candidate", true);
  if (attError) return NextResponse.json({ error: attError.message }, { status: 500 });
  if (!attachments?.length) {
    return NextResponse.json({ error: "Mailde uygun Police_ eki yok." }, { status: 400 });
  }

  try {
    const payloadAttachments: Array<{ filename: string; contentBase64: string; contentType?: string }> = [];
    for (const attachment of attachments) {
      const detail = await resendApiGet(
        `/emails/receiving/${mailRow.provider_message_id}/attachments/${attachment.provider_attachment_id}`
      );
      const downloadUrl =
        detail?.data?.download_url ?? detail?.download_url ?? detail?.data?.url ?? detail?.url ?? null;
      if (!downloadUrl) continue;
      const fileRes = await fetch(String(downloadUrl), { cache: "no-store" });
      if (!fileRes.ok) continue;
      const fileBuffer = Buffer.from(await fileRes.arrayBuffer());
      payloadAttachments.push({
        filename: String(attachment.filename ?? "police.pdf"),
        contentBase64: fileBuffer.toString("base64"),
        contentType: attachment.content_type ?? "application/octet-stream",
      });
    }

    if (!payloadAttachments.length) {
      return NextResponse.json({ error: "Ekler indirilemedi." }, { status: 500 });
    }

    const result = await importInsurancePolicyFromPayload({
      subject: String(mailRow.subject ?? ""),
      attachments: payloadAttachments,
      orderId,
    });

    if (!result.ok) {
      await admin
        .from("insurance_inbound_mails")
        .update({
          import_status: "failed",
          import_note: (result as any).reason ?? (result as any).error ?? "Import basarisiz",
          updated_at: new Date().toISOString(),
        })
        .eq("id", mailId);
      const { status, ...payload } = result;
      return NextResponse.json(payload, { status });
    }

    await admin
      .from("insurance_inbound_mails")
      .update({
        import_status: "imported",
        imported_order_id: orderId,
        imported_at: new Date().toISOString(),
        import_note: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", mailId);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import hatasi" },
      { status: 500 }
    );
  }
}

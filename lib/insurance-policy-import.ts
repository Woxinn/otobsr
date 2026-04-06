import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type InsuranceImportAttachment = {
  filename: string;
  contentBase64: string;
  contentType?: string;
};

const normalizeText = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sanitizeFileName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "police.pdf";

const stripDataPrefix = (base64: string) => {
  const marker = "base64,";
  const idx = base64.indexOf(marker);
  return idx >= 0 ? base64.slice(idx + marker.length) : base64;
};

const startsWithPoliceTr = (filename: string) => {
  const normalized = normalizeText(filename).replace(/\s+/g, "_");
  return normalized.startsWith("police_tr");
};

async function resolveOrderFromSubject(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  subject: string
) {
  const raw = subject.trim();
  const cleaned = raw
    .replace(/^(re|fw|fwd)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const subjectPart = cleaned.includes(" - ")
    ? cleaned.split(" - ").slice(1).join(" - ").trim()
    : cleaned;

  if (subjectPart) {
    const { data: byName } = await admin
      .from("orders")
      .select("id, name, code, created_at")
      .ilike("name", `%${subjectPart}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (byName?.[0]) return byName[0];

    const { data: byCode } = await admin
      .from("orders")
      .select("id, name, code, created_at")
      .ilike("code", `%${subjectPart}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (byCode?.[0]) return byCode[0];
  }

  const { data: recentOrders } = await admin
    .from("orders")
    .select("id, name, code, created_at")
    .order("created_at", { ascending: false })
    .limit(400);

  const normalizedSubject = normalizeText(cleaned);
  const candidates = (recentOrders ?? [])
    .map((order) => {
      const name = String(order.name ?? "").trim();
      const code = String(order.code ?? "").trim();
      const nName = normalizeText(name);
      const nCode = normalizeText(code);
      const matched =
        (nName && normalizedSubject.includes(nName)) ||
        (nCode && normalizedSubject.includes(nCode));
      const score = Math.max(nName.length, nCode.length);
      return { order, matched, score };
    })
    .filter((row) => row.matched)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.order ?? null;
}

export async function importInsurancePolicyFromPayload(input: {
  subject: string;
  attachments: InsuranceImportAttachment[];
}) {
  const subject = String(input.subject ?? "").trim();
  const attachments = input.attachments ?? [];
  if (!subject || !attachments.length) {
    return { ok: false as const, status: 400, error: "subject ve attachments zorunlu." };
  }

  const policeAttachment = attachments.find((item) => {
    const filename = String(item.filename ?? "");
    return filename ? startsWithPoliceTr(filename) : false;
  });
  if (!policeAttachment?.contentBase64 || !policeAttachment?.filename) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: "Poliçe_TR eki bulunamadi.",
    };
  }

  const admin = createSupabaseAdminClient();
  const order = await resolveOrderFromSubject(admin, subject);
  if (!order?.id) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: "Konuya gore siparis bulunamadi.",
    };
  }

  const { data: insuranceDocType } = await admin
    .from("document_types")
    .select("id, code")
    .eq("code", "NAVLUN_SIGORTA")
    .maybeSingle();

  if (!insuranceDocType?.id) {
    return { ok: false as const, status: 500, error: "NAVLUN_SIGORTA belge tipi bulunamadi." };
  }

  const { data: existingDoc } = await admin
    .from("order_documents")
    .select("id")
    .eq("order_id", order.id)
    .eq("document_type_id", insuranceDocType.id)
    .limit(1)
    .maybeSingle();

  if (existingDoc?.id) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: "Sipariste navlun sigorta belgesi zaten var.",
    };
  }

  const safeName = sanitizeFileName(policeAttachment.filename);
  const storagePath = `orders/${order.id}/insurance-auto/${Date.now()}-${safeName}`;
  const binary = Buffer.from(stripDataPrefix(policeAttachment.contentBase64), "base64");

  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, binary, {
    contentType: policeAttachment.contentType || "application/octet-stream",
    upsert: false,
  });

  if (uploadError) return { ok: false as const, status: 500, error: uploadError.message };

  const today = new Date().toISOString().slice(0, 10);
  const { error: insertError } = await admin.from("order_documents").insert({
    order_id: order.id,
    storage_path: storagePath,
    file_name: policeAttachment.filename,
    document_type_id: insuranceDocType.id,
    status: "Geldi",
    received_at: today,
    notes: `Otomatik mail importu | subject: ${subject}`,
  });
  if (insertError) return { ok: false as const, status: 500, error: insertError.message };

  return {
    ok: true as const,
    status: 200,
    orderId: order.id,
    orderName: order.name ?? null,
    uploadedFile: policeAttachment.filename,
    storagePath,
  };
}

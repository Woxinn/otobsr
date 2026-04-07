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

const startsWithPolicePrefix = (filename: string) => {
  const normalized = normalizeText(filename).replace(/\s+/g, "_");
  return normalized.startsWith("police_") || normalized.startsWith("police-tr");
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
  const tailPart = cleaned.includes("-")
    ? cleaned.split("-").slice(-1).join("-").trim()
    : "";
  const regexTerms = cleaned.match(/[A-Z0-9][A-Z0-9-]{2,}/gi) ?? [];
  const candidateTerms = Array.from(
    new Set([subjectPart, tailPart, ...regexTerms].map((item) => String(item ?? "").trim()).filter(Boolean))
  );

  const { data: recentOrders } = await admin
    .from("orders")
    .select("id, name, code, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  const normalizedSubject = normalizeText(cleaned);
  const compact = (value: string) => normalizeText(value).replace(/\s+/g, "");
  const compactSubject = compact(cleaned);
  const compactTerms = Array.from(new Set(candidateTerms.map((term) => compact(term)).filter(Boolean)));

  // 1) Global DB search first (old siparisler 5000 limitine takilmasin)
  for (const term of candidateTerms) {
    const { data: directMatch } = await admin
      .from("orders")
      .select("id, name, code, created_at")
      .or(`name.ilike.%${term}%,code.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(1);
    if (directMatch?.[0]) return directMatch[0];
  }

  const candidates = (recentOrders ?? [])
    .map((order) => {
      const name = String(order.name ?? "").trim();
      const code = String(order.code ?? "").trim();
      const nName = normalizeText(name);
      const nCode = normalizeText(code);
      const cName = compact(name);
      const cCode = compact(code);

      let score = 0;
      if (!cName && !cCode) return { order, matched: false, score: 0 };

      // Exact first: ETKT-30, ETKT 30, etkt30 varyasyonlarini ayni kabul et.
      if (compactTerms.some((term) => term && (cCode === term || cName === term))) score += 1000;

      // Subject icinde gecen kod/ad.
      if (cCode && (normalizedSubject.includes(nCode) || compactSubject.includes(cCode))) score += 300;
      if (cName && (normalizedSubject.includes(nName) || compactSubject.includes(cName))) score += 120;

      // Token bazli fallback.
      const tokenMatchCount = compactTerms.filter(
        (term) => term && ((cCode && cCode.includes(term)) || (cName && cName.includes(term)))
      ).length;
      score += tokenMatchCount * 40;

      return { order, matched: score > 0, score };
    })
    .filter((row) => row.matched)
    .sort((a, b) => b.score - a.score);

  return candidates[0]?.order ?? null;
}

export async function importInsurancePolicyFromPayload(input: {
  subject: string;
  attachments: InsuranceImportAttachment[];
  orderId?: string;
}) {
  const subject = String(input.subject ?? "").trim();
  const attachments = input.attachments ?? [];
  if (!subject || !attachments.length) {
    return { ok: false as const, status: 400, error: "subject ve attachments zorunlu." };
  }

  const policeAttachments = attachments.filter((item) => {
    const filename = String(item.filename ?? "");
    return filename ? startsWithPolicePrefix(filename) : false;
  });
  if (!policeAttachments.length) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: "Police_ ile baslayan ek bulunamadi.",
    };
  }

  const admin = createSupabaseAdminClient();
  const order = input.orderId
    ? await admin
        .from("orders")
        .select("id, name, code, created_at")
        .eq("id", input.orderId)
        .maybeSingle()
        .then((r) => r.data)
    : await resolveOrderFromSubject(admin, subject);
  if (!order?.id) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: `Konuya gore siparis bulunamadi. Subject: ${subject}`,
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

  const uploadedFiles: string[] = [];
  const skippedFiles: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const attachment of policeAttachments) {
    if (!attachment.filename || !attachment.contentBase64) continue;
    const originalName = attachment.filename;

    const { data: duplicateDoc } = await admin
      .from("order_documents")
      .select("id")
      .eq("order_id", order.id)
      .eq("document_type_id", insuranceDocType.id)
      .eq("file_name", originalName)
      .limit(1)
      .maybeSingle();

    if (duplicateDoc?.id) {
      skippedFiles.push(originalName);
      continue;
    }

    const safeName = sanitizeFileName(originalName);
    const storagePath = `orders/${order.id}/insurance-auto/${Date.now()}-${safeName}`;
    const binary = Buffer.from(stripDataPrefix(attachment.contentBase64), "base64");

    const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, binary, {
      contentType: attachment.contentType || "application/octet-stream",
      upsert: false,
    });
    if (uploadError) return { ok: false as const, status: 500, error: uploadError.message };

    const { error: insertError } = await admin.from("order_documents").insert({
      order_id: order.id,
      storage_path: storagePath,
      file_name: originalName,
      document_type_id: insuranceDocType.id,
      status: "Geldi",
      received_at: today,
      notes: `Otomatik mail importu | subject: ${subject}`,
    });
    if (insertError) return { ok: false as const, status: 500, error: insertError.message };

    uploadedFiles.push(originalName);
  }

  if (!uploadedFiles.length) {
    return {
      ok: false as const,
      status: 200,
      skipped: true,
      reason: "Police_ ekleri zaten yuklu.",
      skippedFiles,
    };
  }

  return {
    ok: true as const,
    status: 200,
    orderId: order.id,
    orderName: order.name ?? null,
    uploadedCount: uploadedFiles.length,
    uploadedFiles,
    skippedFiles,
  };
}

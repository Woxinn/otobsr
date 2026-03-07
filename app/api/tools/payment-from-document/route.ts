import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const normalizeText = (text: string) =>
  text
    .replace(/[\u00A0]/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const parseAmountLine = (text: string) => {
  const normalized = normalizeText(text);
  const match = normalized.match(
    /transfer\s*tutari\/?doviz\s*cinsi[:\s]*([\d\.,]+)\s*([A-Z]{3})/i
  );
  if (!match) return { amount: null, currency: null };
  const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return { amount: null, currency: null };
  return { amount, currency: match[2].toUpperCase() };
};

const findAnyAmountCurrency = (text: string) => {
  const normalized = normalizeText(text);
  const pattern =
    /([\d][\d\.,]{3,})\s*(USD|EUR|TRY|GBP|CNY|RMB|CHF|JPY|AED|SAR|RUB|KZT)/gi;
  let best: { amount: number; currency: string } | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    const amount = Number(match[1].replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amount)) continue;
    if (!best || amount > best.amount) {
      best = { amount, currency: match[2].toUpperCase() };
    }
  }
  return best ?? { amount: null, currency: null };
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();

  let orderId: string | null = null;
  let documentId: string | null = null;
  let storagePath: string | null = null;
  let fallbackCurrency: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    orderId = body.orderId ?? null;
    documentId = body.documentId ?? null;
    storagePath = body.storagePath ?? null;
    fallbackCurrency = body.currency ?? null;
  } else {
    const form = await request.formData();
    orderId = (form.get("order_id") as string) ?? null;
    documentId = (form.get("document_id") as string) ?? null;
    storagePath = (form.get("storage_path") as string) ?? null;
    fallbackCurrency = (form.get("currency") as string) ?? null;
  }

  if (!orderId || !storagePath) {
    return NextResponse.json({ error: "order_id ve storage_path zorunlu" }, { status: 400 });
  }

  const { data: downloadData, error: downloadError } = await supabase.storage
    .from("documents")
    .download(storagePath);
  if (downloadError || !downloadData) {
    return NextResponse.json({ error: "Dosya indirilemedi" }, { status: 500 });
  }

  const uint8 = new Uint8Array(await downloadData.arrayBuffer());
  const texts = [Buffer.from(uint8).toString("utf8"), Buffer.from(uint8).toString("latin1")];

  let amount: number | null = null;
  let currency: string | null = null;

  for (const text of texts) {
    const parsed = parseAmountLine(text);
    if (parsed.amount !== null) {
      amount = parsed.amount;
      currency = parsed.currency;
      break;
    }
  }

  if (amount === null) {
    try {
      const pdfParseModule: any = await import("pdf-parse");
      const pdfParse =
        (pdfParseModule.default || pdfParseModule) as (buffer: Buffer) => Promise<{ text?: string }>;
      if (typeof pdfParse === "function") {
        const parsed = await pdfParse(Buffer.from(uint8));
        const strict = parseAmountLine(parsed?.text ?? "");
        if (strict.amount !== null) {
          amount = strict.amount;
          currency = strict.currency;
        } else {
          const loose = findAnyAmountCurrency(parsed?.text ?? "");
          amount = loose.amount;
          currency = loose.currency;
        }
      }
    } catch (error) {
      console.error("[payment-from-document] pdf-parse error", error);
    }
  }

  if (amount === null) {
    const loose = findAnyAmountCurrency(Buffer.from(uint8).toString("latin1"));
    amount = loose.amount;
    currency = loose.currency;
  }

  if (amount === null) {
    return NextResponse.json({ error: "Tutar bulunamadi" }, { status: 422 });
  }

  const paymentDate = new Date().toISOString().slice(0, 10);
  const { error: insertError } = await supabase.from("order_payments").insert({
    order_id: orderId,
    amount,
    currency: currency ?? fallbackCurrency ?? "USD",
    payment_date: paymentDate,
    method: "PDF",
    status: "Odendi",
    notes: documentId ? `PDF'den otomatik | doc:${documentId}` : "PDF'den otomatik",
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    amount,
    currency: currency ?? fallbackCurrency ?? "USD",
    payment_date: paymentDate,
  });
}

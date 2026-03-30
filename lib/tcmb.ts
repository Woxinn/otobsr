type TcmbRateResult = {
  currency: string;
  rate: number | null;
  date: string | null;
  source: string;
  error?: string | null;
};

const TCMB_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";

const extractTag = (block: string, tag: string) => {
  const match = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  return match?.[1]?.trim() ?? null;
};

export async function fetchTcmbTryRate(currency: string | null | undefined): Promise<TcmbRateResult> {
  const normalized = String(currency ?? "").trim().toUpperCase();
  if (!normalized || normalized === "TRY") {
    return {
      currency: normalized || "TRY",
      rate: 1,
      date: null,
      source: TCMB_URL,
      error: null,
    };
  }

  try {
    const response = await fetch(TCMB_URL, { cache: "no-store" });
    if (!response.ok) {
      return {
        currency: normalized,
        rate: null,
        date: null,
        source: TCMB_URL,
        error: `TCMB cevap kodu: ${response.status}`,
      };
    }

    const xml = await response.text();
    const dateMatch = xml.match(/<Tarih_Date[^>]*Date="([^"]+)"/i);
    const blockMatch = xml.match(
      new RegExp(`<Currency[^>]*CurrencyCode="${normalized}"[^>]*>([\\s\\S]*?)</Currency>`, "i")
    );

    if (!blockMatch) {
      return {
        currency: normalized,
        rate: null,
        date: dateMatch?.[1] ?? null,
        source: TCMB_URL,
        error: "TCMB bulteninde para birimi bulunamadi",
      };
    }

    const block = blockMatch[1];
    const rawRate =
      extractTag(block, "ForexSelling") ??
      extractTag(block, "BanknoteSelling") ??
      extractTag(block, "CrossRateOther");

    const parsed = Number(String(rawRate ?? "").replace(",", "."));
    return {
      currency: normalized,
      rate: Number.isFinite(parsed) ? parsed : null,
      date: dateMatch?.[1] ?? null,
      source: TCMB_URL,
      error: Number.isFinite(parsed) ? null : "Kur degeri parse edilemedi",
    };
  } catch (error) {
    return {
      currency: normalized,
      rate: null,
      date: null,
      source: TCMB_URL,
      error: error instanceof Error ? error.message : "TCMB verisi alinamadi",
    };
  }
}

import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import { fetchTcmbTryRate } from "@/lib/tcmb";
import OrderDeclarationTryLab from "@/components/OrderDeclarationTryLab";

type RouteParams = {
  id: string;
};

type Numberish = number | string | null | undefined;

type DeclarationLine = {
  id: string;
  code: string;
  name: string;
  gtipCode: string | null;
  quantity: number;
  netKg: number;
  grossKg: number;
  unitPrice: number;
  fobTotal: number;
  freightShare: number;
  insuranceShare: number;
  extraCostShare: number;
  stampTaxShare: number;
  surveillanceUnitValue: number;
  surveillanceApplicable: boolean;
  antiDumpingRate: number;
  antiDumpingApplicable: boolean;
  cif: number;
  surveillanceBase: number;
  customsBase: number;
  customsDutyRate: number;
  customsDuty: number;
  additionalDutyRate: number;
  additionalDuty: number;
  antiDumping: number;
  vatRate: number;
  vatBase: number;
  vat: number;
  totalTaxes: number;
  landedTotal: number;
  landedUnit: number;
  warnings: string[];
};

const takeOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

const toNumber = (value: Numberish) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value: number, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const formatNumber = (value: Numberish, digits = 2) =>
  toNumber(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });

const formatMoney = (value: Numberish, currency: string | null | undefined, digits = 2) =>
  `${toNumber(value).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  })} ${currency ?? "USD"}`;

const pct = (value: Numberish) => toNumber(value) / 100;

const lower = (value: string | null | undefined) => (value ?? "").toLowerCase();

export default async function OrderDeclarationLabPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();

  if (!canViewFinance(role)) {
    return (
      <section className="space-y-6">
        <div className="rounded-[28px] border border-black/10 bg-white p-8 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Beyanname Lab q9m2</p>
          <h1 className="mt-2 text-2xl font-semibold text-black">Bu ekran icin finans yetkisi gerekiyor</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
            Bu prototip sadece finans goruntuleme yetkisi olan kullanicilar icin acik.
          </p>
          <div className="mt-5">
            <Link
              href={`/orders/${id}`}
              className="rounded-full border border-black/15 bg-[var(--mint)] px-4 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              Siparise don
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, name, reference_name, currency, supplier_id, total_amount")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return (
      <section className="space-y-6">
        <div className="rounded-[28px] border border-black/10 bg-white p-8 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Beyanname Lab q9m2</p>
          <h1 className="mt-2 text-2xl font-semibold text-black">Siparis verisi okunamadi</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">
            Route calisiyor ancak siparis sorgusu sonuc donmedi.
          </p>
          <div className="mt-5 space-y-2 rounded-2xl border border-black/10 bg-[var(--paper)]/70 p-4 text-sm text-black/70">
            <div>
              <span className="font-semibold text-black">Order id:</span> {id}
            </div>
            <div>
              <span className="font-semibold text-black">Supabase hata:</span>{" "}
              {orderError?.message ?? "Kayit bulunamadi"}
            </div>
          </div>
          <div className="mt-5">
            <Link
              href="/orders"
              className="rounded-full border border-black/15 bg-[var(--mint)] px-4 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              Siparis listesine don
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const [{ data: supplier }, { data: orderItemsRaw }, { data: packingItemsRaw }, { data: packingSummary }, { data: orderDocumentsRaw }] =
    await Promise.all([
      order.supplier_id
        ? supabase.from("suppliers").select("id, name").eq("id", order.supplier_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("order_items")
        .select(
          `
          id, product_id, name, quantity, unit_price, total_amount, net_weight_kg, gross_weight_kg,
          products(
            id, code, name, gtip_id,
            gtip:gtips(
              id, code, description, customs_duty_rate, additional_duty_rate, vat_rate,
              anti_dumping_applicable, anti_dumping_rate,
              surveillance_applicable, surveillance_unit_value
            )
          )
        `
        )
        .eq("order_id", order.id)
        .order("line_no", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
      supabase
        .from("order_packing_list_items")
        .select("product_id, product_code, quantity, net_weight_kg, gross_weight_kg, weight_kg")
        .eq("order_id", order.id),
      supabase
        .from("order_packing_list_summary")
        .select("total_net_weight_kg, total_gross_weight_kg")
        .eq("order_id", order.id)
        .maybeSingle(),
      supabase
        .from("order_documents")
        .select(
          "id, file_name, insurance_amount, insurance_currency, freight_amount, freight_currency, document_types(code, name)"
        )
        .eq("order_id", order.id),
    ]);

  const orderItems = (orderItemsRaw ?? []) as any[];
  const packingItems = (packingItemsRaw ?? []) as any[];
  const orderDocuments = (orderDocumentsRaw ?? []) as any[];

  const packingByProductId = new Map<string, { qty: number; net: number; gross: number }>();
  const packingByProductCode = new Map<string, { qty: number; net: number; gross: number }>();

  for (const row of packingItems) {
    const qty = toNumber(row.quantity);
    const net = toNumber(row.net_weight_kg ?? row.weight_kg);
    const gross = toNumber(row.gross_weight_kg ?? row.weight_kg);
    const productId = row.product_id ? String(row.product_id) : null;
    const productCode = row.product_code ? String(row.product_code).trim() : null;

    if (productId) {
      const prev = packingByProductId.get(productId) ?? { qty: 0, net: 0, gross: 0 };
      prev.qty += qty;
      prev.net += net;
      prev.gross += gross;
      packingByProductId.set(productId, prev);
    }

    if (productCode) {
      const prev = packingByProductCode.get(productCode) ?? { qty: 0, net: 0, gross: 0 };
      prev.qty += qty;
      prev.net += net;
      prev.gross += gross;
      packingByProductCode.set(productCode, prev);
    }
  }

  const itemQtyByProductId = new Map<string, number>();
  const itemQtyByProductCode = new Map<string, number>();

  for (const item of orderItems) {
    const product = takeOne<any>(item.products);
    const productId = product?.id ? String(product.id) : null;
    const productCode = product?.code ? String(product.code).trim() : null;
    const qty = toNumber(item.quantity);
    if (productId) itemQtyByProductId.set(productId, (itemQtyByProductId.get(productId) ?? 0) + qty);
    if (productCode) itemQtyByProductCode.set(productCode, (itemQtyByProductCode.get(productCode) ?? 0) + qty);
  }

  const orderCurrency = order.currency ?? "USD";
  const currencyWarnings: string[] = [];

  const insuranceDocs = orderDocuments.filter((doc) => {
    const docType = takeOne<any>(doc.document_types);
    return lower(docType?.name).includes("navlun") && lower(docType?.name).includes("sigorta");
  });

  const freightDocs = orderDocuments.filter((doc) => {
    const docType = takeOne<any>(doc.document_types);
    return lower(docType?.name).includes("navlun") && lower(docType?.name).includes("fatura");
  });

  const usableInsuranceDocs = insuranceDocs.filter((doc) => {
    const docCurrency = doc.insurance_currency ?? orderCurrency;
    const same = !docCurrency || docCurrency === orderCurrency;
    if (!same) {
      currencyWarnings.push(
        `${doc.file_name ?? "Sigorta belgesi"} farkli para biriminde oldugu icin hesap disi birakildi`
      );
    }
    return same;
  });

  const usableFreightDocs = freightDocs.filter((doc) => {
    const docCurrency = doc.freight_currency ?? orderCurrency;
    const same = !docCurrency || docCurrency === orderCurrency;
    if (!same) {
      currencyWarnings.push(
        `${doc.file_name ?? "Navlun belgesi"} farkli para biriminde oldugu icin hesap disi birakildi`
      );
    }
    return same;
  });

  const insuranceTotal = usableInsuranceDocs.reduce((sum, doc) => sum + toNumber(doc.insurance_amount), 0);
  const freightTotal = usableFreightDocs.reduce((sum, doc) => sum + toNumber(doc.freight_amount), 0);

  const baseLines = orderItems.map((item: any) => {
    const product = takeOne<any>(item.products);
    const gtip = takeOne<any>(product?.gtip);
    const quantity = toNumber(item.quantity);
    const unitPrice = toNumber(item.unit_price);
    const fobTotal = toNumber(item.total_amount || quantity * unitPrice);
    const directNet = toNumber(item.net_weight_kg);
    const directGross = toNumber(item.gross_weight_kg);
    const productId = product?.id ? String(product.id) : null;
    const productCode = product?.code ? String(product.code).trim() : null;
    const packingAgg =
      (productId ? packingByProductId.get(productId) : null) ??
      (productCode ? packingByProductCode.get(productCode) : null) ??
      null;
    const sameProductQty =
      (productId ? itemQtyByProductId.get(productId) : null) ??
      (productCode ? itemQtyByProductCode.get(productCode) : null) ??
      0;
    const qtyShare = sameProductQty > 0 ? quantity / sameProductQty : 0;

    const netKg =
      directNet > 0
        ? directNet
        : packingAgg && packingAgg.net > 0
          ? round(packingAgg.net * qtyShare, 4)
          : 0;
    const grossKg =
      directGross > 0
        ? directGross
        : packingAgg && packingAgg.gross > 0
          ? round(packingAgg.gross * qtyShare, 4)
          : 0;

    return {
      id: String(item.id),
      code: product?.code ?? "-",
      name: item.name ?? product?.name ?? "Urun",
      gtip,
      quantity,
      unitPrice,
      fobTotal,
      netKg,
      grossKg,
    };
  });

  const totalFob = baseLines.reduce((sum, line) => sum + line.fobTotal, 0);
  const totalKnownNet = baseLines.reduce((sum, line) => sum + line.netKg, 0);
  const totalKnownGross = baseLines.reduce((sum, line) => sum + line.grossKg, 0);
  const summaryNet = toNumber(packingSummary?.total_net_weight_kg);
  const summaryGross = toNumber(packingSummary?.total_gross_weight_kg);
  const fallbackNet = totalKnownNet > 0 ? totalKnownNet : summaryNet;
  const fallbackGross = totalKnownGross > 0 ? totalKnownGross : summaryGross;

  const lines: DeclarationLine[] = baseLines.map((line) => {
    const warnings: string[] = [];
    const gtip = line.gtip;

    let netKg = line.netKg;
    let grossKg = line.grossKg;

    if (netKg <= 0 && fallbackNet > 0 && totalFob > 0) {
      netKg = round((line.fobTotal / totalFob) * fallbackNet, 4);
      warnings.push("Net agirlik FOB payi ile dagitildi");
    }
    if (grossKg <= 0 && fallbackGross > 0 && totalFob > 0) {
      grossKg = round((line.fobTotal / totalFob) * fallbackGross, 4);
      warnings.push("Brut agirlik FOB payi ile dagitildi");
    }

    const freightBaseTotal = fallbackNet > 0 ? fallbackNet : totalFob;
    const freightShare =
      freightTotal > 0 && freightBaseTotal > 0
        ? round(
            freightTotal *
              (fallbackNet > 0 ? netKg / fallbackNet : line.fobTotal / Math.max(totalFob, 1)),
            6
          )
        : 0;

    const insuranceShare =
      insuranceTotal > 0 && totalFob > 0
        ? round(insuranceTotal * (line.fobTotal / totalFob), 6)
        : 0;

    const cif = round(line.fobTotal + freightShare + insuranceShare, 6);
    const surveillanceBase =
      gtip?.surveillance_applicable && netKg > 0
        ? round(toNumber(gtip.surveillance_unit_value) * netKg, 6)
        : 0;
    const customsBase = round(Math.max(cif, surveillanceBase), 6);
    const customsDutyRate = toNumber(gtip?.customs_duty_rate);
    const additionalDutyRate = toNumber(gtip?.additional_duty_rate);
    const vatRate = toNumber(gtip?.vat_rate);
    const customsDuty = round(customsBase * pct(customsDutyRate), 6);
    const additionalDuty = round(customsBase * pct(additionalDutyRate), 6);
    const antiDumping =
      gtip?.anti_dumping_applicable && netKg > 0
        ? round(toNumber(gtip.anti_dumping_rate) * netKg, 6)
        : 0;
    const vatBase = round(customsBase + customsDuty + additionalDuty + antiDumping, 6);
    const vat = round(vatBase * pct(vatRate), 6);
    const totalTaxes = round(customsDuty + additionalDuty + antiDumping + vat, 6);
    const landedTotal = round(cif + totalTaxes, 6);
    const landedUnit = line.quantity > 0 ? round(landedTotal / line.quantity, 6) : 0;

    if (!gtip?.code) warnings.push("GTIP bagli degil");
    if (line.quantity <= 0) warnings.push("Adet eksik");
    if (netKg <= 0) warnings.push("Net agirlik eksik");
    if (gtip?.anti_dumping_applicable && netKg <= 0) warnings.push("Anti-damping icin net agirlik gerekli");
    if (gtip?.surveillance_applicable && netKg <= 0) warnings.push("Gozetim icin net agirlik gerekli");

    return {
      id: line.id,
      code: line.code,
      name: line.name,
      gtipCode: gtip?.code ?? null,
      quantity: line.quantity,
      netKg,
      grossKg,
      unitPrice: line.unitPrice,
      fobTotal: line.fobTotal,
      freightShare,
      insuranceShare,
      extraCostShare: 0,
      stampTaxShare: 0,
      surveillanceUnitValue: toNumber(gtip?.surveillance_unit_value),
      surveillanceApplicable: Boolean(gtip?.surveillance_applicable),
      antiDumpingRate: toNumber(gtip?.anti_dumping_rate),
      antiDumpingApplicable: Boolean(gtip?.anti_dumping_applicable),
      cif,
      surveillanceBase,
      customsBase,
      customsDutyRate,
      customsDuty,
      additionalDutyRate,
      additionalDuty,
      antiDumping,
      vatRate,
      vatBase,
      vat,
      totalTaxes,
      landedTotal,
      landedUnit,
      warnings,
    };
  });

  const totals = lines.reduce(
    (acc, line) => {
      acc.quantity += line.quantity;
      acc.netKg += line.netKg;
      acc.grossKg += line.grossKg;
      acc.fobTotal += line.fobTotal;
      acc.freightShare += line.freightShare;
      acc.insuranceShare += line.insuranceShare;
      acc.cif += line.cif;
      acc.surveillanceBase += line.surveillanceBase;
      acc.customsBase += line.customsBase;
      acc.customsDuty += line.customsDuty;
      acc.additionalDuty += line.additionalDuty;
      acc.antiDumping += line.antiDumping;
      acc.vat += line.vat;
      acc.totalTaxes += line.totalTaxes;
      acc.landedTotal += line.landedTotal;
      return acc;
    },
    {
      quantity: 0,
      netKg: 0,
      grossKg: 0,
      fobTotal: 0,
      freightShare: 0,
      insuranceShare: 0,
      cif: 0,
      surveillanceBase: 0,
      customsBase: 0,
      customsDuty: 0,
      additionalDuty: 0,
      antiDumping: 0,
      vat: 0,
      totalTaxes: 0,
      landedTotal: 0,
    }
  );

  const uniqueWarnings = Array.from(new Set([...currencyWarnings, ...lines.flatMap((line) => line.warnings)]));
  const tcmbRate = await fetchTcmbTryRate(orderCurrency);
  const initialTryRate = tcmbRate.rate && tcmbRate.rate > 0 ? tcmbRate.rate : 1;

  return (
    <section className="space-y-6">
      <div className="rounded-[28px] border border-black/10 bg-[linear-gradient(135deg,#f7faf9_0%,#eef6f3_60%,#f6f2e8_100%)] p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
              <span className="rounded-full bg-black/5 px-3 py-1">Prototype</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">Beyanname Lab q9m2</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-black">
                {order.name ?? order.reference_name ?? "Siparis"}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/60">
                Urun bazli gumruk vergileri, ortak masraf dagitimi ve vergili maliyet prototipi.
                Bu ekran izole kuruldu; begenilmezse tek route olarak kaldirilabilir.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-black/70">
              <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
                Tedarikci: {supplier?.name ?? "-"}
              </span>
              <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
                Siparis para birimi: {orderCurrency}
              </span>
              <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
                Siparis toplami: {formatMoney(order.total_amount, orderCurrency)}
              </span>
              <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1">
                Satir sayisi: {formatNumber(lines.length, 0)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/orders/${order.id}`}
              className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              Siparise don
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Hesap varsayimlari</p>
              <h2 className="mt-2 text-lg font-semibold text-black">Dagitim ve vergi mantigi</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              "Navlun once net agirlik, agirlik yoksa FOB payi ile dagitilir.",
              "Sigorta tum kalemlere FOB payi ile dagitilir.",
              "Vergi matrahi max(CIF, gozetim matrahi) olarak alinmistir.",
              "GV, ilave vergi, anti-damping ve KDV urun satirinda ayri ayri gosterilir.",
            ].map((item) => (
              <div key={item} className="rounded-2xl border border-black/10 bg-[var(--paper)]/65 px-4 py-3 text-sm text-black/70">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <p className="text-[11px] uppercase tracking-[0.24em] text-black/40">Kontrol ozeti</p>
          <div className="mt-4 space-y-3 text-sm text-black/70">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--paper)]/70 px-4 py-3">
              <span>Packing net agirlik</span>
              <span className="font-semibold text-black">{formatNumber(summaryNet)} kg</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--paper)]/70 px-4 py-3">
              <span>Packing brut agirlik</span>
              <span className="font-semibold text-black">{formatNumber(summaryGross)} kg</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--paper)]/70 px-4 py-3">
              <span>Dokumandan gelen navlun</span>
              <span className="font-semibold text-black">{formatMoney(freightTotal, orderCurrency)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-[var(--paper)]/70 px-4 py-3">
              <span>Dokumandan gelen sigorta</span>
              <span className="font-semibold text-black">{formatMoney(insuranceTotal, orderCurrency)}</span>
            </div>
          </div>
          {uniqueWarnings.length ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-800">
                Uyarilar
              </p>
              <ul className="mt-3 space-y-2 text-sm text-amber-900">
                {uniqueWarnings.map((warning) => (
                  <li key={warning}>- {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
      <OrderDeclarationTryLab
        lines={lines}
        orderCurrency={orderCurrency}
        initialRate={initialTryRate}
        initialFreightTotal={freightTotal}
        initialInsuranceTotal={insuranceTotal}
        tcmbDate={tcmbRate.date}
        tcmbError={tcmbRate.error ?? null}
      />
    </section>
  );
}

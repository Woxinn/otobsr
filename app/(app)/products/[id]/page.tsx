import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteProduct } from "@/app/actions/products";
import { computeCosts, pickWeightKg, GtipRow } from "@/lib/gtipCost";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import ProductLiveStockInline from "@/components/ProductLiveStockInline";
import ProductPriceHistoryChart, {
  ProductPriceHistoryPoint,
} from "@/components/ProductPriceHistoryChart";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Factory,
  FileText,
  Package,
  Pencil,
  Scale,
  ShieldCheck,
  ShoppingCart,
  Tags,
} from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select("name, code")
    .eq("id", id)
    .single();
  const title = product?.name || product?.code || "Ürün";
  return { title: `Ürün | ${title}` };
}

const fmt = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const fmtUnitPrice = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};
const fmtPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
};
const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const sectionClass = "rounded-lg border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-sky-50/60 p-3 shadow-sm";
const sectionHeaderClass = "flex flex-wrap items-center justify-between gap-2 border-b border-black/8 pb-2";
const tableLinkButtonClass =
  "rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-semibold text-black/60 transition hover:bg-slate-50";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await getCurrentUserRole(supabase, user);
  const isSales = role === "Satis";
  const canSeeFinance = canViewFinance(role);
  const canEdit = role === "Admin";

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, code, name, brand, description, notes, group_id, unit_price, created_at, gtip_id, domestic_cost_percent, netsis_stok_kodu, gtip:gtips(code)"
    )
    .eq("id", id)
    .single();

  if (!product) {
    return (
      <section className="rounded-lg border border-black/10 bg-white p-3 text-sm text-black/60">
        Ürün bulunamadı.
      </section>
    );
  }

  const stockCode = product.netsis_stok_kodu ? String(product.netsis_stok_kodu).trim() : "";

  const [
    { data: group },
    { data: gtip },
    { data: countryRates },
    { data: attributes },
    { data: values },
    { data: extraAttributes },
    { data: orderItems },
    { data: rfqItems },
    { data: proformaItems },
  ] = await Promise.all([
    product.group_id
      ? supabase
          .from("product_groups")
          .select("id, name")
          .eq("id", product.group_id)
          .single()
      : Promise.resolve({ data: null }),
    product.gtip_id
      ? supabase.from("gtips").select("*").eq("id", product.gtip_id).single()
      : Promise.resolve({ data: null }),
    product.gtip_id
      ? supabase
          .from("gtip_country_rates")
          .select("*")
          .eq("gtip_id", product.gtip_id)
          .order("country")
      : Promise.resolve({ data: [] as any[] }),
    product.group_id
      ? supabase
          .from("product_attributes")
          .select("id, name, unit, value_type, is_required, sort_order")
          .eq("group_id", product.group_id)
          .order("sort_order", { ascending: true })
          .order("name")
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("product_attribute_values")
      .select("attribute_id, value_text, value_number")
      .eq("product_id", product.id),
    supabase
      .from("product_extra_attributes")
      .select("id, name, unit, value_type, value_text, value_number")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("order_items")
      .select(
        "order_id, product_id, unit_price, quantity, orders(id, name, created_at, expected_ready_date, currency, extra_cost_percent, suppliers:orders_supplier_id_fkey(name, country))"
      )
      .eq("product_id", product.id),
    supabase
      .from("rfq_items")
      .select("rfq_id, quantity, rfqs!inner(id, code, title, status, response_due_date, created_at, currency)")
      .eq("product_id", product.id),
    supabase
      .from("proforma_items")
      .select(
        "proforma_id, quantity, line_total, proformas!inner(id, proforma_no, proforma_date, status, created_at, currency, suppliers(name))"
      )
      .eq("product_id", product.id),
  ]);

  const valueByAttribute = new Map(
    (values ?? []).map((value) => [value.attribute_id, value])
  );

  const weightCandidates =
    (attributes ?? []).map((attr) => {
      const v = valueByAttribute.get(attr.id);
      const raw = attr.value_type === "number" ? v?.value_number : v?.value_text;
      return { name: attr.name, value: raw };
    }) ?? [];
  const extraWeightCandidates =
    (extraAttributes ?? []).map((attr) => ({
      name: attr.name,
      value: attr.value_type === "number" ? attr.value_number : attr.value_text,
    })) ?? [];
  const weightKg = pickWeightKg([...weightCandidates, ...extraWeightCandidates] as any[]);

  const standardAttributeCards = (attributes ?? []).map((attr) => {
    const value = valueByAttribute.get(attr.id);
    const rawValue = attr.value_type === "number" ? value?.value_number : value?.value_text;
    const displayValue =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "-"
        : attr.value_type === "number"
        ? Number(rawValue).toLocaleString("tr-TR")
        : String(rawValue);
    return {
      key: `attr-${attr.id}`,
      name: attr.name,
      unit: attr.unit,
      value: displayValue,
    };
  });

  const extraAttributeCards = (extraAttributes ?? []).map((attr) => {
    const rawValue = attr.value_type === "number" ? attr.value_number : attr.value_text;
    const displayValue =
      rawValue === null || rawValue === undefined || rawValue === ""
        ? "-"
        : attr.value_type === "number"
        ? Number(rawValue).toLocaleString("tr-TR")
        : String(rawValue);
    return {
      key: `extra-${attr.id}`,
      name: attr.name,
      unit: attr.unit,
      value: displayValue,
    };
  });

  const mergedAttributeCards = [...standardAttributeCards, ...extraAttributeCards];

  const linkedOrderIds = Array.from(
    new Set((orderItems ?? []).map((item) => item.order_id).filter(Boolean))
  ) as string[];
  const { data: orderShipmentLinks } = linkedOrderIds.length
    ? await supabase
        .from("shipment_orders")
        .select("order_id, shipments(eta_current)")
        .in("order_id", linkedOrderIds)
    : { data: [] as any[] };

  const orderEtaByOrder = new Map<string, string | null>();
  (orderShipmentLinks ?? []).forEach((row: any) => {
    const orderId = row.order_id as string | null;
    if (!orderId) return;
    const shipments = Array.isArray(row.shipments) ? row.shipments : row.shipments ? [row.shipments] : [];
    const etaDates = shipments
      .map((s: any) => s?.eta_current as string | null)
      .filter(Boolean)
      .map((d: string) => new Date(d))
      .filter((d: Date) => !Number.isNaN(d.getTime()));
    if (!etaDates.length) return;
    const earliest = etaDates.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
    const current = orderEtaByOrder.get(orderId);
    if (!current) {
      orderEtaByOrder.set(orderId, earliest.toISOString());
      return;
    }
    const currentDate = new Date(current);
    if (earliest.getTime() < currentDate.getTime()) {
      orderEtaByOrder.set(orderId, earliest.toISOString());
    }
  });

  const linkedOrders = (() => {
    const grouped = new Map<
      string,
        {
          order: any;
          country: string | null;
          supplierName: string | null;
          extraCostPercent: number | null;
          currency: string | null;
          totalQty: number;
          totalAmount: number;
        }
    >();

    (orderItems ?? []).forEach((item) => {
      if (!item.orders) return;
      const order = item.orders as any;
      const orderId = order.id;
      if (!orderId) return;
      const qtyRaw = (item as any).quantity ?? (item as any).packages ?? 0;
      const qty = Number(qtyRaw) || 0;
      const unitPrice = Number(item.unit_price ?? product.unit_price ?? 0) || 0;
      const amount = qty * unitPrice;
        const country = (order as any)?.suppliers?.country ?? null;
        const supplierName = (order as any)?.suppliers?.name ?? null;
        const extraCostPercentRaw = (order as any)?.extra_cost_percent;
        const extraCostPercent =
          extraCostPercentRaw === null || extraCostPercentRaw === undefined
            ? null
            : Number(extraCostPercentRaw);

      const existing = grouped.get(orderId);
      if (existing) {
        existing.totalQty += qty;
        existing.totalAmount += amount;
      } else {
          grouped.set(orderId, {
            order,
            country,
            supplierName,
            currency: order.currency ?? null,
            extraCostPercent:
              Number.isFinite(extraCostPercent) ? extraCostPercent : null,
            totalQty: qty,
            totalAmount: amount,
          });
        }
      });

      const rows = Array.from(grouped.values()).map((entry) => {
      const { order, country, supplierName, extraCostPercent, totalQty, totalAmount } = entry;
      const rateForCountry =
        (countryRates ?? []).find((c) => c.country === country) ?? null;
      const gtipForCost: GtipRow | null = rateForCountry
        ? {
            ...(gtip as any),
            customs_duty_rate: rateForCountry.customs_duty_rate,
            additional_duty_rate: rateForCountry.additional_duty_rate,
            anti_dumping_applicable: rateForCountry.anti_dumping_applicable,
            anti_dumping_rate: rateForCountry.anti_dumping_rate,
            surveillance_applicable: rateForCountry.surveillance_applicable,
            surveillance_unit_value: rateForCountry.surveillance_unit_value,
            vat_rate: rateForCountry.vat_rate,
          }
        : ((gtip as unknown as GtipRow) ?? null);

      const avgUnitPrice =
        totalQty > 0 ? totalAmount / totalQty : product.unit_price ?? null;

      const costs = computeCosts({
        basePrice: avgUnitPrice,
        domesticCostPercent:
          extraCostPercent ?? ((product.domestic_cost_percent as number | null) ?? 0),
        weightKg,
        gtip: gtipForCost,
      });

      const vatRate = 0.2;
      const vatBaseCandidates = [costs.gozetimliMatrah, costs.gozetimsizMatrah].filter(
        (v): v is number => v !== null
      );
      const vatBase = vatBaseCandidates.length ? Math.max(...vatBaseCandidates) : null;
      const grossVatPayable = vatBase !== null ? vatBase * vatRate : null;
      const vatCreditBase =
        costs.araTutar !== null ? (costs.araTutar ?? 0) + (costs.customsFromAra ?? 0) : null;
      const vatCredit = vatCreditBase !== null ? vatCreditBase * vatRate : null;
      const netVatPayable =
        grossVatPayable !== null ? Math.max(grossVatPayable - (vatCredit ?? 0), 0) : null;

      const subtotalBeforeVat =
        (costs.araTutar ?? 0) +
        (costs.customsFromGozetim ?? 0) +
        (costs.addFromGozetim ?? 0) +
        (costs.dumpingTutar ?? 0);
      const kdvBaseCandidates: number[] = [];
      if (costs.gozetimsizMatrah !== null) kdvBaseCandidates.push(costs.gozetimsizMatrah);
      kdvBaseCandidates.push(subtotalBeforeVat);
      const kdvBaz = kdvBaseCandidates.length ? Math.max(...kdvBaseCandidates) : null;
      const addDutyRate = Number((gtipForCost as any)?.additional_duty_rate ?? 0);
      const hasSurveillance = Boolean((gtipForCost as any)?.surveillance_applicable);
      const shouldAddNetVat = addDutyRate > 0 || hasSurveillance;

      const unitCost =
        kdvBaz !== null
          ? shouldAddNetVat
            ? netVatPayable !== null
              ? kdvBaz + netVatPayable
              : null
            : kdvBaz
          : costs.gozetimsizMatrah;

        return {
          id: order.id,
          name: order.name ?? "Sipariş",
          created_at: order.created_at,
          expected_ready_date: order.expected_ready_date,
          shipment_eta: orderEtaByOrder.get(order.id) ?? null,
          country,
          supplier_name: supplierName,
          currency: entry.currency,
          extra_cost_percent: extraCostPercent,
          unit_price: avgUnitPrice,
          quantity: totalQty,
          unitCost,
        };
      });

    return rows.sort((a: any, b: any) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
  })();

  const priceHistory: ProductPriceHistoryPoint[] = linkedOrders
    .filter((item: any) => Number.isFinite(Number(item.unit_price)) && Number(item.unit_price) > 0)
    .map((item: any) => ({
      orderId: item.id,
      orderName: item.name ?? "Sipariş",
      date: item.shipment_eta ?? item.expected_ready_date ?? item.created_at ?? null,
      supplierName: item.supplier_name ?? null,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity ?? 0) || 0,
      currency: item.currency ?? "USD",
    }))
    .sort((a, b) =>
      String(a.date ?? "").localeCompare(String(b.date ?? ""))
    );

  const linkedOrdersWithPrev = linkedOrders.map((item, idx, arr) => {
    const prev = arr[idx + 1];
    const prevUnitCost = prev?.unitCost ?? null;
    const diffPct =
      prevUnitCost && item.unitCost !== null
        ? ((item.unitCost - prevUnitCost) / prevUnitCost) * 100
        : null;
    return { ...item, prevUnitCost, diffPct };
  });

  const warnings: string[] = [];
  if (!product.gtip_id) warnings.push("GTİP bağlı değil");
  if (weightKg === null) warnings.push("Ağırlık bulunamadı (niteliklerden)");

  const linkedRfqs = Array.from(
    (rfqItems ?? []).reduce((acc: Map<string, any>, item: any) => {
      const rfq = Array.isArray(item.rfqs) ? item.rfqs[0] : item.rfqs;
      if (!rfq?.id) return acc;
      const key = String(rfq.id);
      const qty = Number(item.quantity ?? 0);
      const current = acc.get(key);
      if (current) {
        current.totalQty += qty;
      } else {
        acc.set(key, { ...rfq, totalQty: qty });
      }
      return acc;
    }, new Map<string, any>()).values()
  ).sort((a: any, b: any) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  );

  const linkedProformas = Array.from(
    (proformaItems ?? []).reduce((acc: Map<string, any>, item: any) => {
      const proforma = Array.isArray(item.proformas) ? item.proformas[0] : item.proformas;
      if (!proforma?.id) return acc;
      const key = String(proforma.id);
      const qty = Number(item.quantity ?? 0);
      const amount = Number(item.line_total ?? 0);
      const current = acc.get(key);
      if (current) {
        current.totalQty += qty;
        current.totalAmount += amount;
      } else {
        acc.set(key, { ...proforma, totalQty: qty, totalAmount: amount });
      }
      return acc;
    }, new Map<string, any>()).values()
  ).sort((a: any, b: any) =>
    String(b.proforma_date ?? b.created_at ?? "").localeCompare(String(a.proforma_date ?? a.created_at ?? ""))
  );

  const invoiceQtyTotal = (orderItems ?? []).reduce((sum: number, item: any) => {
    const qtyRaw = (item as any).quantity ?? (item as any).packages ?? 0;
    return sum + (Number(qtyRaw) || 0);
  }, 0);
  const proformaQtyTotal = linkedProformas.reduce(
    (sum: number, item: any) => sum + (Number(item.totalQty ?? 0) || 0),
    0
  );
  const stillInProductionTotal = Math.max(proformaQtyTotal - invoiceQtyTotal, 0);

  const stillInProductionRows = (() => {
    if (!linkedProformas.length || stillInProductionTotal <= 0) return [] as any[];
    const fifo = [...linkedProformas].sort((a: any, b: any) =>
      String(a.proforma_date ?? a.created_at ?? "").localeCompare(String(b.proforma_date ?? b.created_at ?? ""))
    );
    let remainingInvoicePool = invoiceQtyTotal;
    const rows: any[] = [];
    for (const item of fifo) {
      const qty = Number(item.totalQty ?? 0) || 0;
      const consumed = Math.min(qty, Math.max(remainingInvoicePool, 0));
      remainingInvoicePool -= consumed;
      const openQty = qty - consumed;
      if (openQty > 0) rows.push({ ...item, openQty });
    }
    return rows.sort((a: any, b: any) =>
      String(b.proforma_date ?? b.created_at ?? "").localeCompare(String(a.proforma_date ?? a.created_at ?? ""))
    );
  })();

  const productGtipCode =
    (Array.isArray((product as any).gtip)
      ? (product as any).gtip[0]?.code
      : (product as any).gtip?.code) ?? null;
  const latestPricePoint = priceHistory[priceHistory.length - 1] ?? null;
  const latestLinkedOrder = linkedOrders[0] ?? null;
  const latestUnitCost = latestLinkedOrder?.unitCost ?? null;
  const openProductionRatio =
    proformaQtyTotal > 0 ? Math.min(100, (stillInProductionTotal / proformaQtyTotal) * 100) : 0;
  const quickStats = [
    {
      label: "Canlı stok",
      value: stockCode ? "Aktif" : "Kod yok",
      helper: stockCode || "Netsis kodu yok",
      icon: Package,
      tone: "border-sky-200 bg-sky-50 text-sky-950",
    },
    ...(canSeeFinance
      ? [
          {
            label: "Son alış",
            value: latestPricePoint
              ? `${fmtUnitPrice(latestPricePoint.unitPrice)} ${latestPricePoint.currency ?? "USD"}`
              : product.unit_price
                ? `${fmtUnitPrice(product.unit_price)} USD`
                : "-",
            helper: latestPricePoint ? fmtDate(latestPricePoint.date) : "Ürün kartı fiyatı",
            icon: BarChart3,
            tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
          },
          {
            label: "KDV'siz maliyet",
            value: fmt(latestUnitCost),
            helper: latestLinkedOrder?.supplier_name ?? "Son siparişe göre",
            icon: Scale,
            tone: "border-amber-200 bg-amber-50 text-amber-950",
          },
        ]
      : []),
    {
      label: "Üretimde",
      value: fmt(stillInProductionTotal),
      helper: `Proforma ${fmt(proformaQtyTotal)} / Fatura ${fmt(invoiceQtyTotal)}`,
      icon: Factory,
      tone: "border-orange-200 bg-orange-50 text-orange-950",
    },
    {
      label: "Uyumluluk",
      value: productGtipCode ? productGtipCode : "GTİP yok",
      helper: `${(countryRates ?? []).length} ülke oranı`,
      icon: ShieldCheck,
      tone: productGtipCode
        ? "border-teal-200 bg-teal-50 text-teal-950"
        : "border-rose-200 bg-rose-50 text-rose-950",
    },
  ];
  const cockpitLinks = [
    {
      label: "Sipariş",
      value: linkedOrders.length,
      href: "#orders",
      icon: ShoppingCart,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
      iconTone: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "RFQ",
      value: linkedRfqs.length,
      href: "#rfqs",
      icon: ClipboardList,
      tone: "border-cyan-200 bg-cyan-50 text-cyan-950",
      iconTone: "bg-cyan-100 text-cyan-700",
    },
    {
      label: "Proforma",
      value: linkedProformas.length,
      href: "#proformas",
      icon: FileText,
      tone: "border-orange-200 bg-orange-50 text-orange-950",
      iconTone: "bg-orange-100 text-orange-700",
    },
    {
      label: "Nitelik",
      value: mergedAttributeCards.length,
      href: "#attributes",
      icon: Tags,
      tone: "border-sky-200 bg-sky-50 text-sky-950",
      iconTone: "bg-sky-100 text-sky-700",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="rounded-lg border border-teal-200/40 bg-[linear-gradient(135deg,#113b5a_0%,#15736f_48%,#df9a57_100%)] p-3 text-white shadow-[0_24px_70px_-50px_rgba(21,115,111,0.9)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 max-w-4xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">
              Ürün Kokpiti
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-white/20 bg-white/15 px-2.5 py-1 text-xs font-bold text-white/78">
                {product.code}
              </span>
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1 text-xs font-semibold text-white/68">
                {product.brand ?? "Marka yok"}
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold leading-tight [font-family:var(--font-display)]">
              {product.name}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-white/62 line-clamp-2">
              {product.description ?? product.notes ?? "Ürün açıklaması veya operasyon notu yok."}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-white/68">
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1">
                Grup: {group?.name ?? "Yok"}
              </span>
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1">
                GTİP: {productGtipCode ?? "-"}
              </span>
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1">
                Stok kodu: {product.netsis_stok_kodu ?? "-"}
              </span>
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1">
                Ağırlık: {weightKg !== null ? `${fmt(weightKg)} kg` : "-"}
              </span>
              <span className="rounded-lg border border-white/20 bg-white/12 px-2.5 py-1">
                Canlı stok:{" "}
                <ProductLiveStockInline stockCode={stockCode || null} />
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
            {canSeeFinance ? (
              <Link
                href={`/products/${product.id}/costs`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-teal-950 transition hover:-translate-y-0.5"
              >
                <Scale className="h-3.5 w-3.5" />
                Maliyet
              </Link>
            ) : null}
            {canEdit ? (
              <>
                <Link
                  href={`/products/${product.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/12 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/18"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Düzenle
                </Link>
                <ConfirmActionForm
                  action={deleteProduct}
                  confirmText="Ürün silinsin mi? Bu işlem geri alınamaz."
                  buttonText="Sil"
                  className="inline"
                  buttonClassName="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/30 bg-rose-400/15 px-2.5 py-1.5 text-xs font-semibold text-rose-50 transition hover:-translate-y-0.5 hover:bg-rose-400/25"
                >
                  <input type="hidden" name="product_id" value={product.id} />
                </ConfirmActionForm>
              </>
            ) : null}
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/12 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/18"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Liste
            </Link>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {quickStats.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`rounded-lg border px-2.5 py-2 ${item.tone}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.2em] opacity-60">
                      {item.label}
                    </p>
                    <p className="mt-1 truncate text-base font-semibold">{item.value}</p>
                  </div>
                  <span className="rounded-md bg-white/75 p-1.5 shadow-sm ring-1 ring-black/5">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium opacity-65">{item.helper}</p>
              </div>
            );
          })}
        </div>
      </div>

      {!isSales && warnings.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Eksikler: {warnings.join(", ")}
          </div>
        </div>
      ) : null}

      <div className="grid gap-2 md:grid-cols-4">
        {cockpitLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`rounded-lg border px-2.5 py-2 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${item.tone}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] opacity-55">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold">{item.value}</p>
                </div>
                <span className={`rounded-md p-1.5 ${item.iconTone}`}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <section id="attributes" className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 shadow-sm">
        <div className={sectionHeaderClass}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-sky-700/60">
              Teknik
            </p>
            <h2 className="mt-0.5 text-lg font-semibold [font-family:var(--font-display)]">
              Nitelikler
            </h2>
          </div>
          <span className="rounded-lg border border-sky-200 bg-white/75 px-2.5 py-1 text-xs font-semibold text-sky-800">
            {mergedAttributeCards.length} alan
          </span>
        </div>
        {mergedAttributeCards.length ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {mergedAttributeCards.map((attr) => (
              <div key={attr.key} className="rounded-lg border border-sky-100 bg-white/75 px-2.5 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700/55">
                  {attr.name}
                  {attr.unit ? ` (${attr.unit})` : ""}
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-black">{attr.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Kategori seçilmedi veya nitelik yok.
          </div>
        )}
      </section>

      <section id="orders" className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm">
        <div className={sectionHeaderClass}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-700/60">
              Operasyon
            </p>
            <h2 className="mt-0.5 text-lg font-semibold [font-family:var(--font-display)]">
              Bağlı siparişler
            </h2>
          </div>
          <span className="rounded-lg border border-emerald-200 bg-white/75 px-2.5 py-1 text-xs font-semibold text-emerald-800">
            {linkedOrders.length} sipariş
          </span>
        </div>
        {linkedOrders.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.22em] text-emerald-800/55">
                <tr>
                  <th className="px-2.5 py-1.5">Sipariş</th>
                  <th className="px-2.5 py-1.5">ETA</th>
                  {canSeeFinance ? <th className="px-2.5 py-1.5 text-right">Birim fiyat</th> : null}
                  <th className="px-2.5 py-1.5 text-right">Adet</th>
                  {role !== "Satis" ? <th className="px-2.5 py-1.5">Tedarikçi</th> : null}
                  <th className="px-2.5 py-1.5">Ülke</th>
                  {canSeeFinance ? <th className="px-2.5 py-1.5 text-right">Birim maliyet</th> : null}
                  {canSeeFinance ? <th className="px-2.5 py-1.5 text-right">Fark</th> : null}
                  <th className="px-2.5 py-1.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="text-black/70">
                {linkedOrdersWithPrev.map((linked, idx) => (
                  <tr key={linked.id} className={idx % 2 === 0 ? "bg-white/75" : "bg-emerald-50/55"}>
                    <td className="border-t border-black/6 px-2.5 py-1.5 font-semibold text-black">
                      {linked.name ?? "Sipariş"}
                    </td>
                    <td className="border-t border-black/6 px-2.5 py-1.5">{fmtDate(linked.shipment_eta)}</td>
                    {canSeeFinance ? (
                      <td className="border-t border-black/6 px-2.5 py-1.5 text-right">{fmtUnitPrice(linked.unit_price)}</td>
                    ) : null}
                    <td className="border-t border-black/6 px-2.5 py-1.5 text-right">{linked.quantity ?? "-"}</td>
                    {role !== "Satis" ? (
                      <td className="border-t border-black/6 px-2.5 py-1.5">{linked.supplier_name ?? "-"}</td>
                    ) : null}
                    <td className="border-t border-black/6 px-2.5 py-1.5">{linked.country ?? "-"}</td>
                    {canSeeFinance ? (
                      <td className="border-t border-black/6 px-2.5 py-1.5 text-right font-semibold text-black">
                        {fmt(linked.unitCost)}
                      </td>
                    ) : null}
                    {canSeeFinance ? (
                      <td className="border-t border-black/6 px-2.5 py-1.5 text-right">
                        <span
                          className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold ${
                            linked.diffPct === null
                              ? "bg-slate-100 text-black/50"
                              : linked.diffPct > 0
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {fmtPercent(linked.diffPct)}
                        </span>
                      </td>
                    ) : null}
                    <td className="border-t border-black/6 px-2.5 py-1.5 text-right">
                      <Link href={`/orders/${linked.id}`} className={tableLinkButtonClass}>
                        Detay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-black/45">
              Birim maliyet son sipariş fiyatı, ülke bazlı GTİP oranları ve yurtiçi masraf bilgisiyle hesaplanır.
            </p>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-sm text-emerald-900/70">
            Henüz bu ürüne bağlı sipariş yok.
          </div>
        )}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70 pb-2">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-amber-800/65">
                Üretim
              </p>
              <h2 className="mt-0.5 text-lg font-semibold [font-family:var(--font-display)]">
                Üretimde kalan
              </h2>
            </div>
            <span className="rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1 text-xs font-semibold text-amber-900">
              {fmt(stillInProductionTotal)}
            </span>
          </div>
          <div className="mt-2.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-amber-600"
                style={{ width: `${Math.max(4, openProductionRatio)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs font-medium text-amber-900/75">
              Proforma {fmt(proformaQtyTotal)} / Fatura {fmt(invoiceQtyTotal)}
            </p>
          </div>
          {stillInProductionRows.length ? (
            <div className="mt-2.5 space-y-1.5">
              {stillInProductionRows.slice(0, 6).map((item: any) => (
                <Link
                  key={`in-production-${item.id}`}
                  href={`/proformalar/${item.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white/75 px-2.5 py-1.5 text-sm transition hover:bg-white"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-black">{item.proforma_no ?? "-"}</span>
                    <span className="block truncate text-xs text-black/50">{item?.suppliers?.name ?? "-"}</span>
                  </span>
                  <span className="text-sm font-semibold text-amber-800">{fmt(item.openQty)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
              Açıkta kalan ürün yok.
            </div>
          )}
        </div>

        <div id="rfqs" className="rounded-lg border border-cyan-200 bg-cyan-50/55 p-3 shadow-sm">
          <div className={sectionHeaderClass}>
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-cyan-700/60">
                Satınalma
              </p>
              <h2 className="mt-0.5 text-lg font-semibold [font-family:var(--font-display)]">
                Bağlı RFQ'lar
              </h2>
            </div>
            <span className="rounded-lg border border-cyan-200 bg-white/75 px-2.5 py-1 text-xs font-semibold text-cyan-800">
              {linkedRfqs.length} RFQ
            </span>
          </div>
          {linkedRfqs.length ? (
            <div className="mt-2 grid gap-1.5">
              {linkedRfqs.slice(0, 8).map((rfq: any) => (
                <Link
                  key={rfq.id}
                  href={`/rfqs/${rfq.id}`}
                  className="grid gap-2 rounded-lg border border-cyan-100 bg-white/75 px-2.5 py-1.5 text-sm transition hover:bg-white hover:shadow-sm sm:grid-cols-[1fr_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-black">{rfq.code ?? "-"}</span>
                    <span className="block truncate text-xs text-black/50">{rfq.title ?? "-"}</span>
                  </span>
                  <span className="self-center rounded-md border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
                    {fmt(rfq.totalQty)} adet
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-2 rounded-lg border border-cyan-200 bg-white/70 px-3 py-2 text-sm text-cyan-900/70">
              Henüz bu ürüne bağlı RFQ yok.
            </div>
          )}
        </div>
      </section>

      <section id="proformas" className="rounded-lg border border-orange-200 bg-orange-50/50 p-3 shadow-sm">
        <div className={sectionHeaderClass}>
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-orange-700/60">
              Proforma
            </p>
            <h2 className="mt-0.5 text-lg font-semibold [font-family:var(--font-display)]">
              Bağlı proformalar
            </h2>
          </div>
          <span className="rounded-lg border border-orange-200 bg-white/75 px-2.5 py-1 text-xs font-semibold text-orange-800">
            {linkedProformas.length} proforma
          </span>
        </div>
        {linkedProformas.length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.22em] text-orange-800/55">
                <tr>
                  <th className="px-2.5 py-1.5">Proforma</th>
                  <th className="px-2.5 py-1.5">Tedarikçi</th>
                  <th className="px-2.5 py-1.5">Durum</th>
                  <th className="px-2.5 py-1.5">Tarih</th>
                  <th className="px-2.5 py-1.5 text-right">Adet</th>
                  {canSeeFinance ? <th className="px-2.5 py-1.5 text-right">Tutar</th> : null}
                  <th className="px-2.5 py-1.5 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="text-black/70">
                {linkedProformas.map((proforma: any, idx: number) => (
                  <tr key={proforma.id} className={idx % 2 === 0 ? "bg-white/75" : "bg-orange-50/55"}>
                    <td className="border-t border-black/6 px-2.5 py-1.5 font-semibold text-black">{proforma.proforma_no ?? "-"}</td>
                    <td className="border-t border-black/6 px-2.5 py-1.5">{proforma?.suppliers?.name ?? "-"}</td>
                    <td className="border-t border-black/6 px-2.5 py-1.5 capitalize">{proforma.status ?? "-"}</td>
                    <td className="border-t border-black/6 px-2.5 py-1.5">{fmtDate(proforma.proforma_date)}</td>
                    <td className="border-t border-black/6 px-2.5 py-1.5 text-right">{fmt(proforma.totalQty)}</td>
                    {canSeeFinance ? (
                      <td className="border-t border-black/6 px-2.5 py-1.5 text-right">
                        {fmt(proforma.totalAmount)} {proforma.currency ?? ""}
                      </td>
                    ) : null}
                    <td className="border-t border-black/6 px-2.5 py-1.5 text-right">
                      <Link href={`/proformalar/${proforma.id}`} className={tableLinkButtonClass}>
                        Detay
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-orange-200 bg-white/70 px-3 py-2 text-sm text-orange-900/70">
            Henüz bu ürüne bağlı proforma yok.
          </div>
        )}
      </section>

      {canSeeFinance ? (
        <ProductPriceHistoryChart data={priceHistory} />
      ) : null}
    </section>
  );

}

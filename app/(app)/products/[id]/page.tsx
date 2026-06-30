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
import ProductNotesWidget from "@/components/ProductNotesWidget";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  Factory,
  MapPin,
  Package,
  Pencil,
  Scale,
  ShieldCheck,
  Truck,
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

const sectionClass = "rounded-xl border border-slate-100 bg-white p-5 shadow-sm";
const sectionHeaderClass = "flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3";
const tableLinkButtonClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-800";

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
    groupRes,
    gtipRes,
    countryRatesRes,
    attributesRes,
    valuesRes,
    extraAttributesRes,
    orderItemsRes,
    rfqItemsRes,
    proformaItemsRes,
    productNotesRes,
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
        "order_id, product_id, unit_price, quantity, orders(id, name, order_status, created_at, expected_ready_date, currency, extra_cost_percent, archived_at, suppliers:orders_supplier_id_fkey(name, country))"
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
    supabase
      .from("product_notes")
      .select("id, product_id, content, created_at, updated_at")
      .eq("product_id", product.id)
      .order("created_at", { ascending: false }),
  ]);

  const group = groupRes?.data;
  const gtip = gtipRes?.data;
  const countryRates = countryRatesRes?.data ?? [];
  const attributes = attributesRes?.data ?? [];
  const values = valuesRes?.data ?? [];
  const extraAttributes = extraAttributesRes?.data ?? [];
  const orderItems = orderItemsRes?.data ?? [];
  const rfqItems = rfqItemsRes?.data ?? [];
  const proformaItems = proformaItemsRes?.data ?? [];
  const productNotes = productNotesRes?.data ?? [];

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
        .select("order_id, shipments(id, file_no, status, eta_current, warehouse_delivery_date, container_no, origin_port:ports!origin_port_id(name), destination_port:ports!destination_port_id(name))")
        .in("order_id", linkedOrderIds)
    : { data: [] as any[] };

  const orderEtaByOrder = new Map<string, string | null>();
  const productQtyByOrder = new Map<string, number>();

  (orderItems ?? []).forEach((item) => {
    if (item.order_id) {
      const qty = Number(item.quantity) || 0;
      productQtyByOrder.set(item.order_id, (productQtyByOrder.get(item.order_id) ?? 0) + qty);
    }
  });

  const transitShipmentMap = new Map<string, {
    id: string;
    file_no: string;
    status: string | null;
    orderStatus: string | null;
    eta_current: string | null;
    container_no: string | null;
    origin_port: string | null;
    destination_port: string | null;
    totalQty: number;
    orders: { id: string; name: string; quantity: number; status: string | null }[];
  }>();

  (orderShipmentLinks ?? []).forEach((row: any) => {
    const orderId = row.order_id as string | null;
    if (!orderId) return;
    const orderQty = productQtyByOrder.get(orderId) ?? 0;

    const shipments = Array.isArray(row.shipments) ? row.shipments : row.shipments ? [row.shipments] : [];
    
    // ETA mapping
    const etaDates = shipments
      .map((s: any) => s?.eta_current as string | null)
      .filter(Boolean)
      .map((d: string) => new Date(d))
      .filter((d: Date) => !Number.isNaN(d.getTime()));
    if (etaDates.length) {
      const earliest = etaDates.sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
      const current = orderEtaByOrder.get(orderId);
      if (!current) {
        orderEtaByOrder.set(orderId, earliest.toISOString());
      } else {
        const currentDate = new Date(current);
        if (earliest.getTime() < currentDate.getTime()) {
          orderEtaByOrder.set(orderId, earliest.toISOString());
        }
      }
    }

    // Transit tracking
    shipments.forEach((shipment: any) => {
      if (shipment?.eta_current && !shipment.warehouse_delivery_date) {
        const orderItem = (orderItems ?? []).find(item => item.order_id === orderId);
        const orderObj = Array.isArray(orderItem?.orders) 
          ? orderItem.orders[0] 
          : (orderItem?.orders as any);
        
        // Skip archived orders for transit tracking
        if (orderObj?.archived_at) return;

        const shipId = shipment.id as string;
        const existing = transitShipmentMap.get(shipId);
        const orderName = orderObj?.name ?? "Sipariş";
        const orderStatus = orderObj?.order_status ?? null;

        if (existing) {
          if (orderQty > 0) {
            existing.totalQty += orderQty;
            if (!existing.orders.some(o => o.id === orderId)) {
              existing.orders.push({ id: orderId, name: orderName, quantity: orderQty, status: orderStatus });
            }
          }
        } else {
          transitShipmentMap.set(shipId, {
            id: shipId,
            file_no: shipment.file_no ?? "Sevkiyat",
            status: shipment.status ?? null,
            orderStatus: orderStatus,
            eta_current: shipment.eta_current ?? null,
            container_no: shipment.container_no ?? null,
            origin_port: shipment.origin_port?.name ?? null,
            destination_port: shipment.destination_port?.name ?? null,
            totalQty: orderQty,
            orders: orderQty > 0 ? [{ id: orderId, name: orderName, quantity: orderQty, status: orderStatus }] : [],
          });
        }
      }
    });
  });

  const transitShipmentsList = Array.from(transitShipmentMap.values()).sort((a, b) => {
    return String(a.eta_current ?? "").localeCompare(String(b.eta_current ?? ""));
  });

  const transitQtyTotal = transitShipmentsList.reduce((sum, item) => sum + item.totalQty, 0);

  const getDaysRemaining = (etaStr: string | null | undefined) => {
    if (!etaStr) return null;
    const etaDate = new Date(etaStr);
    if (Number.isNaN(etaDate.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eta = new Date(etaDate);
    eta.setHours(0, 0, 0, 0);
    const diffTime = eta.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getOrderStepIndex = (status: string | null) => {
    const norm = (status ?? "").toLowerCase().trim();
    if (norm.includes("siparis verildi") || norm.includes("sipariş verildi")) return 0;
    if (norm.includes("proforma geldi")) return 1;
    if (norm.includes("uretimde") || norm.includes("üretimde")) return 2;
    if (norm.includes("hazir") || norm.includes("hazır")) return 3;
    if (norm.includes("kalkis") || norm.includes("kalkış")) return 4;
    if (norm.includes("deniz")) return 5;
    if (norm.includes("varis") || norm.includes("varış")) return 6;
    if (norm.includes("gumruk") || norm.includes("gümrük")) return 7;
    if (norm.includes("depoya teslim") || norm.includes("depoda") || norm.includes("teslim edildi")) return 8;
    return 0;
  };

  const orderSteps = [
    { label: "Sipariş" },
    { label: "Proforma" },
    { label: "Üretim" },
    { label: "Hazır" },
    { label: "Liman" },
    { label: "Denizde" },
    { label: "Varış" },
    { label: "Gümrük" },
    { label: "Teslim" }
  ];

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
      bg: "bg-sky-50/50 border-sky-100/60 text-sky-950",
      iconBg: "bg-sky-100/80 text-sky-700",
      helperColor: "text-sky-700/80",
    },
    {
      label: "Yolda (Transit)",
      value: transitQtyTotal > 0 ? `${fmt(transitQtyTotal)} adet` : "0",
      helper: transitShipmentsList.length > 0
        ? `En erken ETA: ${fmtDate(transitShipmentsList[0].eta_current)}`
        : "Yolda ürün yok",
      icon: Truck,
      bg: "bg-indigo-50/50 border-indigo-100/60 text-indigo-950",
      iconBg: "bg-indigo-100/80 text-indigo-700",
      helperColor: "text-indigo-700/80",
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
            bg: "bg-emerald-50/50 border-emerald-100/60 text-emerald-950",
            iconBg: "bg-emerald-100/80 text-emerald-700",
            helperColor: "text-emerald-700/80",
          },
          {
            label: "KDV'siz maliyet",
            value: fmt(latestUnitCost),
            helper: latestLinkedOrder?.supplier_name ?? "Son siparişe göre",
            icon: Scale,
            bg: "bg-amber-50/50 border-amber-100/60 text-amber-950",
            iconBg: "bg-amber-100/80 text-amber-700",
            helperColor: "text-amber-700/80",
          },
        ]
      : []),
    {
      label: "Üretimde",
      value: fmt(stillInProductionTotal),
      helper: `Proforma ${fmt(proformaQtyTotal)} / Fatura ${fmt(invoiceQtyTotal)}`,
      icon: Factory,
      bg: "bg-orange-50/50 border-orange-100/60 text-orange-950",
      iconBg: "bg-orange-100/80 text-orange-700",
      helperColor: "text-orange-700/80",
    },
    {
      label: "Uyumluluk",
      value: productGtipCode ? productGtipCode : "GTİP yok",
      helper: `${(countryRates ?? []).length} ülke oranı`,
      icon: ShieldCheck,
      bg: productGtipCode
        ? "bg-teal-50/50 border-teal-100/60 text-teal-950"
        : "bg-rose-50/50 border-rose-100/60 text-rose-950",
      iconBg: productGtipCode
        ? "bg-teal-100/80 text-teal-700"
        : "bg-rose-100/80 text-rose-700",
      helperColor: productGtipCode ? "text-teal-700/80" : "text-rose-700/80",
    },
  ];

  return (
    <section className="space-y-4 bg-slate-50/40 p-2 rounded-2xl">
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm border-l-4 border-l-[#15736f]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
              <Link href="/products" className="hover:text-slate-600 transition">Ürünler</Link>
              <span>/</span>
              <span className="text-slate-600">Ürün Detayı</span>
            </div>
            
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                {product.code}
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                {product.brand ?? "Marka yok"}
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-bold leading-tight text-slate-900 [font-family:var(--font-display)]">
              {product.name}
            </h1>

            <p className="mt-2 text-sm leading-6 text-slate-500">
              {product.description ?? "Ürün açıklaması yok."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {canSeeFinance ? (
              <Link
                href={`/products/${product.id}/costs`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
              >
                <Scale className="h-3.5 w-3.5 text-slate-500" />
                Maliyet Hesaplayıcı
              </Link>
            ) : null}
            {canEdit ? (
              <>
                <Link
                  href={`/products/${product.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#101817]/10 bg-[#101817] px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#182322]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Düzenle
                </Link>
                <ConfirmActionForm
                  action={deleteProduct}
                  confirmText="Ürün silinsin mi? Bu işlem geri alınamaz."
                  buttonText="Sil"
                  className="inline"
                  buttonClassName="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:-translate-y-0.5 hover:bg-rose-100"
                >
                  <input type="hidden" name="product_id" value={product.id} />
                </ConfirmActionForm>
              </>
            ) : null}
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
              Liste
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {quickStats.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${item.bg}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.2em] font-bold opacity-60">
                      {item.label}
                    </p>
                    <p className="mt-2 truncate text-base font-bold leading-none">
                      {item.value}
                    </p>
                  </div>
                  <span className={`rounded-lg p-2 ${item.iconBg}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
                <p className={`mt-2.5 truncate text-xs font-semibold ${item.helperColor}`}>{item.helper}</p>
              </div>
            );
          })}
        </div>
      </div>

      {!isSales && warnings.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 shadow-sm flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Eksikler: {warnings.join(", ")}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px]">
        {/* LEFT COLUMN: Actions and Tables */}
        <div className="space-y-5 min-w-0">
          {/* Yoldaki Sevkiyatlar Takip Paneli */}
          {transitShipmentsList.length > 0 && (
            <section className={`${sectionClass} border-t-4 border-t-indigo-600 overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-50 p-1.5 text-indigo-700">
                    <Truck className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                      Lojistik Takip
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                      Yoldaki Ürünler ve Sevkiyat Durumu
                    </h2>
                  </div>
                </div>
                <div className="rounded-lg px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100">
                  Toplam {fmt(transitQtyTotal)} adet yolda
                </div>
              </div>
              <div className="mt-5 space-y-6">
                {transitShipmentsList.map((shipment) => {
                  const stepIndex = getOrderStepIndex(shipment.orderStatus);
                  const days = getDaysRemaining(shipment.eta_current);
                  
                  return (
                    <div 
                      key={shipment.id} 
                      className="rounded-xl border border-slate-100 bg-slate-50/20 p-5 hover:border-slate-200 hover:shadow-sm transition"
                    >
                      {/* Üst Bilgi Satırı */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-slate-100/60 pb-4">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link 
                              href={`/shipments/${shipment.id}`}
                              className="text-sm font-bold text-indigo-700 hover:text-indigo-800 hover:underline flex items-center gap-1"
                            >
                              {shipment.file_no}
                            </Link>
                            {shipment.container_no && (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                Konteyner: {shipment.container_no}
                              </span>
                            )}
                            {shipment.orderStatus && (
                              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 border border-indigo-100">
                                {shipment.orderStatus}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                            <MapPin className="h-3.5 w-3.5 text-slate-400" />
                            <span>{shipment.origin_port ?? "Bilinmeyen Liman"}</span>
                            <ArrowRight className="h-3 w-3 text-slate-450" />
                            <span>{shipment.destination_port ?? "Bilinmeyen Liman"}</span>
                          </div>
                        </div>

                        <div className="text-left sm:text-right space-y-1">
                          <span className="text-xs font-medium text-slate-400 block">Planlanan Varış (ETA)</span>
                          <div className="flex items-center gap-2 sm:justify-end">
                            <span className="text-sm font-bold text-slate-800 flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-slate-400" />
                              {fmtDate(shipment.eta_current)}
                            </span>
                            {days !== null && (
                              days > 0 ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                                  {days} gün kaldı
                                </span>
                              ) : days === 0 ? (
                                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                                  Bugün varış
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                                  Gecikti ({Math.abs(days)} gün)
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Miktar ve Bağlantı */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-slate-600 font-medium">
                          Bu Sevkiyattaki Ürün Miktarı:{" "}
                          <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-100/50 rounded-lg px-2.5 py-1 inline-block ml-1">
                            {fmt(shipment.totalQty)} adet
                          </span>
                        </div>
                        {shipment.orders.length > 0 && (
                          <div className="text-xs text-slate-400">
                            Sipariş: {shipment.orders.map(o => o.name).join(", ")}
                          </div>
                        )}
                      </div>

                      {/* Stepper Durum Çubuğu */}
                      <div className="mt-6 pt-2">
                        <div className="relative">
                          {/* Arka plan çizgisi */}
                          <div className="absolute top-1/2 left-0 right-0 h-1 bg-slate-100 -translate-y-1/2 z-0 rounded-full" />
                          {/* İlerleme çizgisi */}
                          <div 
                            className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-teal-500 to-indigo-600 -translate-y-1/2 z-0 rounded-full transition-all duration-500"
                            style={{ width: `${(stepIndex / 8) * 100}%` }}
                          />

                          {/* İlerleme Adımları */}
                          <div className="relative z-10 flex justify-between">
                            {orderSteps.map((step, idx) => {
                              const isCompleted = idx <= stepIndex;
                              const isCurrent = idx === stepIndex;
                              
                              return (
                                <div key={idx} className="flex flex-col items-center">
                                  <div 
                                    className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-sm transition-all duration-300 ${
                                      isCurrent 
                                        ? "border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100" 
                                        : isCompleted 
                                          ? "border-teal-500 bg-teal-500 text-white" 
                                          : "border-slate-200 bg-white text-slate-400"
                                    }`}
                                    title={step.label}
                                  >
                                    {idx + 1}
                                  </div>
                                  <span className={`mt-2 text-[9px] font-bold uppercase tracking-wider hidden sm:block ${
                                    isCurrent ? "text-indigo-600 font-extrabold" : isCompleted ? "text-slate-700 font-semibold" : "text-slate-400"
                                  }`}>
                                    {step.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section id="orders" className={`${sectionClass} border-t-4 border-t-emerald-600`}>
            <div className={sectionHeaderClass}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Operasyon
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Bağlı Siparişler
                </h2>
              </div>
              <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                {linkedOrders.length} sipariş
              </span>
            </div>
            {linkedOrders.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-[0.22em] text-slate-400 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-3">Sipariş</th>
                      <th className="px-3 py-3">ETA</th>
                      {canSeeFinance ? <th className="px-3 py-3 text-right">Birim fiyat</th> : null}
                      <th className="px-3 py-3 text-right">Adet</th>
                      {role !== "Satis" ? <th className="px-3 py-3">Tedarikçi</th> : null}
                      <th className="px-3 py-3">Ülke</th>
                      {canSeeFinance ? <th className="px-3 py-3 text-right">Birim maliyet</th> : null}
                      {canSeeFinance ? <th className="px-3 py-3 text-right">Fark</th> : null}
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {linkedOrdersWithPrev.map((linked) => (
                      <tr key={linked.id} className="group hover:bg-slate-50 transition">
                        <td className="px-3 py-3 font-semibold text-slate-900 group-hover:text-black">
                          {linked.name ?? "Sipariş"}
                        </td>
                        <td className="px-3 py-3">{fmtDate(linked.shipment_eta)}</td>
                        {canSeeFinance ? (
                          <td className="px-3 py-3 text-right font-medium text-slate-700">{fmtUnitPrice(linked.unit_price)}</td>
                        ) : null}
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">{linked.quantity ?? "-"}</td>
                        {role !== "Satis" ? (
                          <td className="px-3 py-3 truncate max-w-[150px]">{linked.supplier_name ?? "-"}</td>
                        ) : null}
                        <td className="px-3 py-3">{linked.country ?? "-"}</td>
                        {canSeeFinance ? (
                          <td className="px-3 py-3 text-right font-semibold text-slate-900">
                            {fmt(linked.unitCost)}
                          </td>
                        ) : null}
                        {canSeeFinance ? (
                          <td className="px-3 py-3 text-right">
                            <span
                              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                                linked.diffPct === null
                                  ? "bg-slate-50 text-slate-400"
                                  : linked.diffPct > 0
                                    ? "bg-rose-50 text-rose-600 border border-rose-100"
                                    : "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              }`}
                            >
                              {fmtPercent(linked.diffPct)}
                            </span>
                          </td>
                        ) : null}
                        <td className="px-3 py-3 text-right">
                          <Link href={`/orders/${linked.id}`} className={tableLinkButtonClass}>
                            Detay
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-4 text-xs text-slate-400">
                  * Birim maliyet son sipariş fiyatı, ülke bazlı GTİP oranları ve yurtiçi masraf bilgisiyle hesaplanır.
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500 text-center">
                Henüz bu ürüne bağlı sipariş yok.
              </div>
            )}
          </section>

          {canSeeFinance ? (
            <div className={`${sectionClass} border-t-4 border-t-indigo-500`}>
              <div className="mb-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Analiz
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Fiyat Değişim Geçmişi
                </h2>
              </div>
              <ProductPriceHistoryChart data={priceHistory} />
            </div>
          ) : null}

          <section id="proformas" className={`${sectionClass} border-t-4 border-t-amber-500`}>
            <div className={sectionHeaderClass}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Proforma
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Bağlı Proformalar
                </h2>
              </div>
              <span className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                {linkedProformas.length} proforma
              </span>
            </div>
            {linkedProformas.length ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-[0.22em] text-slate-400 font-semibold border-b border-slate-100">
                    <tr>
                      <th className="px-3 py-3">Proforma</th>
                      <th className="px-3 py-3">Tedarikçi</th>
                      <th className="px-3 py-3">Durum</th>
                      <th className="px-3 py-3">Tarih</th>
                      <th className="px-3 py-3 text-right">Adet</th>
                      {canSeeFinance ? <th className="px-3 py-3 text-right">Tutar</th> : null}
                      <th className="px-3 py-3 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {linkedProformas.map((proforma: any) => (
                      <tr key={proforma.id} className="group hover:bg-slate-50 transition">
                        <td className="px-3 py-3 font-semibold text-slate-900 group-hover:text-black">{proforma.proforma_no ?? "-"}</td>
                        <td className="px-3 py-3 truncate max-w-[150px]">{proforma?.suppliers?.name ?? "-"}</td>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${
                            proforma.status === "onayli" || proforma.status === "completed"
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : "bg-amber-50 text-amber-600 border border-amber-100"
                          }`}>
                            {proforma.status ?? "-"}
                          </span>
                        </td>
                        <td className="px-3 py-3">{fmtDate(proforma.proforma_date)}</td>
                        <td className="px-3 py-3 text-right font-semibold text-slate-900">{fmt(proforma.totalQty)}</td>
                        {canSeeFinance ? (
                          <td className="px-3 py-3 text-right font-semibold text-slate-950">
                            {fmt(proforma.totalAmount)} <span className="text-xs text-slate-400 font-normal">{proforma.currency ?? ""}</span>
                          </td>
                        ) : null}
                        <td className="px-3 py-3 text-right">
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
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500 text-center">
                Henüz bu ürüne bağlı proforma yok.
              </div>
            )}
          </section>

          <section id="rfqs" className={`${sectionClass} border-t-4 border-t-cyan-500`}>
            <div className={sectionHeaderClass}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Satınalma
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Bağlı RFQ'lar
                </h2>
              </div>
              <span className="rounded-lg bg-cyan-50 border border-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-700">
                {linkedRfqs.length} RFQ
              </span>
            </div>
            {linkedRfqs.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {linkedRfqs.map((rfq: any) => (
                  <Link
                    key={rfq.id}
                    href={`/rfqs/${rfq.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white p-3.5 transition hover:border-[#101817] hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <span className="inline-flex rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                        {rfq.code ?? "-"}
                      </span>
                      <span className="mt-1.5 block truncate text-sm font-semibold text-slate-955">
                        {rfq.title ?? "-"}
                      </span>
                    </div>
                    <span className="shrink-0 self-center rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-100">
                      {fmt(rfq.totalQty)} adet
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500 text-center">
                Henüz bu ürüne bağlı RFQ yok.
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Sidebar (Metadata & Specifications) */}
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-sky-500">
            <div className="border-b border-slate-100 pb-3">
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                Özet
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                Lojistik ve Stok
              </h2>
            </div>
            <div className="mt-4 divide-y divide-slate-50">
              <div className="flex justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-500">Canlı Stok</span>
                <span className="font-bold text-[#101817]">
                  <ProductLiveStockInline stockCode={stockCode || null} />
                </span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-500">Stok Kodu</span>
                <span className="font-semibold text-slate-900">{product.netsis_stok_kodu ?? "-"}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-500">Kategori</span>
                <span className="font-semibold text-slate-900">{group?.name ?? "Yok"}</span>
              </div>
              <div className="flex justify-between py-2.5 text-sm">
                <span className="font-medium text-slate-500">Ağırlık</span>
                <span className="font-semibold text-slate-900">{weightKg !== null ? `${fmt(weightKg)} kg` : "-"}</span>
              </div>
            </div>
          </section>



          <section id="attributes" className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-teal-600">
            <div className={sectionHeaderClass}>
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Teknik
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Nitelikler
                </h2>
              </div>
              <span className="rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1 text-xs font-semibold text-teal-700">
                {mergedAttributeCards.length} alan
              </span>
            </div>
            {mergedAttributeCards.length ? (
              <div className="mt-4 divide-y divide-slate-100">
                {mergedAttributeCards.map((attr) => (
                  <div key={attr.key} className="flex justify-between items-center py-2.5 text-sm gap-2">
                    <span className="font-medium text-slate-500 truncate max-w-[180px]">
                      {attr.name}
                      {attr.unit ? ` (${attr.unit})` : ""}
                    </span>
                    <span className="font-semibold text-slate-900 truncate text-right">
                      {attr.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 px-4 py-5 text-sm text-slate-500 text-center">
                Nitelik bulunamadı.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-orange-500">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Üretim
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  Üretimde Kalan
                </h2>
              </div>
              <span className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
                {fmt(stillInProductionTotal)} adet
              </span>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#101817]"
                  style={{ width: `${Math.max(4, openProductionRatio)}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Fatura: {fmt(invoiceQtyTotal)}</span>
                <span>Proforma: {fmt(proformaQtyTotal)}</span>
              </div>
            </div>
            {stillInProductionRows.length ? (
              <div className="mt-4 space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {stillInProductionRows.slice(0, 6).map((item: any) => (
                  <Link
                    key={`in-production-${item.id}`}
                    href={`/proformalar/${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-2.5 text-sm transition hover:border-slate-350 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{item.proforma_no ?? "-"}</span>
                      <span className="block truncate text-xs text-slate-400">{item?.suppliers?.name ?? "-"}</span>
                    </div>
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-100 shrink-0">
                      {fmt(item.openQty)} adet
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-emerald-50/50 border border-emerald-100/60 p-3 text-xs text-emerald-800 font-medium text-center">
                Açık ürün bulunmuyor.
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-rose-500">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">
                  Gümrük & Lojistik
                </p>
                <h2 className="mt-0.5 text-lg font-bold text-slate-900 [font-family:var(--font-display)]">
                  GTİP Oranları
                </h2>
              </div>
              <span className="rounded-lg bg-rose-50 border border-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700">
                {productGtipCode ?? "Bağlı değil"}
              </span>
            </div>
            
            {gtip ? (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs border-b border-slate-50 pb-3">
                  <div>
                    <span className="text-slate-400 block">KDV Oranı</span>
                    <span className="font-semibold text-slate-900 block mt-0.5">%20</span>
                  </div>
                  {gtip.anti_dumping_applicable ? (
                    <div>
                      <span className="text-slate-400 block">Damping Oranı</span>
                      <span className="font-semibold text-rose-600 block mt-0.5">
                        {fmtPercent(gtip.anti_dumping_rate)}
                      </span>
                    </div>
                  ) : null}
                </div>

                {countryRates?.length ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Ülke Bazlı Vergiler</p>
                    <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {countryRates.map((rate) => (
                        <div key={rate.country} className="flex justify-between items-center py-1.5 text-xs border-b border-slate-50 last:border-0">
                          <span className="font-semibold text-slate-700">{rate.country}</span>
                          <div className="text-right">
                            <span className="text-slate-500">GV: {fmtPercent(rate.customs_duty_rate)}</span>
                            {rate.additional_duty_rate > 0 ? (
                              <span className="text-slate-500 ml-2">İGV: {fmtPercent(rate.additional_duty_rate)}</span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Ülke bazlı vergi oranı girilmemiş.</p>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-rose-50/50 border border-rose-100/60 p-3 text-xs text-rose-800 font-medium text-center">
                GTİP tanımı bağlı değil.
              </div>
            )}
          </section>

          <ProductNotesWidget
            productId={product.id}
            notes={productNotes ?? []}
            canEdit={canEdit}
          />
        </div>
      </div>
    </section>
  );
}

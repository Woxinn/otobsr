import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import {
  Archive,
  ClipboardList,
  Download,
  FilePlus,
  Filter,
  PackageCheck,
  Search,
  Ship,
  WalletCards,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ChevronDown,
  ArrowRight,
  Plus,
  FileText,
  FileSpreadsheet
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit, canViewFinance } from "@/lib/roles";
import OrdersToast from "@/components/OrdersToast";
import { ArchiveButton } from "@/components/ArchiveButton";
import { bulkUpdateOrders } from "@/app/actions/orders";

const orderStatusOptions = [
  "Siparis Verildi",
  "Proforma Geldi",
  "Uretimde",
  "Hazir",
  "Kalkis Limaninda",
  "Denizde",
  "Varis Limaninda",
  "Gumrukte",
  "Depoya Teslim Edildi",
];

type SearchParams = {
  q?: string;
  supplier?: string;
  payment?: string;
  incoterm?: string;
  shipmentStatus?: string;
  orderStatus?: string;
  readyFrom?: string;
  readyTo?: string;
  page?: string;
  perPage?: string;
  archived?: string;
  toast?: string;
};

const normalizeAttributeName = (value: string | null | undefined) =>
  (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0131|\u0130/g, "i");

const isWeightName = (value: string | null | undefined) => {
  const normalized = normalizeAttributeName(value);
  return normalized.includes("agirlik") || normalized.includes("weight");
};

const toNumberSafe = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

export const metadata: Metadata = {
  title: "Siparişler",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  const canSeeFinance = canViewFinance(role);
  const isSales = role === "Satis";
  const effectiveSupplierFilter = isSales ? undefined : resolvedParams.supplier;
  const effectivePaymentFilter = isSales ? undefined : resolvedParams.payment;
  const effectiveIncotermFilter = isSales ? undefined : resolvedParams.incoterm;
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  const { data: orders } = await supabase
    .from("orders")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false });

  const { data: payments } = await supabase
    .from("order_payments")
    .select("order_id, amount, status");

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, applies_to")
    .order("name");

  const { data: orderDocuments } = await supabase
    .from("order_documents")
    .select("order_id, document_type_id, status");

  // Order -> Shipment eşleşmeleri
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: packingSummaries } = orderIds.length
    ? await supabase
        .from("order_packing_list_summary")
        .select("order_id, total_packages, total_net_weight_kg")
        .in("order_id", orderIds)
    : { data: [] as any[] };
  const { data: orderShipments } = orderIds.length
    ? await supabase
        .from("shipment_orders")
        .select("order_id, shipments(id, file_no, status, eta_current, warehouse_delivery_date)")
        .in("order_id", orderIds)
    : { data: [] as any[] };

  const shipmentsByOrder = new Map<
    string,
    {
      id: string;
      file_no: string | null;
      status: string | null;
      eta_current: string | null;
      warehouse_delivery_date: string | null;
    }[]
  >();
  (orderShipments ?? []).forEach((row) => {
    if (!row.order_id || !row.shipments) return;
    const list = shipmentsByOrder.get(row.order_id) ?? [];
    list.push(row.shipments);
    shipmentsByOrder.set(row.order_id, list);
  });

  const packingSummaryByOrder = new Map<
    string,
    { total_packages: number | null; total_net_weight_kg: number | null }
  >();
  (packingSummaries ?? []).forEach((row: any) => {
    if (!row.order_id) return;
    packingSummaryByOrder.set(String(row.order_id), {
      total_packages:
        row.total_packages !== null && row.total_packages !== undefined
          ? Number(row.total_packages)
          : null,
      total_net_weight_kg:
        row.total_net_weight_kg !== null && row.total_net_weight_kg !== undefined
          ? Number(row.total_net_weight_kg)
          : null,
    });
  });


  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );
  const requiredOrderTypes = orderDocumentTypes.filter(
    (type) => type.is_required
  );

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
  });

  const missingOrderDocsByOrder = new Map<string, string[]>();
  (orders ?? []).forEach((order) => {
    const docs = orderDocumentsByOrder.get(order.id) ?? [];
    const missing = requiredOrderTypes
      .filter((type) => {
        const hasReceived = docs.some(
          (doc) =>
            doc.document_type_id === type.id && doc.status === "Geldi"
        );
        return !hasReceived;
      })
      .map((type) => type.name);
    missingOrderDocsByOrder.set(order.id, missing);
  });

  const paidTotals = (payments ?? []).reduce<Record<string, number>>(
    (acc, payment) => {
      if (payment.status !== "Odendi") return acc;
      acc[payment.order_id] =
        (acc[payment.order_id] ?? 0) + Number(payment.amount ?? 0);
      return acc;
    },
    {}
  );
  const remainingByOrder = (() => {
    const map = new Map<string, number>();
    if (!canSeeFinance) return map;

    const supplierPaidTotals = new Map<string, number>();
    const supplierIdByOrderId = new Map<string, string>();
    (orders ?? []).forEach((order) => {
      const supplierId = order.supplier_id ? String(order.supplier_id) : "";
      if (!supplierId) return;
      supplierIdByOrderId.set(String(order.id), supplierId);
    });

    (payments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi") return;
      const supplierId = supplierIdByOrderId.get(String(payment.order_id)) ?? "";
      if (!supplierId) return;
      supplierPaidTotals.set(
        supplierId,
        (supplierPaidTotals.get(supplierId) ?? 0) + Number(payment.amount ?? 0)
      );
    });

    const supplierOrders = new Map<string, any[]>();
    (orders ?? []).forEach((order) => {
      const supplierId = order.supplier_id ? String(order.supplier_id) : "";
      if (!supplierId) return;
      const bucket = supplierOrders.get(supplierId) ?? [];
      bucket.push(order);
      supplierOrders.set(supplierId, bucket);
    });

    supplierOrders.forEach((supplierOrderList, supplierId) => {
      const sortedOrders = [...supplierOrderList].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return String(a.id).localeCompare(String(b.id));
      });
      let supplierCredit = supplierPaidTotals.get(supplierId) ?? 0;
      sortedOrders.forEach((order) => {
        const total = Number(order.total_amount ?? 0) || 0;
        const remaining = Math.max(0, total - supplierCredit);
        map.set(order.id, remaining);
        supplierCredit = Math.max(0, supplierCredit - total);
      });
    });

    return map;
  })();

  const query = resolvedParams.q?.toLowerCase();
  const normalizeStatus = (value: string | null | undefined) =>
    (value ?? "")
      .toLowerCase()
      .replaceAll("ı", "i")
      .replaceAll("ğ", "g")
      .replaceAll("ş", "s")
      .replaceAll("ö", "o")
      .replaceAll("ü", "u")
      .replaceAll("ç", "c")
      .trim();
  const statusToken = (value: string | null | undefined) =>
    normalizeStatus(value).replaceAll(" ", "-");
  const perPageOptions = [10, 20, 50, 100];
  const perPageRaw = Number(resolvedParams.perPage ?? 20);
  const perPage = perPageOptions.includes(perPageRaw) ? perPageRaw : 20;
  const currentPage = Math.max(1, Number(resolvedParams.page ?? 1) || 1);
  let filtered = orders ?? [];

  if (query) {
    filtered = filtered.filter((order) => {
      const haystack = [
        order.name ?? "",
        order.notes ?? "",
        order.incoterm ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  if (effectiveSupplierFilter) {
    filtered = filtered.filter(
      (order) => order.supplier_id === effectiveSupplierFilter
    );
  }

  if (effectivePaymentFilter) {
    filtered = filtered.filter(
      (order) => order.payment_method === effectivePaymentFilter
    );
  }

  if (effectiveIncotermFilter) {
    filtered = filtered.filter((order) =>
      (order.incoterm ?? "").toLowerCase().includes(effectiveIncotermFilter.toLowerCase())
    );
  }

  // Arşiv filtresi: varsayılan sadece aktifler
  const archivedMode = (resolvedParams.archived ?? "").toLowerCase();
  if (archivedMode === "only") {
    filtered = filtered.filter((order) => order.archived === true);
  } else if (archivedMode === "all") {
    // hepsi
  } else {
    filtered = filtered.filter((order) => order.archived !== true);
  }

  if (resolvedParams.shipmentStatus) {
    const selectedStatus = resolvedParams.shipmentStatus.toLowerCase();
    filtered = filtered.filter((order) => {
      const linkedShipments = shipmentsByOrder.get(order.id) ?? [];
      if (!linkedShipments.length) return false;

      if (selectedStatus === "geciken") {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return linkedShipments.some((shipment) => {
          if (!shipment.eta_current || shipment.warehouse_delivery_date) return false;
          const eta = new Date(shipment.eta_current);
          eta.setHours(0, 0, 0, 0);
          return eta <= now;
        });
      }

      return linkedShipments.some(
        (shipment) => statusToken(shipment.status) === selectedStatus
      );
    });
  }

  if (resolvedParams.orderStatus) {
    const selectedStatus = resolvedParams.orderStatus.toLowerCase();
    filtered = filtered.filter(
      (order) => statusToken(order.order_status) === selectedStatus
    );
  }

  if (resolvedParams.readyFrom) {
    const from = new Date(resolvedParams.readyFrom);
    filtered = filtered.filter(
      (order) =>
        order.expected_ready_date &&
        new Date(order.expected_ready_date) >= from
    );
  }

  if (resolvedParams.readyTo) {
    const to = new Date(resolvedParams.readyTo);
    filtered = filtered.filter(
      (order) =>
        order.expected_ready_date &&
        new Date(order.expected_ready_date) <= to
    );
  }

  // Default sıralama: ETA (en yakın -> en uzak), fallback expected_ready_date, sonra created_at
  const etaMs = (order: any) => {
    const shipments = shipmentsByOrder.get(order.id) ?? [];
    const etaDates = shipments
      .map((s) => s.eta_current)
      .filter((v): v is string => Boolean(v))
      .map((v) => new Date(v).getTime())
      .filter((t) => Number.isFinite(t));
    if (etaDates.length) return Math.min(...etaDates);
    if (order.expected_ready_date) {
      const t = new Date(order.expected_ready_date).getTime();
      if (Number.isFinite(t)) return t + 1_000; // küçük offset
    }
    const created = new Date(order.created_at ?? 0).getTime();
    return Number.isFinite(created) ? created + 2_000_000_000 : Number.MAX_SAFE_INTEGER;
  };
  filtered = filtered.sort((a, b) => etaMs(a) - etaMs(b));

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);
  const pageOrderIds = pageItems.map((item) => item.id);
  const QTY_CHUNK_SIZE = 1000;

  const fetchOrderItemQtyTotal = async (orderId: string) => {
    let total = 0;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("order_items")
        .select("quantity")
        .eq("order_id", orderId)
        .range(from, from + QTY_CHUNK_SIZE - 1);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[orders page] order item qty fetch error", { orderId, error });
        return total;
      }
      if (!data || data.length === 0) return total;
      total += data.reduce((sum: number, row: any) => sum + Number(row.quantity ?? 0), 0);
      if (data.length < QTY_CHUNK_SIZE) return total;
      from += QTY_CHUNK_SIZE;
    }
  };

  const qtyEntries = await Promise.all(
    pageOrderIds.map(async (orderId) => [orderId, await fetchOrderItemQtyTotal(orderId)] as const)
  );
  const qtyByOrder = new Map<string, number>(qtyEntries);

  const { data: pageOrderWeightRows } = pageOrderIds.length
    ? await supabase
        .from("order_items")
        .select("order_id, quantity, net_weight_kg, gross_weight_kg, product_id")
        .in("order_id", pageOrderIds)
    : { data: [] as any[] };

  const fallbackProductIds = Array.from(
    new Set(
      (pageOrderWeightRows ?? [])
        .filter((row: any) => row.net_weight_kg == null && row.gross_weight_kg == null && row.product_id)
        .map((row: any) => row.product_id)
    )
  );

  const { data: weightAttrRows } = fallbackProductIds.length
    ? await supabase
        .from("product_attribute_values")
        .select("product_id, value_text, value_number, product_attributes(name)")
        .in("product_id", fallbackProductIds)
    : { data: [] as any[] };

  const { data: weightExtraRows } = fallbackProductIds.length
    ? await supabase
        .from("product_extra_attributes")
        .select("product_id, name, value_text, value_number")
        .in("product_id", fallbackProductIds)
    : { data: [] as any[] };

  const weightByProduct = new Map<string, number>();
  (weightAttrRows ?? []).forEach((row: any) => {
    if (!row.product_id || weightByProduct.has(row.product_id)) return;
    const attribute = Array.isArray(row.product_attributes)
      ? row.product_attributes[0]
      : row.product_attributes;
    if (!isWeightName(attribute?.name)) return;
    const val = toNumberSafe(row.value_number) ?? toNumberSafe(row.value_text);
    if (val !== null) weightByProduct.set(row.product_id, val);
  });
  (weightExtraRows ?? []).forEach((row: any) => {
    if (!row.product_id || weightByProduct.has(row.product_id)) return;
    if (!isWeightName(row.name)) return;
    const val = toNumberSafe(row.value_number) ?? toNumberSafe(row.value_text);
    if (val !== null) weightByProduct.set(row.product_id, val);
  });

  const computedWeightByOrder = (pageOrderWeightRows ?? []).reduce<Map<string, number>>((acc, row: any) => {
    if (!row.order_id) return acc;
    const current = acc.get(String(row.order_id)) ?? 0;
    const quantity = Number(row.quantity ?? 0);
    const direct = toNumberSafe(row.net_weight_kg) ?? toNumberSafe(row.gross_weight_kg);
    const fallback =
      direct !== null
        ? direct
        : row.product_id && weightByProduct.has(row.product_id)
        ? (weightByProduct.get(row.product_id) ?? 0) * quantity
        : 0;
    acc.set(String(row.order_id), current + fallback);
    return acc;
  }, new Map<string, number>());

  const returnParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (value && key !== "toast") {
      returnParams.set(key, value);
    }
  });
  const returnTo = `/orders${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(resolvedParams).forEach(([key, value]) => {
      if (value && key !== "toast" && key !== "page") {
        params.set(key, value);
      }
    });
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    return `/orders?${params.toString()}`;
  };

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const formatNumber = (
    value: number | null | undefined,
    maximumFractionDigits = 2
  ) => {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  };

  const resolveOrderQuantity = (order: any) => {
    const fromItems = qtyByOrder.get(order.id);
    if (fromItems !== null && fromItems !== undefined && fromItems > 0) return fromItems;
    return null;
  };

  const rowColorsFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return {
      bg: `hsl(${hue}, 80%, 96%)`,
      accent: `hsl(${hue}, 70%, 45%)`,
    };
  };

  const getEarliestEta = (order: any) => {
    const list = shipmentsByOrder.get(order.id) ?? [];
    const dates = list
      .map((s) => s.eta_current)
      .filter((v): v is string => Boolean(v))
      .map((v) => new Date(v))
      .filter((d) => !Number.isNaN(d.getTime()));
    if (!dates.length) return null;
    return new Date(Math.min(...dates.map((d) => d.getTime())));
  };

  const isDelayedOrder = (order: any) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (shipmentsByOrder.get(order.id) ?? []).some((shipment) => {
      if (!shipment.eta_current || shipment.warehouse_delivery_date) return false;
      const eta = new Date(shipment.eta_current);
      eta.setHours(0, 0, 0, 0);
      return eta <= today;
    });
  };

  const activeFilterCount =
    (resolvedParams.q ? 1 : 0) +
    (effectiveSupplierFilter ? 1 : 0) +
    (effectivePaymentFilter ? 1 : 0) +
    (effectiveIncotermFilter ? 1 : 0) +
    (resolvedParams.shipmentStatus ? 1 : 0) +
    (resolvedParams.orderStatus ? 1 : 0) +
    (resolvedParams.readyFrom || resolvedParams.readyTo ? 1 : 0) +
    (resolvedParams.archived ? 1 : 0);

  const activeOrdersCount = (orders ?? []).filter((order) => order.archived !== true).length;
  const archivedOrdersCount = (orders ?? []).filter((order) => order.archived === true).length;
  const delayedOrdersCount = filtered.filter((order) => isDelayedOrder(order)).length;
  const visibleMissingDocsCount = canSeeFinance
    ? filtered.reduce((sum, order) => sum + (missingOrderDocsByOrder.get(order.id)?.length ?? 0), 0)
    : 0;
  const filteredRemainingTotal = canSeeFinance
    ? filtered.reduce((sum, order) => {
        const total = Number(order.total_amount ?? 0);
        const paid = paidTotals[order.id] ?? 0;
        return sum + (remainingByOrder.get(order.id) ?? Math.max(0, total - paid));
      }, 0)
    : 0;

  const statCards = [
    {
      label: "Aktif sipariş",
      value: activeOrdersCount.toLocaleString("tr-TR"),
      helper: `${archivedOrdersCount.toLocaleString("tr-TR")} arşivde`,
      icon: PackageCheck,
      tone: "border-sky-200 bg-sky-50 text-sky-950",
    },
    {
      label: "Filtre sonucu",
      value: totalCount.toLocaleString("tr-TR"),
      helper: activeFilterCount ? `${activeFilterCount} filtre aktif` : "Tüm görünüm",
      icon: Filter,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-950",
    },
    {
      label: "Geciken ETA",
      value: delayedOrdersCount.toLocaleString("tr-TR"),
      helper: "Teslim tarihi geçip kapanmayan",
      icon: Ship,
      tone: "border-rose-200 bg-rose-50 text-rose-950",
    },
    ...(canSeeFinance
      ? [
          {
            label: "Kalan ödeme",
            value: filteredRemainingTotal.toLocaleString("tr-TR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
            helper: visibleMissingDocsCount
              ? `${visibleMissingDocsCount} eksik evrak`
              : "Evrak eksiği yok",
            icon: WalletCards,
            tone: "border-amber-200 bg-amber-50 text-amber-950",
          },
        ]
      : []),
  ];

  const getStatusBadgeStyle = (status: string | null | undefined) => {
    const s = (status ?? "").toLowerCase().trim();
    if (s.includes("verildi") || s.includes("proforma")) {
      return "bg-indigo-50/70 text-indigo-700 border-indigo-200/50";
    }
    if (s.includes("uretim") || s.includes("hazir")) {
      if (s.includes("hazir")) {
        return "bg-emerald-50/70 text-emerald-700 border-emerald-200/50";
      }
      return "bg-amber-50/70 text-amber-700 border-amber-200/50";
    }
    if (s.includes("liman") || s.includes("deniz")) {
      return "bg-cyan-50/70 text-cyan-700 border-cyan-200/50";
    }
    if (s.includes("gumruk")) {
      return "bg-rose-50/70 text-rose-700 border-rose-200/50";
    }
    if (s.includes("depo") || s.includes("teslim")) {
      return "bg-slate-100/70 text-slate-700 border-slate-300/50";
    }
    return "bg-slate-50/70 text-slate-600 border-slate-200/50";
  };

  return (
    <section className="space-y-6 animate-fade-up">
      <OrdersToast />

      <div className="rounded-2xl border border-black/10 bg-[#101817] p-6 text-white shadow-[0_24px_70px_-50px_rgba(16,24,23,0.9)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -z-10" />
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between relative z-10">
          <div className="max-w-3xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/40">
              Sipariş Operasyonları
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight [font-family:var(--font-display)]">
              Siparişler
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">
              ETA, sevkiyat, ödeme, evrak ve üretim durumunu tek listede takip edin.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isSales && (
              <Link
                href="/api/orders/items-export"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
              >
                <Download className="h-4 w-4 text-emerald-400" />
                Kalem Export
              </Link>
            )}
            {canEditPage && (
              <Link
                href="/orders/new"
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-teal-950 transition hover:-translate-y-0.5"
              >
                <FilePlus className="h-4 w-4" />
                Yeni Sipariş
              </Link>
            )}
            <Link
              href={archivedMode === "only" ? "/orders" : "/orders?archived=only"}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/20"
            >
              <Archive className="h-4 w-4" />
              {archivedMode === "only" ? "Aktifler" : "Arşiv"}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((item) => {
            const Icon = item.icon;
            let cardStyle = "border-white/10 bg-white/5 text-white shadow-[0_4px_20px_-10px_rgba(255,255,255,0.1)]";
            let iconBg = "bg-white/10 text-white";

            if (item.label.includes("Aktif")) {
              cardStyle = "border-sky-500/20 bg-sky-500/5 text-white shadow-[0_4px_20px_-10px_rgba(56,189,248,0.2)] hover:border-sky-500/30 transition-all duration-200";
              iconBg = "bg-sky-500/10 text-sky-400";
            } else if (item.label.includes("sonucu")) {
              cardStyle = "border-emerald-500/20 bg-emerald-500/5 text-white shadow-[0_4px_20px_-10px_rgba(52,211,153,0.2)] hover:border-emerald-500/30 transition-all duration-200";
              iconBg = "bg-emerald-500/10 text-emerald-400";
            } else if (item.label.includes("Geciken")) {
              cardStyle = "border-rose-500/20 bg-rose-500/5 text-white shadow-[0_4px_20px_-10px_rgba(248,113,113,0.2)] hover:border-rose-500/30 transition-all duration-200";
              iconBg = "bg-rose-500/10 text-rose-400";
            } else if (item.label.includes("ödeme")) {
              cardStyle = "border-amber-500/20 bg-amber-500/5 text-white shadow-[0_4px_20px_-10px_rgba(251,191,36,0.2)] hover:border-amber-500/30 transition-all duration-200";
              iconBg = "bg-amber-500/10 text-amber-400";
            }

            return (
              <div key={item.label} className={`rounded-xl border p-4 transition-all duration-250 ${cardStyle}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                      {item.label}
                    </p>
                    <p className="mt-1.5 truncate text-xl font-bold tracking-tight text-white">{item.value}</p>
                  </div>
                  <span className={`rounded-lg p-2 shadow-sm ${iconBg}`}>
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                </div>
                <p className="mt-2 truncate text-[11px] font-medium text-white/60">{item.helper}</p>
              </div>
            );
          })}
        </div>
      </div>

      <form className="rounded-2xl border border-black/8 bg-white/80 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-black/45">
              <Search className="h-4.5 w-4.5" />
            </span>
            <input
              name="q"
              defaultValue={resolvedParams.q ?? ""}
              placeholder="Sipariş adı, not veya incoterm ile arayın..."
              className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-xl bg-[#101817] px-5 py-2.5 text-sm font-semibold text-white hover:bg-black transition cursor-pointer"
            >
              Filtrele
            </button>
            <Link
              href="/orders"
              className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/70 hover:bg-slate-50 transition"
            >
              Temizle
            </Link>
          </div>
        </div>

        <details className="group mt-4 border-t border-black/5 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wider text-black/60 hover:text-black select-none">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5" />
              <span>Gelişmiş Filtreler</span>
              {activeFilterCount > 0 && (
                <span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-[10px] text-black font-bold">
                  {activeFilterCount} aktif
                </span>
              )}
            </div>
            <span className="transition-transform duration-250 group-open:rotate-180">
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 text-sm">
            {!isSales && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Tedarikçi</label>
                <select
                  name="supplier"
                  defaultValue={effectiveSupplierFilter ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                >
                  <option value="">Hepsi</option>
                  {suppliers?.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isSales && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Ödeme Şekli</label>
                <select
                  name="payment"
                  defaultValue={effectivePaymentFilter ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                >
                  <option value="">Hepsi</option>
                  <option value="TT">TT</option>
                  <option value="LC">LC</option>
                  <option value="Diger">Diğer</option>
                </select>
              </div>
            )}

            {!isSales && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Incoterm</label>
                <input
                  name="incoterm"
                  defaultValue={effectiveIncotermFilter ?? ""}
                  placeholder="FOB, CIF..."
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Arşiv Durumu</label>
              <select
                name="archived"
                defaultValue={resolvedParams.archived ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              >
                <option value="">Aktifler</option>
                <option value="only">Sadece Arşiv</option>
                <option value="all">Tümü</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Sevkiyat Durumu</label>
              <select
                name="shipmentStatus"
                defaultValue={resolvedParams.shipmentStatus ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              >
                <option value="">Hepsi</option>
                <option value="planlandi">Planlandı</option>
                <option value="kalkis-limaninda">Kalkış Limanında</option>
                <option value="denizde">Denizde</option>
                <option value="varis-limaninda">Varış Limanında</option>
                <option value="gemiden-indi">Gemiden İndi</option>
                <option value="geciken">Geciken</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Sipariş Durumu</label>
              <select
                name="orderStatus"
                defaultValue={resolvedParams.orderStatus ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              >
                <option value="">Hepsi</option>
                <option value="siparis-verildi">Sipariş Verildi</option>
                <option value="proforma-geldi">Proforma Geldi</option>
                <option value="uretimde">Üretimde</option>
                <option value="hazir">Hazır</option>
                <option value="kalkis-limaninda">Kalkış Limanında</option>
                <option value="denizde">Denizde</option>
                <option value="varis-limaninda">Varış Limanında</option>
                <option value="gumrukte">Gümrükte</option>
                <option value="depoya-teslim-edildi">Depoya Teslim Edildi</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Hazır Oluş (Başlangıç)</label>
              <input
                type="date"
                name="readyFrom"
                defaultValue={resolvedParams.readyFrom ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Hazır Oluş (Bitiş)</label>
              <input
                type="date"
                name="readyTo"
                defaultValue={resolvedParams.readyTo ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-black/60">Sayfada Göster</label>
              <select
                name="perPage"
                defaultValue={String(perPage)}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
              >
                {perPageOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </form>

      <div className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">Liste</p>
            <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
              Sipariş Kayıtları
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-black/50">
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5">
              {totalCount
                ? `${(pageStart + 1).toLocaleString("tr-TR")}-${Math.min(pageStart + pageItems.length, totalCount).toLocaleString("tr-TR")}`
                : "0"}{" "}
              / {totalCount.toLocaleString("tr-TR")}
            </span>
            <Link
              href={archivedMode === "only" ? "/orders" : "/orders?archived=only"}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/60 transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              {archivedMode === "only" ? "Aktifleri göster" : "Arşivi göster"}
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          {pageItems.length ? (
            <div className="overflow-x-auto">
              {canEditPage ? (
                <form action={bulkUpdateOrders}>
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-black/5 bg-slate-50/50 p-2 text-xs font-semibold text-black/70">
                    <span>Toplu işlem:</span>
                    <select
                      name="bulk_action"
                      className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs outline-none"
                      defaultValue="archive"
                    >
                      <option value="archive">Arşivle</option>
                      <option value="unarchive">Arşivden çıkar</option>
                      <option value="status">Durum değiştir</option>
                      <option value="delete">Sil</option>
                    </select>
                    <select
                      name="bulk_status"
                      className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs outline-none"
                      defaultValue=""
                    >
                      <option value="">Durum seçin</option>
                      {orderStatusOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-[#101817] px-3 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 cursor-pointer"
                    >
                      Uygula
                    </button>
                    <span className="text-[11px] text-black/40 font-normal">Seç ve uygula (sil işlemi geri alınamaz)</span>
                  </div>

                  <div className="w-full min-w-[1050px]">
                    <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                      <thead>
                        <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-[0.22em] text-black/40">
                          <th className="w-10 px-3 py-3 font-semibold">Seç</th>
                          <th className="w-[12%] px-3 py-3 font-semibold">Order</th>
                          <th className="w-[28%] px-3 py-3 font-semibold">Sipariş</th>
                          <th className="w-[11%] px-3 py-3 font-semibold">ETA</th>
                          <th className="w-[16%] px-3 py-3 font-semibold">Sevkiyat</th>
                          {canSeeFinance ? <th className="w-[13%] px-3 py-3 text-right font-semibold">Toplam</th> : null}
                          {canSeeFinance ? <th className="w-[13%] px-3 py-3 text-right font-semibold">Kalan</th> : null}
                          <th className="w-[13%] px-3 py-3 text-right font-semibold">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageItems.map((order, index) => {
                          const detailHref = `/orders/${order.id}`;
                          const paid = paidTotals[order.id] ?? 0;
                          const total = Number(order.total_amount ?? 0);
                          const remaining = remainingByOrder.get(order.id) ?? Math.max(0, total - paid);
                          const missingDocs = canSeeFinance
                            ? missingOrderDocsByOrder.get(order.id) ?? []
                            : [];
                          const rowColors = rowColorsFromId(order.id);
                          const eta = getEarliestEta(order);
                          const isArchived = Boolean(order.archived);
                          return (
                            <tr
                              key={order.id}
                              className="group border-b border-black/5 transition hover:bg-slate-50/60 [&>td]:border-t [&>td]:border-black/5"
                              style={
                                {
                                  animationDelay: `${index * 45}ms`,
                                  ["--row-bg" as string]: rowColors.bg,
                                  ["--row-accent" as string]: rowColors.accent,
                                } as CSSProperties
                              }
                            >
                              <td className="px-3 py-4 text-center">
                                <input type="checkbox" name="selected" value={order.id} className="rounded border-slate-300" />
                              </td>
                              <td className="px-3 py-4 text-xs font-semibold text-black/80">
                                <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="h-9 w-1.5 rounded-full"
                                      style={{ backgroundColor: "var(--row-accent)" }}
                                    />
                                    <div>
                                      <p className="text-[10px] uppercase tracking-[0.25em] text-black/40">Order</p>
                                      <p className="text-sm font-semibold tracking-tight">#{order.id.slice(0, 6).toUpperCase()}</p>
                                    </div>
                                  </div>
                                </Link>
                              </td>
                              <td className="px-3 py-4">
                                <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                  <div className="text-sm font-semibold text-black hover:text-indigo-600 transition-colors">{order.name ?? "-"}</div>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeStyle(order.order_status)}`}>
                                      {order.order_status ?? "Sipariş Verildi"}
                                    </span>
                                    {isArchived ? (
                                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                        Arşivde
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="mt-2 text-xs text-black/55 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="font-semibold text-slate-700">{formatNumber(resolveOrderQuantity(order), 0)} adet</span>
                                    <span className="text-slate-300">•</span>
                                    <span>
                                      {formatNumber(
                                        packingSummaryByOrder.get(order.id)?.total_net_weight_kg ??
                                          order.weight_kg ??
                                          computedWeightByOrder.get(order.id) ??
                                          null,
                                        2
                                      )}{" "}
                                      kg
                                    </span>
                                    {isSales ? null : (
                                      <>
                                        <span className="text-slate-300">•</span>
                                        <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase">{order.incoterm ?? "-"}</span>
                                      </>
                                    )}
                                  </div>
                                  {order.notes && <div className="mt-1.5 text-xs text-black/40 truncate max-w-xs">{order.notes}</div>}
                                  {missingDocs.length && !isSales ? (
                                    <div className="group/tooltip mt-2 inline-flex flex-col items-start gap-2">
                                      <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                        {missingDocs.length} eksik evrak
                                      </span>
                                      <div className="max-h-0 w-[220px] overflow-hidden rounded-2xl border border-black/10 bg-white px-3 py-2 text-[10px] text-black/70 shadow-[0_18px_32px_-20px_rgba(12,45,52,0.55)] opacity-0 transition-all duration-200 group-hover/tooltip:max-h-[1000px] group-hover/tooltip:opacity-100">
                                        <div className="text-[9px] font-semibold text-black/60">Eksik belgeler</div>
                                        <div className="mt-1 space-y-0.5 font-normal">
                                          {missingDocs.map((doc) => (
                                            <div key={doc}>{doc}</div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null}
                                </Link>
                              </td>
                              <td className="px-3 py-4 text-sm text-black/70">
                                <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                  {eta ? eta.toISOString().slice(0, 10) : "-"}
                                </Link>
                              </td>
                              <td className="px-3 py-4 text-sm text-black/70">
                                <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                  {(shipmentsByOrder.get(order.id) ?? []).length ? (
                                    <div className="flex flex-wrap gap-2">
                                      {(shipmentsByOrder.get(order.id) ?? []).map((s) => (
                                        <span
                                          key={s.id}
                                          className="rounded-full border border-indigo-100 bg-indigo-50/50 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm"
                                        >
                                          {s.file_no ?? s.id.slice(0, 6).toUpperCase()}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-black/40">-</span>
                                  )}
                                </Link>
                              </td>
                              {canSeeFinance ? (
                                <td className="px-3 py-4 text-sm font-semibold text-black text-right">
                                  <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/75">
                                      {formatMoney(total, order.currency)}
                                    </span>
                                  </Link>
                                </td>
                              ) : null}
                              {canSeeFinance ? (
                                <td className="px-3 py-4 font-semibold text-black text-right">
                                  <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                                      {formatMoney(remaining, order.currency)}
                                    </span>
                                  </Link>
                                </td>
                              ) : null}
                              <td className="px-2 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  <Link
                                    href={detailHref}
                                    className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold text-black/70 transition hover:bg-slate-50 hover:border-black/35"
                                  >
                                    Detay
                                  </Link>
                                  {canEditPage ? (
                                    <ArchiveButton orderId={order.id} archived={isArchived} />
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </form>
              ) : (
                <div className="w-full min-w-[980px]">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]">
                    <thead>
                      <tr className="border-b border-black/5 text-left text-[11px] uppercase tracking-[0.22em] text-black/40">
                        <th className="w-[12%] px-3 py-3 font-semibold">Order</th>
                        <th className="w-[32%] px-3 py-3 font-semibold">Sipariş</th>
                        <th className="w-[12%] px-3 py-3 font-semibold">ETA</th>
                        <th className="w-[16%] px-3 py-3 font-semibold">Sevkiyat</th>
                        {canSeeFinance ? <th className="w-[13%] px-3 py-3 text-right font-semibold">Toplam</th> : null}
                        {canSeeFinance ? <th className="w-[13%] px-3 py-3 text-right font-semibold">Kalan</th> : null}
                        <th className="w-[12%] px-3 py-3 text-right font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((order, index) => {
                        const detailHref = `/orders/${order.id}`;
                        const paid = paidTotals[order.id] ?? 0;
                        const total = Number(order.total_amount ?? 0);
                        const remaining = remainingByOrder.get(order.id) ?? Math.max(0, total - paid);
                        const missingDocs = canSeeFinance ? missingOrderDocsByOrder.get(order.id) ?? [] : [];
                        const rowColors = rowColorsFromId(order.id);
                        const eta = getEarliestEta(order);
                        const isArchived = Boolean(order.archived);
                        return (
                          <tr
                            key={order.id}
                            className="group border-b border-black/5 transition hover:bg-slate-50/60 [&>td]:border-t [&>td]:border-black/5"
                            style={
                              {
                                animationDelay: `${index * 45}ms`,
                                ["--row-bg" as string]: rowColors.bg,
                                ["--row-accent" as string]: rowColors.accent,
                              } as CSSProperties
                            }
                          >
                            <td className="px-3 py-4 text-xs font-semibold text-black/80">
                              <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                <div className="flex items-center gap-3">
                                  <span className="h-9 w-1.5 rounded-full" style={{ backgroundColor: "var(--row-accent)" }} />
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.25em] text-black/40">Order</p>
                                    <p className="text-sm font-semibold tracking-tight">#{order.id.slice(0, 6).toUpperCase()}</p>
                                  </div>
                                </div>
                              </Link>
                            </td>
                            <td className="px-3 py-4">
                              <Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">
                                <div className="text-sm font-semibold text-black hover:text-indigo-600 transition-colors">{order.name ?? "-"}</div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStatusBadgeStyle(order.order_status)}`}>
                                    {order.order_status ?? "Sipariş Verildi"}
                                  </span>
                                  {isArchived ? (
                                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                      Arşivde
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2 text-xs text-black/55 flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-semibold text-slate-700">{formatNumber(resolveOrderQuantity(order), 0)} adet</span>
                                  <span className="text-slate-300">•</span>
                                  <span>
                                    {formatNumber(
                                      packingSummaryByOrder.get(order.id)?.total_net_weight_kg ??
                                        order.weight_kg ??
                                        computedWeightByOrder.get(order.id) ??
                                        null,
                                      2
                                    )}{" "}
                                    kg
                                  </span>
                                </div>
                                {order.notes && <div className="mt-1.5 text-xs text-black/40 truncate max-w-xs">{order.notes}</div>}
                                {missingDocs.length && !isSales ? (
                                  <div className="group/tooltip mt-2 inline-flex flex-col items-start gap-2">
                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">{missingDocs.length} eksik evrak</span>
                                  </div>
                                ) : null}
                              </Link>
                            </td>
                            <td className="px-3 py-4 text-sm text-black/70"><Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">{eta ? eta.toISOString().slice(0, 10) : "-"}</Link></td>
                            <td className="px-3 py-4 text-sm text-black/70"><Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4">{(shipmentsByOrder.get(order.id) ?? []).length ? <div className="flex flex-wrap gap-2">{(shipmentsByOrder.get(order.id) ?? []).map((s) => <span key={s.id} className="rounded-full border border-indigo-100 bg-indigo-50/50 px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm">{s.file_no ?? s.id.slice(0, 6).toUpperCase()}</span>)}</div> : <span className="text-black/40">-</span>}</Link></td>
                            {canSeeFinance ? <td className="px-3 py-4 text-sm font-semibold text-black text-right"><Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4"><span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/75">{formatMoney(total, order.currency)}</span></Link></td> : null}
                            {canSeeFinance ? <td className="px-3 py-4 font-semibold text-black text-right"><Link href={detailHref} className="block -mx-3 -my-4 px-3 py-4"><span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">{formatMoney(remaining, order.currency)}</span></Link></td> : null}
                            <td className="px-2 py-4 text-right"><div className="flex justify-end gap-2"><Link href={detailHref} className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs font-semibold text-black/70 transition hover:bg-slate-50 hover:border-black/35">Detay</Link></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-black/5 bg-[#fbfaf6] px-4 py-3 text-sm text-black/60 text-center py-8">
              Filtrelere uygun sipariş kaydı bulunamadı.
            </div>
          )}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-black/70">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const page = idx + 1;
              const isActive = page === safePage;
              return (
                <Link
                  key={page}
                  href={buildPageHref(page)}
                  className={`rounded-xl px-3 py-2 transition ${
                    isActive
                      ? "bg-[#101817] text-white shadow-sm"
                      : "border border-black/10 bg-white text-black/70 hover:bg-slate-50 hover:border-black/25"
                  }`}
                >
                  {page}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}


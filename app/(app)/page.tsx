import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import MonthlyOrdersChart from "@/components/MonthlyOrdersChart";
import SupplierDonutChart from "@/components/SupplierDonutChart";
import {
  BarChart3,
  CalendarClock,
  CircleDollarSign,
  ClipboardList,
  FileWarning,
  PackageCheck,
  Ship,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Gösterge Paneli",
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canSeeFinance = canViewFinance(role);
  const isSales = role === "Satis";
  if (isSales) {
    return (
      <meta httpEquiv="refresh" content="0; url=/products" />
    );
  }
  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, is_critical, applies_to");

  const shipmentDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "shipment" || !type.applies_to
  );
  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );
  const requiredOrderTypes = orderDocumentTypes.filter(
    (type) => type.is_required
  );

  const { data: shipments } = await supabase
    .from("shipments")
    .select(
      "id, file_no, status, eta_current, atd_actual, warehouse_delivery_date, archived_at"
    )
    .is("archived_at", null);

  const { data: orders } = await supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, total_amount, currency, created_at, supplier_id, suppliers(name)")
    .order("created_at", { ascending: false });

  const { data: orderPayments } = canSeeFinance
    ? await supabase
      .from("order_payments")
      .select("order_id, amount, status, payment_date, currency")
    : { data: [] };

  const shipmentIds = shipments?.map((item) => item.id) ?? [];
  const { data: documents } = shipmentIds.length
    ? await supabase
      .from("documents")
      .select("shipment_id, document_type_id, status")
      .in("shipment_id", shipmentIds)
    : { data: [] };

  const { data: shipmentOrders } = shipmentIds.length
    ? await supabase
      .from("shipment_orders")
      .select("shipment_id, orders(id)")
      .in("shipment_id", shipmentIds)
    : { data: [] };

  const allOrderIds = orders?.map((order) => order.id) ?? [];
  const { data: orderDocuments } = allOrderIds.length
    ? await supabase
      .from("order_documents")
      .select("order_id, document_type_id, status")
      .in("order_id", allOrderIds)
    : { data: [] };

  const documentsByShipment = new Map<string, typeof documents>();
  documents?.forEach((doc) => {
    if (!doc.shipment_id) return;
    const list = documentsByShipment.get(doc.shipment_id) ?? [];
    list.push(doc);
    documentsByShipment.set(doc.shipment_id, list);
  });

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
  });

  const orderMissingByShipment = new Map<string, number>();
  shipmentOrders?.forEach((row) => {
    const orderList = row.orders
      ? Array.isArray(row.orders)
        ? row.orders
        : [row.orders]
      : [];
    let missingCount = 0;
    orderList.forEach((order) => {
      const docs = orderDocumentsByOrder.get(order.id) ?? [];
      const missing = requiredOrderTypes.filter((type) => {
        const hasReceived = docs.some(
          (doc) =>
            doc.document_type_id === type.id && doc.status === "Geldi"
        );
        return !hasReceived;
      });
      missingCount += missing.length;
    });
    orderMissingByShipment.set(
      row.shipment_id,
      (orderMissingByShipment.get(row.shipment_id) ?? 0) + missingCount
    );
  });

  const flags = shipments?.map((shipment) => {
    const shipmentDocs = documentsByShipment.get(shipment.id) ?? [];
    return {
      shipment,
      flags: getShipmentFlags(
        {
          eta_current: shipment.eta_current,
          warehouse_delivery_date: shipment.warehouse_delivery_date,
        },
        shipmentDocs,
        shipmentDocumentTypes
      ),
      orderMissingCount: orderMissingByShipment.get(shipment.id) ?? 0,
    };
  });

  const totalOpen = shipments?.length ?? 0;
  const delayed = flags?.filter((item) => item.flags.overdue).length ?? 0;

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

  const shipmentStatusCounts = (shipments ?? []).reduce(
    (acc, shipment) => {
      const status = normalizeStatus(shipment.status);
      if (status === "planlandi") acc.planlandi += 1;
      if (status === "kalkis limaninda") acc.kalkisLimaninda += 1;
      if (status === "denizde") acc.denizde += 1;
      if (status === "varis limaninda") acc.varisLimaninda += 1;
      if (status === "gemiden indi") acc.gemidenIndi += 1;
      return acc;
    },
    {
      planlandi: 0,
      kalkisLimaninda: 0,
      denizde: 0,
      varisLimaninda: 0,
      gemidenIndi: 0,
    }
  );
  const orderStatusCounts = (orders ?? []).reduce(
    (acc, order) => {
      const status = normalizeStatus(order.order_status);
      if (status === "siparis verildi") acc.siparisVerildi += 1;
      if (status === "proforma geldi") acc.proformaGeldi += 1;
      if (status === "uretimde") acc.uretimde += 1;
      if (status === "hazir") acc.hazir += 1;
      if (status === "kalkis limaninda") acc.kalkisLimaninda += 1;
      if (status === "denizde") acc.denizde += 1;
      if (status === "varis limaninda") acc.varisLimaninda += 1;
      if (status === "gumrukte") acc.gumrukte += 1;
      if (status === "depoya teslim edildi") acc.depoTeslim += 1;
      return acc;
    },
    {
      siparisVerildi: 0,
      proformaGeldi: 0,
      uretimde: 0,
      hazir: 0,
      kalkisLimaninda: 0,
      denizde: 0,
      varisLimaninda: 0,
      gumrukte: 0,
      depoTeslim: 0,
    }
  );
  const liveStatusStrip = [
    {
      label: "Planlandi",
      value: shipmentStatusCounts.planlandi,
      tone: "from-slate-500/20 to-slate-200/50",
      filter: "planlandi",
    },
    {
      label: "Kalkis Limaninda",
      value: shipmentStatusCounts.kalkisLimaninda,
      tone: "from-amber-500/20 to-amber-200/50",
      filter: "kalkis-limaninda",
    },
    {
      label: "Denizde",
      value: shipmentStatusCounts.denizde,
      tone: "from-sky-600/20 to-sky-200/50",
      filter: "denizde",
    },
    {
      label: "Varis Limaninda",
      value: shipmentStatusCounts.varisLimaninda,
      tone: "from-indigo-600/20 to-indigo-200/50",
      filter: "varis-limaninda",
    },
    {
      label: "Gemiden Indi",
      value: shipmentStatusCounts.gemidenIndi,
      tone: "from-emerald-600/20 to-emerald-200/50",
      filter: "gemiden-indi",
    },
    {
      label: "Geciken",
      value: delayed,
      tone: "from-rose-600/20 to-rose-200/50",
      filter: "geciken",
    },
  ];
  const orderLiveStatusStrip = [
    {
      label: "Siparis Verildi",
      value: orderStatusCounts.siparisVerildi,
      tone: "from-slate-500/20 to-slate-200/50",
      filter: "siparis-verildi",
    },
    {
      label: "Proforma Geldi",
      value: orderStatusCounts.proformaGeldi,
      tone: "from-amber-500/20 to-amber-200/50",
      filter: "proforma-geldi",
    },
    {
      label: "Uretimde",
      value: orderStatusCounts.uretimde,
      tone: "from-rose-500/20 to-rose-200/50",
      filter: "uretimde",
    },
    {
      label: "Hazir",
      value: orderStatusCounts.hazir,
      tone: "from-emerald-600/20 to-emerald-200/50",
      filter: "hazir",
    },
    {
      label: "Kalkis Limaninda",
      value: orderStatusCounts.kalkisLimaninda,
      tone: "from-sky-600/20 to-sky-200/50",
      filter: "kalkis-limaninda",
    },
    {
      label: "Denizde",
      value: orderStatusCounts.denizde,
      tone: "from-indigo-600/20 to-indigo-200/50",
      filter: "denizde",
    },
    {
      label: "Varis Limaninda",
      value: orderStatusCounts.varisLimaninda,
      tone: "from-violet-600/20 to-violet-200/50",
      filter: "varis-limaninda",
    },
    {
      label: "Gumrukte",
      value: orderStatusCounts.gumrukte,
      tone: "from-orange-600/20 to-orange-200/50",
      filter: "gumrukte",
    },
    {
      label: "Depoya Teslim",
      value: orderStatusCounts.depoTeslim,
      tone: "from-emerald-700/20 to-emerald-200/50",
      filter: "depoya-teslim-edildi",
    },
  ];

  const orderMissingByOrder = new Map<string, string[]>();
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
    orderMissingByOrder.set(order.id, missing);
  });

  const allOrdersWithMissing = (orders ?? [])
    .map((order) => ({
      order,
      missing: orderMissingByOrder.get(order.id) ?? [],
    }))
    .filter((item) => item.missing.length > 0)
    .sort((a, b) => {
      const aDate = a.order.expected_ready_date
        ? new Date(a.order.expected_ready_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDate = b.order.expected_ready_date
        ? new Date(b.order.expected_ready_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  const ordersWithMissing = allOrdersWithMissing;
  const nowMonth = new Date();
  const monthStart = new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1);
  const monthEnd = new Date(nowMonth.getFullYear(), nowMonth.getMonth() + 1, 0);
  monthStart.setHours(0, 0, 0, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const paymentAmount = (value: unknown) => Number(value ?? 0) || 0;
  const paidByOrder = new Map<string, number>();
  if (canSeeFinance) {
    (orderPayments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi") return;
      const current = paidByOrder.get(payment.order_id) ?? 0;
      paidByOrder.set(payment.order_id, current + paymentAmount(payment.amount));
    });
  }

  const monthlyPaid = canSeeFinance
    ? (orderPayments ?? []).reduce((acc, payment) => {
      if (payment.status !== "Odendi" || !payment.payment_date) return acc;
      const paymentDate = new Date(payment.payment_date);
      if (paymentDate < monthStart || paymentDate > monthEnd) return acc;
      return acc + paymentAmount(payment.amount);
    }, 0)
    : 0;

  const pendingPayments = canSeeFinance
    ? (orderPayments ?? []).reduce((acc, payment) => {
      if (payment.status !== "Bekleniyor") return acc;
      return acc + paymentAmount(payment.amount);
    }, 0)
    : 0;

  const remainingByOrder = (() => {
    const map = new Map<string, number>();
    if (!canSeeFinance) return map;

    const supplierIdByOrderId = new Map<string, string>();
    (orders ?? []).forEach((order) => {
      const supplierId = order.supplier_id ? String(order.supplier_id) : "";
      if (!supplierId) return;
      supplierIdByOrderId.set(String(order.id), supplierId);
    });

    const supplierPaidTotals = new Map<string, number>();
    (orderPayments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi") return;
      const supplierId = supplierIdByOrderId.get(String(payment.order_id)) ?? "";
      if (!supplierId) return;
      supplierPaidTotals.set(
        supplierId,
        (supplierPaidTotals.get(supplierId) ?? 0) + paymentAmount(payment.amount)
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

  const remainingPayments = (orders ?? []).reduce((acc, order) => {
    const remaining = remainingByOrder.get(order.id);
    if (typeof remaining === "number") return acc + remaining;
    const total = Number(order.total_amount ?? 0) || 0;
    const paid = paidByOrder.get(order.id) ?? 0;
    return acc + Math.max(0, total - paid);
  }, 0);
  const ordersWithRemainingPayment = canSeeFinance
    ? (orders ?? [])
        .map((order) => {
          const fallbackTotal = Number(order.total_amount ?? 0) || 0;
          const fallbackPaid = paidByOrder.get(order.id) ?? 0;
          const remaining = remainingByOrder.get(order.id) ?? Math.max(0, fallbackTotal - fallbackPaid);
          return {
            id: order.id,
            name: order.name ?? "Siparis",
            currency: order.currency ?? "USD",
            remaining,
            expected_ready_date: order.expected_ready_date,
          };
        })
        .filter((row) => row.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining)
    : [];

  const paymentMonthlyData = (() => {
    if (!canSeeFinance) return [] as { month: string; count: number }[];
    const TR_MONTHS = ["Oca", "Sub", "Mar", "Nis", "May", "Haz", "Tem", "Agu", "Eyl", "Eki", "Kas", "Ara"];
    const nowChart = new Date();
    const monthlyMap = new Map<string, number>();
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(nowChart.getFullYear(), nowChart.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    (orderPayments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi" || !payment.payment_date) return;
      const d = new Date(payment.payment_date);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (!monthlyMap.has(key)) return;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + paymentAmount(payment.amount));
    });
    return Array.from(monthlyMap.entries()).map(([key, total]) => {
      const [, m] = key.split("-");
      return { month: TR_MONTHS[Number(m)], count: Math.round(total) };
    });
  })();

  const formatMoney = (value: number) =>
    value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const normalize = (d: string | null | undefined) => {
    if (!d) return null;
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  };
  const inProductionStatuses = ["uretimde"];
  const producedStatuses = ["hazir"];
  const missingReadyOrders = (orders ?? []).filter(
    (order) => !order.expected_ready_date
  );
  const producedOrders = (orders ?? []).filter((order) =>
    producedStatuses.includes(normalizeStatus(order.order_status))
  );
  const inProductionOrders = (orders ?? []).filter((order) => {
    if (!order.expected_ready_date) return false;
    return inProductionStatuses.includes(normalizeStatus(order.order_status));
  });

  const withCountdown = inProductionOrders.map((order) => {
    const ready = normalize(order.expected_ready_date);
    const diffDays =
      ready !== null
        ? Math.round((ready.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
    return { order, diffDays };
  });

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const supplierNameOf = (order: any) =>
    (Array.isArray(order?.suppliers)
      ? order.suppliers[0]?.name
      : order?.suppliers?.name) ?? "Tedarikçi yok";

  const urgentProductionRows = withCountdown
    .filter(({ diffDays }) => diffDays !== null && diffDays <= 7)
    .sort((a, b) => (a.diffDays ?? 999) - (b.diffDays ?? 999));

  const delayedShipmentActions = (flags ?? [])
    .filter((item) => item.flags.overdue)
    .sort((a, b) =>
      String(a.shipment.eta_current ?? "").localeCompare(String(b.shipment.eta_current ?? ""))
    )
    .slice(0, 4)
    .map((item) => ({
      key: `shipment-${item.shipment.id}`,
      title: item.shipment.file_no ?? "Shipment",
      description: `ETA gecikti · ${formatDate(item.shipment.eta_current)}`,
      meta: "Sevkiyat",
      href: `/shipments/${item.shipment.id}`,
      tone: "critical",
      priority: 1,
      icon: Ship,
    }));

  const missingDocumentActions = ordersWithMissing.slice(0, 5).map((item) => ({
    key: `missing-doc-${item.order.id}`,
    title: item.order.name ?? "Sipariş",
    description: `${item.missing.length} eksik evrak · ${item.missing.slice(0, 2).join(", ")}`,
    meta: formatDate(item.order.expected_ready_date),
    href: `/orders/${item.order.id}`,
    tone: "warning",
    priority: 2,
    icon: FileWarning,
  }));

  const productionActions = urgentProductionRows.slice(0, 4).map(({ order, diffDays }) => ({
    key: `production-${order.id}`,
    title: order.name ?? "Sipariş",
    description:
      diffDays === null
        ? "Üretim tarihi bekleniyor"
        : diffDays < 0
          ? `${Math.abs(diffDays)} gün gecikti`
          : diffDays === 0
            ? "Bugün hazır olmalı"
            : `${diffDays} gün içinde hazır`,
    meta: supplierNameOf(order),
    href: `/orders/${order.id}`,
    tone: diffDays !== null && diffDays < 0 ? "critical" : "info",
    priority: diffDays !== null && diffDays < 0 ? 1 : 3,
    icon: CalendarClock,
  }));

  const paymentActions = canSeeFinance
    ? ordersWithRemainingPayment.slice(0, 4).map((row) => ({
        key: `payment-${row.id}`,
        title: row.name,
        description: `${formatMoney(row.remaining)} ${row.currency} kalan ödeme`,
        meta: formatDate(row.expected_ready_date),
        href: `/orders/${row.id}`,
        tone: "money",
        priority: 4,
        icon: CircleDollarSign,
      }))
    : [];

  const actionItems = [
    ...delayedShipmentActions,
    ...missingDocumentActions,
    ...productionActions,
    ...paymentActions,
  ]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12);

  const statusTone = {
    critical: {
      shell: "border-rose-200 bg-rose-50 text-rose-900",
      icon: "bg-rose-600 text-white",
      pill: "bg-rose-100 text-rose-700",
    },
    warning: {
      shell: "border-amber-200 bg-amber-50 text-amber-950",
      icon: "bg-amber-500 text-white",
      pill: "bg-amber-100 text-amber-800",
    },
    info: {
      shell: "border-sky-200 bg-sky-50 text-sky-950",
      icon: "bg-sky-600 text-white",
      pill: "bg-sky-100 text-sky-700",
    },
    money: {
      shell: "border-emerald-200 bg-emerald-50 text-emerald-950",
      icon: "bg-emerald-600 text-white",
      pill: "bg-emerald-100 text-emerald-700",
    },
  };

  const focusCards = [
    {
      label: "Geciken sevkiyat",
      value: delayed,
      helper: `${totalOpen} açık shipment`,
      href: "/shipments?shipmentStatus=geciken",
      icon: Ship,
      accent: "border-rose-200 bg-rose-50 text-rose-900",
    },
    {
      label: "Eksik evrak",
      value: ordersWithMissing.length,
      helper: "Sipariş dosyası",
      href: "/orders",
      icon: FileWarning,
      accent: "border-amber-200 bg-amber-50 text-amber-950",
    },
    {
      label: "Yakın üretim",
      value: urgentProductionRows.length,
      helper: "7 gün ve gecikenler",
      href: "/orders?orderStatus=uretimde",
      icon: CalendarClock,
      accent: "border-sky-200 bg-sky-50 text-sky-950",
    },
    canSeeFinance
      ? {
          label: "Kalan ödeme",
          value: formatMoney(remainingPayments),
          helper: "USD toplam",
          href: "/orders",
          icon: CircleDollarSign,
          accent: "border-emerald-200 bg-emerald-50 text-emerald-950",
        }
      : {
          label: "Hazır sipariş",
          value: producedOrders.length,
          helper: "Üretim tamam",
          href: "/orders?orderStatus=hazir",
          icon: PackageCheck,
          accent: "border-emerald-200 bg-emerald-50 text-emerald-950",
        },
  ];

  const TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  const orderMonthlyData = (() => {
    const nowChart = new Date();
    const monthlyMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(nowChart.getFullYear(), nowChart.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    (orders ?? []).forEach((order) => {
      if (!order.created_at) return;
      const d = new Date(order.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
      if (monthlyMap.has(key)) monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + 1);
    });
    return Array.from(monthlyMap.entries()).map(([key, count]) => {
      const [, m] = key.split("-");
      return { month: TR_MONTHS[parseInt(m, 10)], count };
    });
  })();

  const supplierDistributionData = (() => {
    const supplierMap = new Map<string, number>();
    (orders ?? []).forEach((order) => {
      const name = supplierNameOf(order);
      supplierMap.set(name, (supplierMap.get(name) ?? 0) + 1);
    });
    const sorted = Array.from(supplierMap.entries()).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5).map(([name, count]) => ({ name, count }));
    const otherCount = sorted.slice(5).reduce((sum, [, count]) => sum + count, 0);
    if (otherCount > 0) top5.push({ name: "Diğer", count: otherCount });
    return top5;
  })();

  const shipmentMax = Math.max(...liveStatusStrip.map((item) => item.value), 1);
  const orderMax = Math.max(...orderLiveStatusStrip.map((item) => item.value), 1);

  return (
    <section className="space-y-6">
      <div className="rounded-lg border border-black/10 bg-[#101817] p-5 text-white shadow-[0_24px_70px_-50px_rgba(16,24,23,0.9)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.32em] text-white/45">
              Operasyon Masası
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight [font-family:var(--font-display)]">
              Bugünün odak işleri
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/62">
              Kritik sevkiyat, evrak, üretim ve ödeme sinyalleri tek ekranda.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 font-semibold text-white/75">
              {new Date().toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <Link
              href="/orders"
              className="rounded-lg border border-white/15 bg-white px-3 py-2 font-semibold text-[#101817] transition hover:-translate-y-0.5"
            >
              Siparişler
            </Link>
            <Link
              href="/shipments"
              className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              Shipments
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {focusCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className={`group rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.accent}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] opacity-60">
                    {card.label}
                  </p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight">
                    {card.value}
                  </p>
                </div>
                <span className="rounded-lg bg-white/80 p-2 shadow-sm ring-1 ring-black/5 transition group-hover:scale-105">
                  <Icon className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-xs font-medium opacity-65">{card.helper}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)]">
        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                Aksiyon Merkezi
              </p>
              <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
                Öncelikli takip listesi
              </h2>
            </div>
            <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/65">
              {actionItems.length} aksiyon
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            {actionItems.length ? (
              actionItems.map((item) => {
                const Icon = item.icon;
                const tone = statusTone[item.tone as keyof typeof statusTone];
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    className={`grid gap-3 rounded-lg border p-3 transition hover:-translate-y-0.5 hover:shadow-sm sm:grid-cols-[auto_1fr_auto] ${tone.shell}`}
                  >
                    <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone.icon}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-black">{item.title}</p>
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.pill}`}>
                          {item.meta}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-black/62">{item.description}</p>
                    </div>
                    <span className="self-center text-xs font-semibold text-black/45">Aç</span>
                  </Link>
                );
              })
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm font-medium text-emerald-800">
                Şu an kritik aksiyon görünmüyor.
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                  Canlı Akış
                </p>
                <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)]">
                  Sipariş durumları
                </h2>
              </div>
              <ClipboardList className="h-5 w-5 text-black/35" />
            </div>
            <div className="mt-4 space-y-3">
              {orderLiveStatusStrip.map((item) => (
                <Link
                  key={item.label}
                  href={`/orders?orderStatus=${item.filter}`}
                  className="block rounded-lg border border-black/8 bg-slate-50 px-3 py-2 transition hover:bg-white hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-black/70">{item.label}</span>
                    <span className="font-bold text-black">{item.value}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8">
                    <div
                      className="h-full rounded-full bg-[var(--ocean)]"
                      style={{ width: `${Math.max(6, (item.value / orderMax) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {!isSales ? (
            <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                    Sevkiyat
                  </p>
                  <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)]">
                    Shipment durumları
                  </h2>
                </div>
                <Ship className="h-5 w-5 text-black/35" />
              </div>
              <div className="mt-4 space-y-3">
                {liveStatusStrip.map((item) => (
                  <Link
                    key={item.label}
                    href={`/shipments?shipmentStatus=${item.filter}`}
                    className="block rounded-lg border border-black/8 bg-slate-50 px-3 py-2 transition hover:bg-white hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-black/70">{item.label}</span>
                      <span className="font-bold text-black">{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/8">
                      <div
                        className="h-full rounded-full bg-[var(--clay)]"
                        style={{ width: `${Math.max(6, (item.value / shipmentMax) * 100)}%` }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
              Üretim Akışı
            </p>
            <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
              Hazırlık ve teslim odağı
            </h2>
          </div>
          <PackageCheck className="h-5 w-5 text-black/35" />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {[
            {
              label: "Tarih bekleyen",
              count: missingReadyOrders.length,
              rows: missingReadyOrders.slice(0, 5).map((order) => ({
                id: order.id,
                title: order.name ?? "Sipariş",
                meta: supplierNameOf(order),
                href: `/orders/${order.id}`,
              })),
              empty: "Tarihsiz sipariş yok.",
              tone: "border-amber-200 bg-amber-50",
            },
            {
              label: "Üretimde",
              count: inProductionOrders.length,
              rows: withCountdown
                .sort((a, b) => (a.diffDays ?? 999) - (b.diffDays ?? 999))
                .slice(0, 5)
                .map(({ order, diffDays }) => ({
                  id: order.id,
                  title: order.name ?? "Sipariş",
                  meta:
                    diffDays === null
                      ? formatDate(order.expected_ready_date)
                      : diffDays < 0
                        ? `${Math.abs(diffDays)} gün gecikti`
                        : diffDays === 0
                          ? "Bugün"
                          : `${diffDays} gün`,
                  href: `/orders/${order.id}`,
                })),
              empty: "Üretimde sipariş yok.",
              tone: "border-sky-200 bg-sky-50",
            },
            {
              label: "Hazır",
              count: producedOrders.length,
              rows: producedOrders.slice(0, 5).map((order) => ({
                id: order.id,
                title: order.name ?? "Sipariş",
                meta: `${formatDate(order.expected_ready_date)} · ${supplierNameOf(order)}`,
                href: `/orders/${order.id}`,
              })),
              empty: "Hazır sipariş yok.",
              tone: "border-emerald-200 bg-emerald-50",
            },
          ].map((column) => (
            <div key={column.label} className={`rounded-lg border p-4 ${column.tone}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-black">{column.label}</p>
                <span className="rounded-md bg-white/80 px-2 py-1 text-xs font-bold text-black/70">
                  {column.count}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {column.rows.length ? (
                  column.rows.map((row) => (
                    <Link
                      key={row.id}
                      href={row.href}
                      className="block rounded-lg border border-black/8 bg-white/75 px-3 py-2 transition hover:bg-white hover:shadow-sm"
                    >
                      <p className="truncate text-sm font-semibold text-black">{row.title}</p>
                      <p className="mt-1 truncate text-xs text-black/55">{row.meta}</p>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-lg border border-black/8 bg-white/65 px-3 py-3 text-xs font-medium text-black/55">
                    {column.empty}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {canSeeFinance ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-black/8 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                  Finans
                </p>
                <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
                  Ödeme görünümü
                </h2>
              </div>
              <CircleDollarSign className="h-5 w-5 text-black/35" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { label: "Bu ay ödendi", value: monthlyPaid, tone: "bg-emerald-50 text-emerald-900" },
                { label: "Bekleyen", value: pendingPayments, tone: "bg-amber-50 text-amber-950" },
                { label: "Kalan", value: remainingPayments, tone: "bg-rose-50 text-rose-900" },
              ].map((item) => (
                <div key={item.label} className={`rounded-lg border border-black/8 p-4 ${item.tone}`}>
                  <p className="text-[11px] uppercase tracking-[0.2em] opacity-65">
                    {item.label}
                  </p>
                  <p className="mt-2 text-xl font-semibold">{formatMoney(item.value)} USD</p>
                </div>
              ))}
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {ordersWithRemainingPayment.length ? (
                ordersWithRemainingPayment.slice(0, 10).map((row) => (
                  <Link
                    key={row.id}
                    href={`/orders/${row.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-black/8 bg-slate-50 px-3 py-2 text-sm transition hover:bg-white hover:shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-black">{row.name}</p>
                      <p className="text-xs text-black/50">{formatDate(row.expected_ready_date)}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold text-rose-700">
                      {formatMoney(row.remaining)} {row.currency}
                    </p>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
                  Kalan ödemesi olan sipariş yok.
                </div>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
            <p className="mb-4 text-[11px] uppercase tracking-[0.28em] text-black/40">
              Aylık Ödeme
            </p>
            <MonthlyOrdersChart data={paymentMonthlyData} />
          </div>
        </section>
      ) : null}

      {!isSales ? (
        <section className="rounded-lg border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-black/8 pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-black/40">
                Analiz
              </p>
              <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)]">
                Trend ve dağılım
              </h2>
            </div>
            <BarChart3 className="h-5 w-5 text-black/35" />
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-black/8 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-black/70">Aylık sipariş trendi</p>
              <MonthlyOrdersChart data={orderMonthlyData} />
            </div>
            <div className="rounded-lg border border-black/8 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-black/70">Tedarikçi dağılımı</p>
              <SupplierDonutChart data={supplierDistributionData} />
            </div>
          </div>
        </section>
      ) : null}
    </section>
  );

}

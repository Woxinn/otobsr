import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import SupplierDonutChart from "@/components/SupplierDonutChart";
import DashboardUploadInbox from "@/components/DashboardUploadInbox";
import ActionCenterList from "@/components/ActionCenterList";
import DashboardChartsCard from "@/components/DashboardChartsCard";
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
      "id, file_no, status, eta_current, atd_actual, ata_actual, warehouse_delivery_date, archived_at"
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
          ata_actual: shipment.ata_actual,
          warehouse_delivery_date: shipment.warehouse_delivery_date,
          status: shipment.status,
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
      label: "Planlandı",
      value: shipmentStatusCounts.planlandi,
      filter: "planlandi",
      barColor: "from-slate-400 to-slate-500",
    },
    {
      label: "Kalkış Limanında",
      value: shipmentStatusCounts.kalkisLimaninda,
      filter: "kalkis-limaninda",
      barColor: "from-amber-400 to-amber-500",
    },
    {
      label: "Denizde",
      value: shipmentStatusCounts.denizde,
      filter: "denizde",
      barColor: "from-sky-400 to-sky-500",
    },
    {
      label: "Varış Limanında",
      value: shipmentStatusCounts.varisLimaninda,
      filter: "varis-limaninda",
      barColor: "from-indigo-400 to-indigo-500",
    },
    {
      label: "Gemiden İndi",
      value: shipmentStatusCounts.gemidenIndi,
      filter: "gemiden-indi",
      barColor: "from-emerald-400 to-emerald-500",
    },
    {
      label: "Geciken",
      value: delayed,
      filter: "geciken",
      barColor: "from-rose-400 to-rose-500",
    },
  ];
  const orderLiveStatusStrip = [
    {
      label: "Sipariş Verildi",
      value: orderStatusCounts.siparisVerildi,
      filter: "siparis-verildi",
      barColor: "from-slate-400 to-slate-500",
    },
    {
      label: "Proforma Geldi",
      value: orderStatusCounts.proformaGeldi,
      filter: "proforma-geldi",
      barColor: "from-amber-400 to-amber-500",
    },
    {
      label: "Üretimde",
      value: orderStatusCounts.uretimde,
      filter: "uretimde",
      barColor: "from-rose-400 to-rose-500",
    },
    {
      label: "Hazır",
      value: orderStatusCounts.hazir,
      filter: "hazir",
      barColor: "from-emerald-400 to-emerald-500",
    },
    {
      label: "Gümrükte",
      value: orderStatusCounts.gumrukte,
      filter: "gumrukte",
      barColor: "from-orange-400 to-orange-500",
    },
    {
      label: "Depoya Teslim",
      value: orderStatusCounts.depoTeslim,
      filter: "depoya-teslim-edildi",
      barColor: "from-teal-400 to-teal-500",
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
      tone: "critical" as const,
      priority: 1,
      icon: "Ship" as const,
    }));

  const missingDocumentActions = ordersWithMissing.slice(0, 5).map((item) => ({
    key: `missing-doc-${item.order.id}`,
    title: item.order.name ?? "Sipariş",
    description: `${item.missing.length} eksik evrak · ${item.missing.slice(0, 2).join(", ")}`,
    meta: formatDate(item.order.expected_ready_date),
    href: `/orders/${item.order.id}`,
    tone: "warning" as const,
    priority: 2,
    icon: "FileWarning" as const,
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
    tone: diffDays !== null && diffDays < 0 ? ("critical" as const) : ("info" as const),
    priority: diffDays !== null && diffDays < 0 ? 1 : 3,
    icon: "CalendarClock" as const,
  }));

  const paymentActions = canSeeFinance
    ? ordersWithRemainingPayment.slice(0, 4).map((row) => ({
        key: `payment-${row.id}`,
        title: row.name,
        description: `${formatMoney(row.remaining)} ${row.currency} kalan ödeme`,
        meta: formatDate(row.expected_ready_date),
        href: `/orders/${row.id}`,
        tone: "money" as const,
        priority: 4,
        icon: "CircleDollarSign" as const,
      }))
    : [];

  const actionItems = [
    ...delayedShipmentActions,
    ...missingDocumentActions,
    ...productionActions,
    ...paymentActions,
  ]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 12) as any[];

  const statusTone = {
    critical: {
      shell: "border-slate-100 hover:border-rose-250 border-l-4 border-l-rose-500 bg-white",
      icon: "bg-rose-50 text-rose-600",
      pill: "bg-rose-50 text-rose-700 border border-rose-100",
      btn: "text-rose-600 hover:text-rose-800 hover:bg-rose-50",
    },
    warning: {
      shell: "border-slate-100 hover:border-amber-250 border-l-4 border-l-amber-500 bg-white",
      icon: "bg-amber-50 text-amber-600",
      pill: "bg-amber-50 text-amber-800 border border-amber-100",
      btn: "text-amber-600 hover:text-amber-800 hover:bg-amber-50",
    },
    info: {
      shell: "border-slate-100 hover:border-sky-250 border-l-4 border-l-sky-500 bg-white",
      icon: "bg-sky-50 text-sky-600",
      pill: "bg-sky-50 text-sky-700 border border-sky-100",
      btn: "text-sky-600 hover:text-sky-800 hover:bg-sky-50",
    },
    money: {
      shell: "border-slate-100 hover:border-emerald-250 border-l-4 border-l-emerald-500 bg-white",
      icon: "bg-emerald-50 text-emerald-600",
      pill: "bg-emerald-50 text-emerald-700 border border-emerald-100",
      btn: "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50",
    },
  };

  const statusStyles = {
    critical: {
      border: "border-l-4 border-l-rose-500 border-slate-100 hover:border-rose-200/80",
      iconBg: "bg-rose-50 text-rose-600",
    },
    warning: {
      border: "border-l-4 border-l-amber-500 border-slate-100 hover:border-amber-200/80",
      iconBg: "bg-amber-50 text-amber-600",
    },
    info: {
      border: "border-l-4 border-l-sky-500 border-slate-100 hover:border-sky-200/80",
      iconBg: "bg-sky-50 text-sky-600",
    },
    success: {
      border: "border-l-4 border-l-emerald-500 border-slate-100 hover:border-emerald-200/80",
      iconBg: "bg-emerald-50 text-emerald-600",
    },
  };

  const focusCards = [
    {
      label: "Geciken sevkiyat",
      value: delayed,
      helper: `${totalOpen} açık sevkiyat`,
      href: "/shipments?shipmentStatus=geciken",
      icon: Ship,
      status: "critical" as const,
    },
    {
      label: "Eksik evrak",
      value: ordersWithMissing.length,
      helper: "Sipariş dökümanı",
      href: "/orders",
      icon: FileWarning,
      status: "warning" as const,
    },
    {
      label: "Yakın üretim",
      value: urgentProductionRows.length,
      helper: "7 gün ve gecikenler",
      href: "/orders?orderStatus=uretimde",
      icon: CalendarClock,
      status: "info" as const,
    },
    canSeeFinance
      ? {
          label: "Kalan ödeme",
          value: `${formatMoney(remainingPayments)} USD`,
          helper: "Ödenecek toplam tutar",
          href: "/orders",
          icon: CircleDollarSign,
          status: "success" as const,
        }
      : {
          label: "Hazır sipariş",
          value: producedOrders.length,
          helper: "Üretimi tamamlanmış",
          href: "/orders?orderStatus=hazir",
          icon: PackageCheck,
          status: "success" as const,
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
      <div className="rounded-2xl border border-emerald-950/20 bg-[#101817] p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/50">
              Operasyon Masası
            </p>
            <h1 className="mt-2 text-2xl font-bold leading-tight text-white [font-family:var(--font-display)]">
              Bugünün odak işleri
            </h1>
            <p className="mt-2 text-sm leading-6 text-white/70">
              Kritik sevkiyat, evrak, üretim ve ödeme sinyalleri tek ekranda.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 font-semibold text-white/80">
              {new Date().toLocaleDateString("tr-TR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <Link
              href="/orders"
              className="rounded-lg bg-white px-3.5 py-2 font-bold text-[#101817] transition hover:-translate-y-0.5 hover:bg-slate-50"
            >
              Siparişler
            </Link>
            <Link
              href="/shipments"
              className="rounded-lg border border-white/10 bg-white/10 px-3.5 py-2 font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/15"
            >
              Sevkiyatlar
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {focusCards.map((card) => {
          const Icon = card.icon;
          const style = statusStyles[card.status];
          return (
            <Link
              key={card.label}
              href={card.href}
              className={`group rounded-xl border bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${style.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 group-hover:text-black">
                    {card.value}
                  </p>
                </div>
                <span className={`rounded-xl p-2.5 shadow-sm transition-all duration-200 group-hover:scale-105 ${style.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-450 group-hover:text-slate-500">
                {card.helper}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                  Aksiyon Merkezi
                </p>
                <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
                  Öncelikli takip listesi
                </h2>
              </div>
              <span className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-655">
                {actionItems.length} aksiyon
              </span>
            </div>

            <div className="mt-4">
              <ActionCenterList actionItems={actionItems} statusTone={statusTone} />
            </div>
          </section>

          <DashboardUploadInbox
            orders={orders ?? []}
            shipments={shipments ?? []}
            documentTypes={documentTypes ?? []}
          />
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                  Canlı Akış
                </p>
                <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)] text-slate-800">
                  Sipariş durumları
                </h2>
              </div>
              <ClipboardList className="h-5 w-5 text-slate-355" />
            </div>
            <div className="mt-4 space-y-3">
              {orderLiveStatusStrip.map((item) => (
                <Link
                  key={item.label}
                  href={`/orders?orderStatus=${item.filter}`}
                  className="block rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 transition-all duration-200 hover:bg-white hover:shadow-sm hover:border-slate-200"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-600">{item.label}</span>
                    <span className="font-bold text-slate-800">{item.value}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${item.barColor}`}
                      style={{ width: `${Math.max(6, (item.value / orderMax) * 100)}%` }}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {!isSales ? (
            <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                    Sevkiyat
                  </p>
                  <h2 className="mt-1 text-lg font-semibold [font-family:var(--font-display)] text-slate-800">
                    Shipment durumları
                  </h2>
                </div>
                <Ship className="h-5 w-5 text-slate-355" />
              </div>
              <div className="mt-4 space-y-3">
                {liveStatusStrip.map((item) => (
                  <Link
                    key={item.label}
                    href={`/shipments?shipmentStatus=${item.filter}`}
                    className="block rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 transition-all duration-200 hover:bg-white hover:shadow-sm hover:border-slate-200"
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-slate-600">{item.label}</span>
                      <span className="font-bold text-slate-800">{item.value}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${item.barColor}`}
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

      <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
              Üretim Akışı
            </p>
            <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
              Hazırlık ve teslim odağı
            </h2>
          </div>
          <PackageCheck className="h-5 w-5 text-slate-350" />
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
              borderTop: "border-t-4 border-t-amber-500/80",
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
                          ? "Bugün hazır olmalı"
                          : `${diffDays} gün içinde hazır`,
                  href: `/orders/${order.id}`,
                })),
              empty: "Üretimde sipariş yok.",
              borderTop: "border-t-4 border-t-sky-500/80",
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
              borderTop: "border-t-4 border-t-emerald-500/80",
            },
          ].map((column) => (
            <div key={column.label} className={`rounded-xl border border-slate-100 bg-slate-50/40 p-4 shadow-sm ${column.borderTop}`}>
              <div className="flex items-center justify-between gap-2 pb-3">
                <p className="text-sm font-semibold text-slate-800">{column.label}</p>
                <span className="rounded-md bg-white border border-slate-200/50 px-2 py-0.5 text-xs font-bold text-slate-650">
                  {column.count}
                </span>
              </div>
              <div className="space-y-2">
                {column.rows.length ? (
                  column.rows.map((row) => (
                    <Link
                      key={row.id}
                      href={row.href}
                      className="block rounded-lg border border-slate-100 bg-white px-3 py-2.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-200"
                    >
                      <p className="truncate text-sm font-semibold text-slate-800">{row.title}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{row.meta}</p>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-lg border border-slate-100 bg-white/50 px-3 py-3 text-xs font-medium text-slate-400 text-center">
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
          <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                  Finans
                </p>
                <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
                  Ödeme görünümü
                </h2>
              </div>
              <CircleDollarSign className="h-5 w-5 text-slate-350" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                { label: "Bu ay ödendi", value: monthlyPaid, border: "border-l-4 border-l-emerald-500", textTone: "text-emerald-700" },
                { label: "Bekleyen", value: pendingPayments, border: "border-l-4 border-l-amber-500", textTone: "text-amber-700" },
                { label: "Kalan", value: remainingPayments, border: "border-l-4 border-l-rose-500", textTone: "text-rose-700" },
              ].map((item) => (
                <div key={item.label} className={`rounded-lg border border-slate-100 bg-white p-4 shadow-sm ${item.border}`}>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {item.label}
                  </p>
                  <p className={`mt-2 text-xl font-bold ${item.textTone}`}>{formatMoney(item.value)} USD</p>
                </div>
              ))}
            </div>
            <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
              {ordersWithRemainingPayment.length ? (
                ordersWithRemainingPayment.slice(0, 10).map((row) => (
                  <Link
                    key={row.id}
                    href={`/orders/${row.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5 text-sm transition-all duration-200 hover:bg-white hover:shadow-sm hover:border-slate-200"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">{row.name}</p>
                      <p className="text-xs text-slate-400">{formatDate(row.expected_ready_date)}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold text-rose-750">
                      {formatMoney(row.remaining)} {row.currency}
                    </p>
                  </Link>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800 text-center">
                  Kalan ödemesi olan sipariş yok.
                </div>
              )}
            </div>
          </div>
          
          <DashboardChartsCard
            orderMonthlyData={orderMonthlyData}
            paymentMonthlyData={paymentMonthlyData}
            canSeeFinance={canSeeFinance}
          />
        </section>
      ) : null}

      {!isSales ? (
        <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
                Analiz
              </p>
              <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
                Trend ve dağılım
              </h2>
            </div>
            <BarChart3 className="h-5 w-5 text-slate-350" />
          </div>
          
          {canSeeFinance ? (
            <div className="mt-5">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 max-w-2xl mx-auto">
                <p className="mb-3 text-sm font-semibold text-slate-650 text-center">Tedarikçi dağılımı</p>
                <SupplierDonutChart data={supplierDistributionData} />
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <DashboardChartsCard
                orderMonthlyData={orderMonthlyData}
                paymentMonthlyData={paymentMonthlyData}
                canSeeFinance={canSeeFinance}
              />
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-600">Tedarikçi dağılımı</p>
                <SupplierDonutChart data={supplierDistributionData} />
              </div>
            </div>
          )}
        </section>
      ) : null}
    </section>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit } from "@/lib/roles";
import { getShipmentFlags } from "@/lib/shipments";
import { ShipmentArchiveButton } from "@/components/ShipmentArchiveButton";
import {
  Search,
  Filter,
  Ship,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Plus,
  FileSpreadsheet,
  ChevronDown,
  MapPin,
  FileText,
} from "lucide-react";

type SearchParams = {
  q?: string;
  forwarder?: string;
  origin?: string;
  destination?: string;
  shipmentStatus?: string;
  etaFrom?: string;
  etaTo?: string;
  inSea?: string;
  overdue?: string;
  missingDocs?: string;
  risk?: string;
  etaWeek?: string;
  archived?: string;
  sort?: string;
  sortDir?: string;
};

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

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

const statusToFilterKey = (value: string | null | undefined) =>
  normalizeStatus(value).replace(/\s+/g, "-");

export const metadata: Metadata = {
  title: "Sevkiyatlar",
};

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  if (role === "Satis") {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/70 shadow-sm">
        Bu modulu goruntuleme yetkiniz yok.
      </section>
    );
  }
  const { data: forwarders } = await supabase
    .from("forwarders")
    .select("id, name")
    .order("name");
  const { data: ports } = await supabase
    .from("ports")
    .select("id, name")
    .order("name");
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

  const sortKey = resolvedParams.sort ?? "eta";
  const sortDirParam = resolvedParams.sortDir ?? "";
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    eta: { column: "eta_current", ascending: true },
    etd: { column: "etd_planned", ascending: true },
    created: { column: "created_at", ascending: false },
  };
  const baseSort = sortMap[sortKey] ?? sortMap.eta;
  const sortAscending =
    sortDirParam === "asc"
      ? true
      : sortDirParam === "desc"
      ? false
      : baseSort.ascending;
  const sortConfig = { ...baseSort, ascending: sortAscending };

  const { data: shipments } = await supabase
    .from("shipments")
    .select(
      "id, file_no, reference, tags, eta_current, etd_planned, atd_actual, ata_actual, status, container_no, archived_at, warehouse_delivery_date, forwarders(name), origin_port:ports!origin_port_id(name), destination_port:ports!destination_port_id(name)"
    )
    .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false });

  const archivedMode = (resolvedParams.archived ?? "").toLowerCase();
  const exportParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (value) {
      exportParams.set(key, value);
    }
  });
  const exportUrl = `/api/shipments/export?${exportParams.toString()}`;

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

  const formatMoney = (
    value: number | null | undefined,
    currency: string | null | undefined
  ) => {
    if (value === null || value === undefined) return "-";
    return `${Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString("tr-TR");
  };

  const filteredShipments =
    archivedMode === "only"
      ? (shipments ?? []).filter((item) => Boolean(item.archived_at))
      : archivedMode === "all"
      ? shipments ?? []
      : (shipments ?? []).filter((item) => !item.archived_at);

  const shipmentIds = filteredShipments.map((item) => item.id);
  const { data: shipmentOrdersRows } = shipmentIds.length
    ? await supabase
        .from("shipment_orders")
        .select(
          "shipment_id, orders(id, name, reference_name, packages, weight_kg, total_amount, currency, notes)"
        )
        .in("shipment_id", shipmentIds)
        .order("created_at", { ascending: true })
        .range(0, 9999)
    : { data: [] };

  const orderIds = shipmentOrdersRows
    ?.flatMap((item) => {
      const orderList = item.orders
        ? Array.isArray(item.orders)
          ? item.orders
          : [item.orders]
        : [];
      return orderList.map((order) => order.id);
    })
    .filter(Boolean);

  const { data: orderPackingSummaries } = orderIds?.length
    ? await supabase
        .from("order_packing_list_summary")
        .select("order_id, total_packages")
        .in("order_id", orderIds)
    : { data: [] };

  const { data: orderPackingItems } = orderIds?.length
    ? await supabase
        .from("order_packing_list_items")
        .select("order_id, packages_count")
        .in("order_id", orderIds)
        .range(0, 9999)
    : { data: [] };

  const { data: orderDocuments } = orderIds?.length
    ? await supabase
        .from("order_documents")
        .select("order_id, document_type_id, status")
        .in("order_id", orderIds)
    : { data: [] };

  const ordersByShipment = new Map<string, typeof shipmentOrdersRows>();
  const orderTotalsByShipment = new Map<
    string,
    { packages: number; weight: number; amount: number }
  >();
  const packingPackagesByOrder = new Map<string, number>();
  orderPackingSummaries?.forEach((row) => {
    if (!row.order_id) return;
    packingPackagesByOrder.set(row.order_id, Number(row.total_packages ?? 0));
  });
  const packingItemsByOrder = new Map<string, number>();
  orderPackingItems?.forEach((row) => {
    if (!row.order_id) return;
    const current = packingItemsByOrder.get(row.order_id) ?? 0;
    packingItemsByOrder.set(
      row.order_id,
      current + Number(row.packages_count ?? 0)
    );
  });

  const getOrderPackages = (order: {
    id: string;
    packages: number | null;
  }) =>
    packingPackagesByOrder.has(order.id)
      ? Number(packingPackagesByOrder.get(order.id) ?? 0)
      : packingItemsByOrder.has(order.id)
      ? Number(packingItemsByOrder.get(order.id) ?? 0)
      : Number(order.packages ?? 0);

  shipmentOrdersRows?.forEach((item) => {
    if (!item.shipment_id) return;
    const list = ordersByShipment.get(item.shipment_id) ?? [];
    list.push(item);
    ordersByShipment.set(item.shipment_id, list);

    const orderList = item.orders
      ? Array.isArray(item.orders)
        ? item.orders
        : [item.orders]
      : [];

    const current =
      orderTotalsByShipment.get(item.shipment_id) ?? {
        packages: 0,
        weight: 0,
        amount: 0,
      };

    const updated = orderList.reduce(
      (acc, order) => {
        acc.packages += getOrderPackages(order);
        acc.weight += Number(order.weight_kg ?? 0);
        acc.amount += Number(order.total_amount ?? 0);
        return acc;
      },
      { ...current }
    );

    orderTotalsByShipment.set(item.shipment_id, updated);
  });
  const { data: documents } = shipmentIds.length
    ? await supabase
        .from("documents")
        .select("shipment_id, document_type_id, status")
        .in("shipment_id", shipmentIds)
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
  shipmentOrdersRows?.forEach((row) => {
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

  const { monday, sunday } = getWeekRange();
  const query = resolvedParams.q?.toLowerCase();
  const shipmentStatusFilter = (resolvedParams.shipmentStatus ?? "").trim().toLowerCase();
  const orderShipmentIds = new Set<string>();
  if (query) {
    shipmentOrdersRows?.forEach((item) => {
      if (!item.shipment_id || !item.orders) return;
      const orderList = Array.isArray(item.orders)
        ? item.orders
        : [item.orders];
      const matches = orderList.some((order) => {
        const name = order.name?.toLowerCase() ?? "";
        const reference = order.reference_name?.toLowerCase() ?? "";
        const notes = order.notes?.toLowerCase() ?? "";
        return (
          name.includes(query) ||
          reference.includes(query) ||
          notes.includes(query)
        );
      });
      if (matches) {
        orderShipmentIds.add(item.shipment_id);
      }
    });
  }

  let filtered = filteredShipments;

  if (query) {
    filtered = filtered.filter((item) => {
      const tags = Array.isArray(item.tags) ? item.tags.join(" ") : "";
        const inOrders = orderShipmentIds.has(item.id);
        return (
          item.file_no?.toLowerCase().includes(query) ||
          item.container_no?.toLowerCase().includes(query) ||
          tags.toLowerCase().includes(query) ||
          inOrders
        );
      });
    }

  if (resolvedParams.forwarder) {
    filtered = filtered.filter(
      (item) =>
        (Array.isArray((item as any).forwarders)
          ? (item as any).forwarders[0]?.name
          : (item as any).forwarders?.name) === resolvedParams.forwarder
    );
  }
  if (resolvedParams.origin) {
    filtered = filtered.filter(
      (item) =>
        (Array.isArray((item as any).origin_port)
          ? (item as any).origin_port[0]?.name
          : (item as any).origin_port?.name) === resolvedParams.origin
    );
  }
  if (resolvedParams.destination) {
    filtered = filtered.filter(
      (item) =>
        (Array.isArray((item as any).destination_port)
          ? (item as any).destination_port[0]?.name
          : (item as any).destination_port?.name) === resolvedParams.destination
    );
  }
  if (shipmentStatusFilter && shipmentStatusFilter !== "geciken") {
    filtered = filtered.filter(
      (item) => statusToFilterKey(item.status) === shipmentStatusFilter
    );
  }
  if (resolvedParams.inSea === "1") {
    filtered = filtered.filter((item) => item.atd_actual);
  }
  if (resolvedParams.etaWeek === "1") {
    filtered = filtered.filter((item) => {
      if (!item.eta_current) return false;
      const eta = new Date(item.eta_current);
      return eta >= monday && eta <= sunday;
    });
  }
  if (resolvedParams.etaFrom) {
    const from = new Date(resolvedParams.etaFrom);
    filtered = filtered.filter(
      (item) => item.eta_current && new Date(item.eta_current) >= from
    );
  }
  if (resolvedParams.etaTo) {
    const to = new Date(resolvedParams.etaTo);
    filtered = filtered.filter(
      (item) => item.eta_current && new Date(item.eta_current) <= to
    );
  }

  const shipmentCards = filtered.map((shipment) => {
    const shipmentDocs = documentsByShipment.get(shipment.id) ?? [];
    const flags = getShipmentFlags(
      {
        eta_current: shipment.eta_current,
        ata_actual: shipment.ata_actual,
        warehouse_delivery_date: shipment.warehouse_delivery_date,
        status: shipment.status,
      },
      shipmentDocs,
      shipmentDocumentTypes
    );
    return { shipment, flags };
  });

  if (resolvedParams.missingDocs === "1") {
    filtered = shipmentCards
      .filter((item) => item.flags.missingRequiredCount > 0)
      .map((item) => item.shipment);
  }
  if (resolvedParams.overdue === "1" || shipmentStatusFilter === "geciken") {
    filtered = shipmentCards
      .filter((item) => item.flags.overdue)
      .map((item) => item.shipment);
  }
  if (resolvedParams.risk) {
    filtered = shipmentCards
      .filter((item) => item.flags.risk === resolvedParams.risk)
      .map((item) => item.shipment);
  }

  const enriched = filtered.map((shipment) => {
    const shipmentDocs = documentsByShipment.get(shipment.id) ?? [];
    const flags = getShipmentFlags(
      {
        eta_current: shipment.eta_current,
        ata_actual: shipment.ata_actual,
        warehouse_delivery_date: shipment.warehouse_delivery_date,
        status: shipment.status,
      },
      shipmentDocs,
      shipmentDocumentTypes
    );
    return { shipment, flags };
  });

  const activeFilters: string[] = [];
  if (resolvedParams.q) activeFilters.push(`Arama: "${resolvedParams.q}"`);
  if (resolvedParams.forwarder) activeFilters.push(`Forwarder: ${resolvedParams.forwarder}`);
  if (resolvedParams.risk) activeFilters.push(`Risk: ${resolvedParams.risk}`);
  if (resolvedParams.origin) activeFilters.push(`Çıkış: ${resolvedParams.origin}`);
  if (resolvedParams.destination) activeFilters.push(`Varış: ${resolvedParams.destination}`);
  if (resolvedParams.etaFrom) activeFilters.push(`ETA Başlangıç: ${formatDate(resolvedParams.etaFrom)}`);
  if (resolvedParams.etaTo) activeFilters.push(`ETA Bitiş: ${formatDate(resolvedParams.etaTo)}`);
  if (resolvedParams.inSea === "1") activeFilters.push("Denizde");
  if (resolvedParams.etaWeek === "1") activeFilters.push("Bu Hafta ETA");
  if (resolvedParams.overdue === "1" || shipmentStatusFilter === "geciken") activeFilters.push("Geciken");
  if (resolvedParams.missingDocs === "1") activeFilters.push("Evrak Eksik");
  if (resolvedParams.archived === "only") activeFilters.push("Sadece Arşiv");
  if (resolvedParams.archived === "all") activeFilters.push("Aktif + Arşiv");

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ocean)]/10 text-[var(--ocean)]">
              <Ship className="h-5 w-5" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-black/40">
              Operasyon Yönetimi
            </p>
          </div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#1a1a1a] [font-family:var(--font-display)] md:text-3xl">
            Sevkiyat Takip Paneli
          </h2>
          <p className="mt-1 text-sm text-black/50">
            {enriched.length} sevkiyat listeleniyor • Konteyner bazlı takip ve dokümantasyon kontrolü
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={exportUrl}
            className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/75 shadow-sm transition hover:bg-slate-50 hover:-translate-y-0.5"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Dışa Aktar (CSV)
          </Link>
          {canEditPage && (
            <Link
              href="/shipments/new"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--ocean)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-black hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4" />
              Yeni Sevkiyat Ekle
            </Link>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-black/8 bg-white/70 shadow-sm backdrop-blur">
        <form className="p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-black/40">
                <Search className="h-4.5 w-4.5" />
              </span>
              <input
                name="q"
                defaultValue={resolvedParams.q ?? ""}
                placeholder="Dosya No, Konteyner No veya Sipariş adı ile arayın..."
                className="w-full rounded-xl border border-black/10 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[var(--ocean)] focus:ring-2 focus:ring-[var(--ocean)]/10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className="rounded-xl bg-[var(--ocean)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-black transition cursor-pointer"
              >
                Ara
              </button>
              <Link
                href="/shipments"
                className="rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-semibold text-black/70 hover:bg-slate-50 transition"
              >
                Temizle
              </Link>
            </div>
          </div>

          <details className="group mt-4 border-t border-black/5 pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wider text-[var(--ocean)] hover:text-black select-none">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5" />
                <span>GELİŞMİŞ FİLTRELER</span>
                {activeFilters.length > 0 && (
                  <span className="ml-2 rounded-full bg-[var(--ocean)]/10 px-2 py-0.5 text-[10px] text-[var(--ocean)] font-bold">
                    {activeFilters.length} aktif
                  </span>
                )}
              </div>
              <span className="transition-transform duration-250 group-open:rotate-180">
                <ChevronDown className="h-4 w-4" />
              </span>
            </summary>
            
            <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 text-sm">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Forwarder</label>
                <select
                  name="forwarder"
                  defaultValue={resolvedParams.forwarder ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="">Tümü</option>
                  {forwarders?.map((forwarder) => (
                    <option key={forwarder.id} value={forwarder.name}>
                      {forwarder.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Risk Seviyesi</label>
                <select
                  name="risk"
                  defaultValue={resolvedParams.risk ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="">Tümü</option>
                  <option value="Kritik">Kritik (Geciken)</option>
                  <option value="Uyari">Uyarı</option>
                  <option value="Normal">Normal</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Çıkış Limanı</label>
                <select
                  name="origin"
                  defaultValue={resolvedParams.origin ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="">Tümü</option>
                  {ports?.map((port) => (
                    <option key={port.id} value={port.name}>
                      {port.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Varış Limanı</label>
                <select
                  name="destination"
                  defaultValue={resolvedParams.destination ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="">Tümü</option>
                  {ports?.map((port) => (
                    <option key={port.id} value={port.name}>
                      {port.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Sıralama Kriteri</label>
                <select
                  name="sort"
                  defaultValue={resolvedParams.sort ?? "eta"}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="eta">ETA (Tahmini Varış)</option>
                  <option value="etd">ETD (Planlanan Kalkış)</option>
                  <option value="created">Oluşturulma Tarihi</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Sıralama Yönü</label>
                <select
                  name="sortDir"
                  defaultValue={resolvedParams.sortDir ?? (sortKey === "created" ? "desc" : "asc")}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="asc">Artan</option>
                  <option value="desc">Azalan</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">ETA Başlangıç</label>
                <input
                  type="date"
                  name="etaFrom"
                  defaultValue={resolvedParams.etaFrom ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">ETA Bitiş</label>
                <input
                  type="date"
                  name="etaTo"
                  defaultValue={resolvedParams.etaTo ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-black/60">Arşiv Durumu</label>
                <select
                  name="archived"
                  defaultValue={resolvedParams.archived ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--ocean)]"
                >
                  <option value="">Sadece Aktifler</option>
                  <option value="all">Tümü (Aktif + Arşiv)</option>
                  <option value="only">Sadece Arşiv</option>
                </select>
              </div>

              <div className="sm:col-span-2 md:col-span-3 lg:col-span-3 mt-2">
                <span className="block text-xs font-bold text-black/40 uppercase tracking-wider mb-2">Durum Filtreleri</span>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black/70 hover:text-black">
                    <input
                      type="checkbox"
                      name="inSea"
                      value="1"
                      defaultChecked={resolvedParams.inSea === "1"}
                      className="rounded border-black/10 text-[var(--ocean)] focus:ring-[var(--ocean)]"
                    />
                    Denizde Olanlar (ATD girilmiş)
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black/70 hover:text-black">
                    <input
                      type="checkbox"
                      name="etaWeek"
                      value="1"
                      defaultChecked={resolvedParams.etaWeek === "1"}
                      className="rounded border-black/10 text-[var(--ocean)] focus:ring-[var(--ocean)]"
                    />
                    Bu Hafta ETA
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black/70 hover:text-black">
                    <input
                      type="checkbox"
                      name="overdue"
                      value="1"
                      defaultChecked={resolvedParams.overdue === "1"}
                      className="rounded border-black/10 text-[var(--ocean)] focus:ring-[var(--ocean)]"
                    />
                    Gecikmiş Sevkiyatlar
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-black/70 hover:text-black">
                    <input
                      type="checkbox"
                      name="missingDocs"
                      value="1"
                      defaultChecked={resolvedParams.missingDocs === "1"}
                      className="rounded border-black/10 text-[var(--ocean)] focus:ring-[var(--ocean)]"
                    />
                    Kritik Evrakı Eksik
                  </label>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end gap-2 border-t border-black/5 pt-4">
              <button
                type="submit"
                className="rounded-lg bg-[var(--ocean)] px-4 py-2 text-xs font-bold text-white hover:bg-black transition cursor-pointer"
              >
                Filtreleri Uygula
              </button>
            </div>
          </details>
        </form>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--sand)]/30 border border-[var(--sand)]/60 px-4 py-2.5 text-xs text-[#5c4a22]">
          <span className="font-bold uppercase tracking-wider text-[10px] text-black/55 mr-1">Aktif Filtreler:</span>
          {activeFilters.map((filter, index) => (
            <span key={index} className="rounded-lg bg-white/70 border border-black/5 px-2.5 py-1 font-semibold shadow-xs">
              {filter}
            </span>
          ))}
          <Link
            href="/shipments"
            className="ml-auto font-bold text-[var(--ocean)] hover:underline flex items-center gap-1 text-[11px]"
          >
            Tümünü Sıfırla
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {enriched.length ? (
          enriched.map(({ shipment, flags }) => {
            const missingDocsTotal = flags.missingRequiredCount + (orderMissingByShipment.get(shipment.id) ?? 0);
            
            let borderAccent = "border-l-[var(--ocean)]";
            let dotColor = "bg-[var(--ocean)]";
            let riskBadgeStyle = "bg-slate-100 text-slate-700 border-slate-200";
            if (flags.risk === "Kritik") {
              borderAccent = "border-l-red-500";
              dotColor = "bg-red-500 animate-pulse";
              riskBadgeStyle = "bg-red-50 text-red-700 border-red-200";
            } else if (flags.risk === "Uyari") {
              borderAccent = "border-l-amber-500";
              dotColor = "bg-amber-500";
              riskBadgeStyle = "bg-amber-50 text-amber-700 border-amber-200";
            } else if (shipment.atd_actual && !shipment.ata_actual) {
              borderAccent = "border-l-emerald-500";
              dotColor = "bg-emerald-500";
            }

            const normStatus = normalizeStatus(shipment.status);
            const statusSteps = [
              { label: "Planlandı", active: true },
              { label: "Kalkış", active: Boolean(shipment.atd_actual) },
              { label: "Denizde", active: Boolean(shipment.atd_actual && !shipment.ata_actual) || ["denizde"].includes(normStatus) },
              { label: "Varış", active: Boolean(shipment.ata_actual) || ["gemiden indi", "gumrukte", "depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus) },
              { label: "Gümrük", active: ["gumrukte", "depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus) },
              { label: "Depoda", active: Boolean(shipment.warehouse_delivery_date) || ["depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus) },
            ];

            const forwarderDisplay = Array.isArray(shipment.forwarders)
              ? shipment.forwarders[0]?.name
              : (shipment.forwarders as any)?.name ?? "-";
            const originPortDisplay = Array.isArray(shipment.origin_port)
              ? shipment.origin_port[0]?.name
              : (shipment.origin_port as any)?.name ?? "-";
            const destPortDisplay = Array.isArray(shipment.destination_port)
              ? shipment.destination_port[0]?.name
              : (shipment.destination_port as any)?.name ?? "-";

            return (
              <div
                key={shipment.id}
                className={`rounded-2xl border border-black/10 bg-white/95 p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-black/15 ${borderAccent} border-l-4`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-[var(--ocean)]/5 px-2.5 py-1 text-xs font-bold text-[var(--ocean)]">
                        <Ship className="h-3.5 w-3.5" />
                        {shipment.file_no}
                      </span>
                      {shipment.reference && (
                        <span className="text-xs font-semibold text-black/50">
                          Konşimento: <span className="text-black/80 font-bold">{shipment.reference}</span>
                        </span>
                      )}
                      {shipment.container_no && (
                        <span className="rounded-md border border-black/10 bg-slate-50 px-2 py-0.5 text-[10px] font-mono font-bold text-black/60">
                          {shipment.container_no}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-black/60">
                      {forwarderDisplay && (
                        <span className="font-semibold text-black/85">
                          {forwarderDisplay}
                        </span>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1 font-medium">
                        <MapPin className="h-3 w-3 text-black/40" />
                        {originPortDisplay} → {destPortDisplay}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {shipment.archived_at && (
                      <span className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Arşivde
                      </span>
                    )}

                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${riskBadgeStyle}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                      Risk: {flags.risk}
                    </span>

                    {missingDocsTotal > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {missingDocsTotal} Eksik Evrak
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Evraklar Tam
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-black/5 bg-slate-50/50 px-4 py-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-black/40">
                    <span className="uppercase tracking-wider">Lojistik İlerleme Durumu</span>
                    <span className="rounded-full bg-[var(--ocean)]/10 px-2.5 py-0.5 text-xs text-[var(--ocean)] font-bold">
                      {shipment.status ?? "Planlandı"}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center">
                    {statusSteps.map((step, idx) => {
                      const isLast = idx === statusSteps.length - 1;
                      return (
                        <div key={step.label} className="flex flex-1 items-center">
                          <div className="flex flex-col items-center flex-1">
                            <div className="relative w-full flex items-center justify-center">
                              {!isLast && (
                                <div
                                  className={`absolute left-[50%] right-[-50%] top-[4px] h-[3px] -translate-y-1/2 transition-colors duration-300 ${
                                    step.active && statusSteps[idx + 1]?.active
                                      ? "bg-[var(--ocean)]"
                                      : "bg-black/10"
                                  }`}
                                />
                              )}
                              <div
                                className={`relative z-10 h-2.5 w-2.5 rounded-full border-2 transition-all duration-300 ${
                                  step.active
                                    ? "border-[var(--ocean)] bg-[var(--ocean)] scale-110 shadow-xs"
                                    : "border-black/20 bg-white"
                                }`}
                                title={step.label}
                              />
                            </div>
                            <span
                              className={`mt-1.5 text-[9px] font-bold tracking-tight hidden sm:block ${
                                step.active ? "text-[var(--ocean)] font-extrabold" : "text-black/35"
                              }`}
                            >
                              {step.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-black/5 bg-white p-3 lg:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-2">Sevkiyat Siparişleri</p>
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                      {(ordersByShipment.get(shipment.id) ?? []).length ? (
                        (ordersByShipment.get(shipment.id) ?? []).flatMap((row) => {
                          const orderList = row.orders
                            ? Array.isArray(row.orders)
                              ? row.orders
                              : [row.orders]
                            : [];
                          return orderList.map((order) => {
                            const orderDocs = orderDocumentsByOrder.get(order.id) ?? [];
                            const orderMissingCount = requiredOrderTypes.filter((type) => {
                              const hasReceived = orderDocs.some(
                                (doc) => doc.document_type_id === type.id && doc.status === "Geldi"
                              );
                              return !hasReceived;
                            }).length;

                            return (
                              <div
                                key={`${shipment.id}-${order.id}`}
                                className="flex items-center justify-between rounded-lg border border-black/5 bg-slate-50/40 p-2 text-xs hover:bg-slate-50 transition"
                              >
                                <div className="flex items-center gap-2">
                                  <FileText className="h-3.5 w-3.5 text-black/35" />
                                  <Link
                                    href={`/orders/${order.id}`}
                                    className="font-bold text-[var(--ocean)] hover:underline"
                                  >
                                    {order.name ?? order.reference_name ?? "-"}
                                  </Link>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-black/50 font-medium">{formatNumber(order.weight_kg)} kg</span>
                                  <span className="font-bold text-black/75">
                                    {formatMoney(order.total_amount ?? null, order.currency)}
                                  </span>
                                  {orderMissingCount > 0 && (
                                    <span className="rounded bg-red-50 border border-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-600">
                                      {orderMissingCount} eksik evrak
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          });
                        })
                      ) : (
                        <div className="rounded-lg border border-dashed border-black/10 py-3 text-center text-xs text-black/40 font-medium">
                          Bu sevkiyata atanmış sipariş bulunamadı.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between rounded-xl border border-black/5 bg-slate-50/30 p-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-black/40 mb-2">Tarih & Yük Özeti</p>
                      <div className="space-y-1.5 text-xs text-black/70">
                        <div className="flex justify-between">
                          <span className="text-black/55 font-medium">Planlanan ETA:</span>
                          <span className="font-bold text-black/90 flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-black/30" />
                            {formatDate(shipment.eta_current)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-black/55 font-medium">Toplam Ağırlık:</span>
                          <span className="font-bold text-black/90">
                            {formatNumber(orderTotalsByShipment.get(shipment.id)?.weight ?? 0)} kg
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-black/55 font-medium">Toplam Değer:</span>
                          <span className="font-bold text-[var(--ocean)]">
                            {formatMoney(orderTotalsByShipment.get(shipment.id)?.amount ?? 0, "USD")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2 border-t border-black/5 pt-2">
                      {canEditPage && (
                        <ShipmentArchiveButton
                          shipmentId={shipment.id}
                          archived={Boolean(shipment.archived_at)}
                        />
                      )}
                      <Link
                        href={`/shipments/${shipment.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[var(--ocean)] px-3 py-1.5 text-xs font-bold text-white hover:bg-black transition"
                      >
                        Detaylar
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-2xl border border-black/10 bg-white p-10 text-center shadow-xs">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Ship className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-black/80">Sevkiyat Bulunamadı</h3>
            <p className="mt-1 text-xs text-black/50">
              Filtrelere uygun sevkiyat kaydı bulunmamaktadır. Lütfen arama kriterlerini güncelleyin.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

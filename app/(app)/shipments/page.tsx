import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit } from "@/lib/roles";
import { getShipmentFlags } from "@/lib/shipments";

type SearchParams = {
  q?: string;
  forwarder?: string;
  origin?: string;
  destination?: string;
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

  const sortKey = resolvedParams.sort ?? "created";
  const sortDirParam = resolvedParams.sortDir ?? "";
  const sortMap: Record<string, { column: string; ascending: boolean }> = {
    eta: { column: "eta_current", ascending: true },
    etd: { column: "etd_planned", ascending: true },
    created: { column: "created_at", ascending: false },
  };
  const baseSort = sortMap[sortKey] ?? sortMap.created;
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
      "id, file_no, reference, tags, eta_current, etd_planned, atd_actual, status, container_no, archived_at, warehouse_delivery_date, forwarders(name), origin_port:ports!origin_port_id(name), destination_port:ports!destination_port_id(name)"
    )
    .order(sortConfig.column, { ascending: sortConfig.ascending, nullsFirst: false });

  const includeArchived = resolvedParams.archived === "1";
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

  const filteredShipments = includeArchived
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
        warehouse_delivery_date: shipment.warehouse_delivery_date,
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
  if (resolvedParams.overdue === "1") {
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
        warehouse_delivery_date: shipment.warehouse_delivery_date,
      },
      shipmentDocs,
      shipmentDocumentTypes
    );
    return { shipment, flags };
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Shipments listesi
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Konteyner bazli liste ve filtreleme
          </h2>
        </div>
        {canEditPage ? (
          <Link
            href="/shipments/new"
            className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
          >
            Yeni shipment
          </Link>
        ) : null}
      </div>

      <form className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-4">
          <label className="text-sm font-medium">
            Arama
            <input
              name="q"
              defaultValue={resolvedParams.q ?? ""}
              placeholder="Dosya No, Konteyner No, Siparis"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Forwarder
            <select
              name="forwarder"
              defaultValue={resolvedParams.forwarder ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {forwarders?.map((forwarder) => (
                <option key={forwarder.id} value={forwarder.name}>
                  {forwarder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Risk
            <select
              name="risk"
              defaultValue={resolvedParams.risk ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              <option value="Kritik">Kritik</option>
              <option value="Uyari">Uyari</option>
              <option value="Normal">Normal</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Sıralama
            <select
              name="sort"
              defaultValue={resolvedParams.sort ?? "created"}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="created">Eklenme tarihi</option>
              <option value="eta">ETA</option>
              <option value="etd">ETD</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Sıralama yönü
            <select
              name="sortDir"
              defaultValue={resolvedParams.sortDir ?? (sortKey === "created" ? "desc" : "asc")}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="asc">Artan</option>
              <option value="desc">Azalan</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Çıkış limani
            <select
              name="origin"
              defaultValue={resolvedParams.origin ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {ports?.map((port) => (
                <option key={port.id} value={port.name}>
                  {port.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Varış limanı
            <select
              name="destination"
              defaultValue={resolvedParams.destination ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Hepsi</option>
              {ports?.map((port) => (
                <option key={port.id} value={port.name}>
                  {port.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            ETA baslangic
            <input
              type="date"
              name="etaFrom"
              defaultValue={resolvedParams.etaFrom ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            ETA bitis
            <input
              type="date"
              name="etaTo"
              defaultValue={resolvedParams.etaTo ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="inSea"
                value="1"
                defaultChecked={resolvedParams.inSea === "1"}
              />
              Denizde olanlar (ATD girildi)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="etaWeek"
                value="1"
                defaultChecked={resolvedParams.etaWeek === "1"}
              />
              Bu hafta ETA
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="overdue"
                value="1"
                defaultChecked={resolvedParams.overdue === "1"}
              />
              Geciken
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="missingDocs"
                value="1"
                defaultChecked={resolvedParams.missingDocs === "1"}
              />
              Evrak eksik
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="archived"
                value="1"
                defaultChecked={resolvedParams.archived === "1"}
              />
              Arsivdekiler dahil
            </label>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
            Filtrele
          </button>
          <Link
            href="/shipments"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Temizle
          </Link>
        </div>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-end">
          <Link
            href={exportUrl}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Export CSV
          </Link>
        </div>
        <div className="grid gap-5 text-sm">
          {enriched.length ? (
            enriched.map(({ shipment, flags }) => (
              <div
                key={shipment.id}
                className={`rounded-3xl border border-black/10 p-5 shadow-sm ${
                  flags.overdue
                    ? "bg-[#f7d6d6]"
                    : flags.etaApproaching
                    ? "bg-[#f6edcf]"
                    : "bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-black/45">
                      Shipment
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-lg font-semibold">
                        {shipment.file_no}
                      </span>
                      <span className="text-sm text-black/60">
                        Konşimento No: {shipment.reference ?? "-"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-semibold">
                        ETA: {formatDate(shipment.eta_current)}
                      </span>
                      <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-semibold">
                        Durum: {shipment.status ?? "-"}
                      </span>
                      <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-semibold">
                        Risk: {flags.risk}
                      </span>
                      <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-semibold">
                        Evrak:{" "}
                        {flags.missingRequiredCount +
                          (orderMissingByShipment.get(shipment.id) ?? 0) >
                        0
                          ? `${
                              flags.missingRequiredCount +
                              (orderMissingByShipment.get(shipment.id) ?? 0)
                            } eksik`
                          : flags.hasProblematic
                          ? "Sorunlu"
                          : "Tamam"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3 text-xs text-black/60">
                    <div className="rounded-2xl border border-black/10 bg-white/70 px-4 py-2">
                      <p className="uppercase tracking-[0.2em] text-black/40">
                        Toplamlar
                      </p>
                      <p className="mt-1 text-xs text-black/70">
                        {formatNumber(orderTotalsByShipment.get(shipment.id)?.weight ?? 0)} kg |{" "}
                        {formatMoney(orderTotalsByShipment.get(shipment.id)?.amount ?? 0, "USD")}
                      </p>
                    </div>
                    <Link
                      href={`/shipments/${shipment.id}`}
                      className="rounded-full border border-black/20 px-4 py-1 text-xs font-semibold"
                    >
                      Detay
                    </Link>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-black/10 bg-[var(--sky)]/30 px-4 py-3">
                  <div className="grid grid-cols-[1.8fr_0.8fr_0.9fr] gap-3 text-xs uppercase tracking-[0.2em] text-black/40">
                    <span>Siparis</span>
                    <span>Kg</span>
                    <span>Tutar (USD)</span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {(ordersByShipment.get(shipment.id) ?? []).length ? (
                      (ordersByShipment.get(shipment.id) ?? []).flatMap(
                        (row) => {
                          const orderList = row.orders
                            ? Array.isArray(row.orders)
                              ? row.orders
                              : [row.orders]
                            : [];
                          return orderList.map((order) => (
                            <div
                              key={`${shipment.id}-${order.id}`}
                              className="grid grid-cols-[1.8fr_0.8fr_0.9fr] gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
                            >
                              <Link
                                href={`/orders/${order.id}`}
                                className="font-semibold text-[var(--ocean)] hover:underline"
                              >
                                {order.name ?? order.reference_name ?? "-"}
                              </Link>
                              <span>{formatNumber(order.weight_kg)}</span>
                              <span>{formatMoney(order.total_amount ?? null, order.currency)}</span>
                            </div>
                          ));
                        }
                      )
                    ) : (
                      <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs text-black/60">
                        Bu shipment icin siparis secilmedi.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-6 text-sm text-black/70">
              Filtrelere uygun shipment bulunamadi.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



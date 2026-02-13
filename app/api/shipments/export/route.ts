import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";

function toCsvRow(values: (string | number | null | undefined)[]) {
  return values
    .map((value) => {
      const text = value === null || value === undefined ? "" : String(value);
      const escaped = text.replace(/"/g, '""');
      return `"${escaped}"`;
    })
    .join(",");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, is_critical");

  const { data: shipments } = await supabase
    .from("shipments")
    .select(
      "id, file_no, reference, tags, eta_current, atd_actual, etd_planned, ata_actual, customs_entry_date, warehouse_delivery_date, status, container_type, container_no, seal_no, notes, archived_at, forwarders(name), origin_port:ports!origin_port_id(name), destination_port:ports!destination_port_id(name)"
    )
    .order("created_at", { ascending: false });

  const includeArchived = params.get("archived") === "1";
  const filteredShipments = includeArchived
    ? shipments ?? []
    : (shipments ?? []).filter((item) => !item.archived_at);

  const shipmentIds = filteredShipments.map((item) => item.id);

  const [documentsResp, shipmentOrdersResp] = await Promise.all([
    shipmentIds.length
      ? supabase
          .from("documents")
          .select("shipment_id, document_type_id, status")
          .in("shipment_id", shipmentIds)
      : Promise.resolve({ data: [] }),
    shipmentIds.length
      ? supabase
          .from("shipment_orders")
          .select(
            "shipment_id, orders(id, name, reference_name, packages, weight_kg, total_amount)"
          )
          .in("shipment_id", shipmentIds)
      : Promise.resolve({ data: [] }),
  ]);

  const documents = documentsResp.data ?? [];
  const shipmentOrders = shipmentOrdersResp.data ?? [];

  const documentsByShipment = new Map<string, typeof documents>();
  documents.forEach((doc) => {
    if (!doc.shipment_id) return;
    const list = documentsByShipment.get(doc.shipment_id) ?? [];
    list.push(doc);
    documentsByShipment.set(doc.shipment_id, list);
  });

  const ordersByShipment = new Map<string, typeof shipmentOrders>();
  shipmentOrders.forEach((item) => {
    const list = ordersByShipment.get(item.shipment_id) ?? [];
    list.push(item);
    ordersByShipment.set(item.shipment_id, list);
  });

  const rows = filteredShipments.map((shipment) => {
    const shipmentDocs = documentsByShipment.get(shipment.id) ?? [];
    const shipmentOrdersRows = ordersByShipment.get(shipment.id) ?? [];
    const flags = getShipmentFlags(
      {
        eta_current: shipment.eta_current,
        warehouse_delivery_date: shipment.warehouse_delivery_date,
      },
      shipmentDocs,
      documentTypes ?? []
    );

    const orderSummary = shipmentOrdersRows
      .flatMap((row) => {
        const orderList = row.orders
          ? Array.isArray(row.orders)
            ? row.orders
            : [row.orders]
          : [];
        return orderList.map(
          (order) =>
            `${order.name ?? order.reference_name ?? ""}|${order.packages ?? ""}|${order.weight_kg ?? ""}|${order.total_amount ?? ""}`
        );
      })
      .join(" ; ");

    return [
      shipment.file_no,
      shipment.reference,
      shipment.tags?.join(", "),
      (Array.isArray((shipment as any).forwarders)
        ? (shipment as any).forwarders[0]?.name
        : (shipment as any).forwarders?.name),
      (Array.isArray((shipment as any).origin_port)
        ? (shipment as any).origin_port[0]?.name
        : (shipment as any).origin_port?.name),
      (Array.isArray((shipment as any).destination_port)
        ? (shipment as any).destination_port[0]?.name
        : (shipment as any).destination_port?.name),
      shipment.container_type,
      shipment.container_no,
      shipment.seal_no,
      shipment.etd_planned,
      shipment.atd_actual,
      shipment.eta_current,
      shipment.ata_actual,
      shipment.customs_entry_date,
      shipment.warehouse_delivery_date,
      shipment.status,
      flags.risk,
      flags.missingRequiredCount,
      flags.hasProblematic ? "Sorunlu" : "Tamam",
      orderSummary,
      shipment.notes,
    ];
  });

  const header = [
    "Dosya No",
    "Konşimento No",
    "Etiketler",
    "Forwarder",
    "Çıkış limani",
    "Varis limani",
    "Konteyner tipi",
    "Konteyner no",
    "Seal no",
    "ETD plan",
    "ATD gercek",
    "ETA guncel",
    "ATA gercek",
    "Gumruk giris",
    "Depo teslim",
    "Durum",
    "Risk",
    "Zorunlu evrak eksik",
    "Evrak durumu",
    "Siparis satirlari",
    "Not",
  ];

  const csv = [toCsvRow(header), ...rows.map(toCsvRow)].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=shipments.csv",
    },
  });
}



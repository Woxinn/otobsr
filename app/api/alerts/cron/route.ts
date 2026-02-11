import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ShipmentRow = {
  id: string;
  file_no: string | null;
  eta_current: string | null;
  cy_cutoff: string | null;
  vgm_cutoff: string | null;
  doc_cutoff: string | null;
  free_time_end: string | null;
  rfp_sent_at: string | null;
  forwarder_quote_count?: number | null;
};

type DocumentRow = {
  shipment_id: string | null;
  document_type_id: string | null;
  status: string | null;
};

type OrderRow = {
  id: string;
  name: string | null;
  expected_ready_date: string | null;
  order_status: string | null;
};

const HOURS = 60 * 60 * 1000;

const DEFAULTS = {
  cutoffWarnHours: 48,
  freeTimeWarnHours: 72,
  rfpSlaHours: 24,
  orderWarnDays: [5, 3, 0], // gun kala
};

function inNextHours(dateStr: string | null, hours: number) {
  if (!dateStr) return false;
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  return target >= now && target <= now + hours * HOURS;
}

function isPast(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr).getTime() < Date.now();
}

function inNextDays(dateStr: string | null, days: number) {
  if (!dateStr) return false;
  const target = new Date(dateStr).getTime();
  const now = Date.now();
  const window = days * 24 * HOURS;
  return target >= now && target <= now + window;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: documentTypes, error: docTypeError } = await supabase
    .from("document_types")
    .select("id, is_required, applies_to");

  if (docTypeError) {
    return NextResponse.json(
      { ok: false, error: docTypeError.message },
      { status: 500 }
    );
  }

  const requiredShipmentTypes =
    documentTypes?.filter(
      (item) =>
        item?.is_required &&
        (item?.applies_to === "shipment" || item?.applies_to === null)
    ) ?? [];

  const { data: shipments, error: shipmentError } = await supabase
    .from("shipments")
    .select(
      "id, file_no, eta_current, cy_cutoff, vgm_cutoff, doc_cutoff, free_time_end, rfp_sent_at"
    )
    .order("created_at", { ascending: false })
    .range(0, 499);

  if (shipmentError) {
    return NextResponse.json(
      { ok: false, error: shipmentError.message },
      { status: 500 }
    );
  }

  const shipmentIds = (shipments ?? []).map((item) => item.id);

  const { data: documents, error: docError } = shipmentIds.length
    ? await supabase
        .from("documents")
        .select("shipment_id, document_type_id, status")
        .in("shipment_id", shipmentIds)
    : { data: [] as DocumentRow[], error: null };

  if (docError) {
    return NextResponse.json(
      { ok: false, error: docError.message },
      { status: 500 }
    );
  }

  const documentsByShipment = new Map<string, DocumentRow[]>();
  (documents ?? []).forEach((doc) => {
    if (!doc.shipment_id) return;
    const list = documentsByShipment.get(doc.shipment_id) ?? [];
    list.push(doc);
    documentsByShipment.set(doc.shipment_id, list);
  });

  const { data: quotesByShipment } = shipmentIds.length
    ? await supabase
        .from("forwarder_quotes")
        .select("shipment_id, id")
        .in("shipment_id", shipmentIds)
    : { data: [] as { shipment_id: string | null }[] };

  const quoteCounts = new Map<string, number>();
  (quotesByShipment ?? []).forEach((row) => {
    if (!row.shipment_id) return;
    quoteCounts.set(
      row.shipment_id,
      (quoteCounts.get(row.shipment_id) ?? 0) + 1
    );
  });

  // Orders icin hazir olma uyarilari
  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status")
    .order("created_at", { ascending: false })
    .range(0, 999);

  if (orderError) {
    return NextResponse.json(
      { ok: false, error: orderError.message },
      { status: 500 }
    );
  }

  const alertsToUpsert: {
    shipment_id?: string;
    order_id?: string;
    event_type: string;
    channel: string;
    payload: Record<string, unknown>;
    dedupe_key: string;
    status: string;
  }[] = [];

  // Shipment bazli kurallar
  (shipments as ShipmentRow[]).forEach((shipment) => {
    const docs = documentsByShipment.get(shipment.id) ?? [];
    const missing = requiredShipmentTypes.filter((type) => {
      const hasReceived = docs.some(
        (doc) =>
          doc.document_type_id === type.id && doc.status === "Geldi"
      );
      return !hasReceived;
    });

    if (missing.length) {
      const missingCount = missing.length;
      ["email", "slack"].forEach((channel) => {
        alertsToUpsert.push({
          shipment_id: shipment.id,
          event_type: "missing_docs",
          channel,
          payload: {
            file_no: shipment.file_no,
            missing_count: missingCount,
          },
          dedupe_key: `missing_docs:${channel}:${shipment.id}`,
          status: "pending",
        });
      });
    }

    const cutoffDates = [
      { key: "cy_cutoff", value: shipment.cy_cutoff },
      { key: "vgm_cutoff", value: shipment.vgm_cutoff },
      { key: "doc_cutoff", value: shipment.doc_cutoff },
    ];
    cutoffDates.forEach((cut) => {
      if (inNextHours(cut.value, DEFAULTS.cutoffWarnHours)) {
        ["email", "slack"].forEach((channel) => {
          alertsToUpsert.push({
            shipment_id: shipment.id,
            event_type: `cutoff_${cut.key}`,
            channel,
            payload: {
              file_no: shipment.file_no,
              cutoff_type: cut.key,
              cutoff: cut.value,
            },
            dedupe_key: `cutoff:${cut.key}:${channel}:${shipment.id}`,
            status: "pending",
          });
        });
      }
    });

    if (inNextHours(shipment.free_time_end, DEFAULTS.freeTimeWarnHours)) {
      ["email", "slack"].forEach((channel) => {
        alertsToUpsert.push({
          shipment_id: shipment.id,
          event_type: "free_time_near",
          channel,
          payload: {
            file_no: shipment.file_no,
            free_time_end: shipment.free_time_end,
          },
          dedupe_key: `free_time_near:${channel}:${shipment.id}`,
          status: "pending",
        });
      });
    }

    if (isPast(shipment.eta_current)) {
      ["email", "slack"].forEach((channel) => {
        alertsToUpsert.push({
          shipment_id: shipment.id,
          event_type: "eta_overdue",
          channel,
          payload: {
            file_no: shipment.file_no,
            eta: shipment.eta_current,
          },
          dedupe_key: `eta_overdue:${channel}:${shipment.id}`,
          status: "pending",
        });
      });
    }

    const sentAt = shipment.rfp_sent_at
      ? new Date(shipment.rfp_sent_at).getTime()
      : null;
    const haveQuotes = (quoteCounts.get(shipment.id) ?? 0) > 0;
    if (sentAt && !haveQuotes) {
      const elapsedHours = (Date.now() - sentAt) / HOURS;
      if (elapsedHours >= DEFAULTS.rfpSlaHours) {
        ["email", "slack"].forEach((channel) => {
          alertsToUpsert.push({
            shipment_id: shipment.id,
            event_type: "rfp_no_response",
            channel,
            payload: {
              file_no: shipment.file_no,
              rfp_sent_at: shipment.rfp_sent_at,
              elapsed_hours: Math.round(elapsedHours),
            },
            dedupe_key: `rfp_no_response:${channel}:${shipment.id}`,
            status: "pending",
          });
        });
      }
    }
  });

  // Order bazli kurallar (uretim hazir olma)
  (orders as OrderRow[]).forEach((order) => {
    // Tarih girilmemis
    if (!order.expected_ready_date) {
      ["email", "slack"].forEach((channel) => {
        alertsToUpsert.push({
          order_id: order.id,
          event_type: "order_missing_ready_date",
          channel,
          payload: {
            order_name: order.name,
          },
          dedupe_key: `order_missing_ready_date:${channel}:${order.id}`,
          status: "pending",
        });
      });
      return;
    }

    // Eger uretim tamamlandı olarak isaretlenmis ise es gec
    const normalizedStatus = (order.order_status ?? "").toLowerCase();
    // Uretim tamamlandi olarak isaretlendiyse uyarma
    if (["hazir"].includes(normalizedStatus)) {
      return;
    }

    // 5/3/0 gun kala uyarilari
    DEFAULTS.orderWarnDays.forEach((day) => {
      if (inNextDays(order.expected_ready_date, day) && !isPast(order.expected_ready_date)) {
        ["email", "slack"].forEach((channel) => {
          alertsToUpsert.push({
            order_id: order.id,
            event_type: `order_ready_in_${day}d`,
            channel,
            payload: {
              order_name: order.name,
              ready_date: order.expected_ready_date,
              days_left: day,
            },
            dedupe_key: `order_ready_in_${day}d:${channel}:${order.id}`,
            status: "pending",
          });
        });
      }
    });

    // Gecikme
    if (isPast(order.expected_ready_date)) {
      ["email", "slack"].forEach((channel) => {
        alertsToUpsert.push({
          order_id: order.id,
          event_type: "order_ready_overdue",
          channel,
          payload: {
            order_name: order.name,
            ready_date: order.expected_ready_date,
          },
          dedupe_key: `order_ready_overdue:${channel}:${order.id}`,
          status: "pending",
        });
      });
    }
  });

  let upserted = 0;
  for (const alert of alertsToUpsert) {
    const { error } = await supabase
      .from("alerts")
      .upsert(alert, { onConflict: "dedupe_key" });

    if (!error) upserted += 1;
  }

  return NextResponse.json({ ok: true, upserted });
}





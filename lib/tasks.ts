import { createSupabaseServerClient } from "@/lib/supabase/server";

type TaskType = "eta_approaching" | "bl_missing" | "delay_check";

const toDateOnly = (value: Date) =>
  new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));

export async function syncTasks() {
  const supabase = await createSupabaseServerClient();
  const today = toDateOnly(new Date());
  const threeDaysLater = new Date(today);
  threeDaysLater.setUTCDate(today.getUTCDate() + 3);

  const { data: shipments } = await supabase
    .from("shipments")
    .select("id, eta_current, warehouse_delivery_date")
    .is("archived_at", null);

  if (!shipments?.length) {
    return;
  }

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name");

  const blType = documentTypes?.find((doc) => doc.name === "BL");
  const shipmentIds = shipments.map((item) => item.id);

  const { data: documents } = await supabase
    .from("documents")
    .select("shipment_id, document_type_id, status")
    .in("shipment_id", shipmentIds);

  const documentsByShipment = new Map<string, typeof documents>();
  documents?.forEach((doc) => {
    if (!doc.shipment_id) return;
    const list = documentsByShipment.get(doc.shipment_id) ?? [];
    list.push(doc);
    documentsByShipment.set(doc.shipment_id, list);
  });

  const tasksToCreate: {
    shipment_id: string;
    task_type: TaskType;
    status: string;
  }[] = [];

  shipments.forEach((shipment) => {
    const eta = shipment.eta_current ? new Date(shipment.eta_current) : null;
    const docs = documentsByShipment.get(shipment.id) ?? [];

    if (eta) {
      const etaDate = toDateOnly(eta);
      if (
        etaDate.getTime() >= today.getTime() &&
        etaDate.getTime() <= threeDaysLater.getTime()
      ) {
        tasksToCreate.push({
          shipment_id: shipment.id,
          task_type: "eta_approaching",
          status: "Acik",
        });
      }
      if (
        etaDate.getTime() <= today.getTime() &&
        !shipment.warehouse_delivery_date
      ) {
        tasksToCreate.push({
          shipment_id: shipment.id,
          task_type: "delay_check",
          status: "Acik",
        });
      }
    }

    if (blType) {
      const hasBl = docs.some(
        (doc) =>
          doc.document_type_id === blType.id && doc.status === "Geldi"
      );
      if (!hasBl) {
        tasksToCreate.push({
          shipment_id: shipment.id,
          task_type: "bl_missing",
          status: "Acik",
        });
      }
    }
  });

  if (!tasksToCreate.length) {
    return;
  }

  await supabase
    .from("tasks")
    .upsert(tasksToCreate, {
      onConflict: "shipment_id,task_type",
      ignoreDuplicates: true,
    });
}


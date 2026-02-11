"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const addDays = (dateText: string, days: number) => {
  const base = new Date(dateText);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  const iso = base.toISOString();
  return iso.slice(0, 10);
};

export async function createShipment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const fileNo = String(formData.get("file_no") ?? "").trim();

  if (!fileNo) {
    redirect("/shipments/new?error=dosya-no");
  }

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      file_no: fileNo,
      reference: nullIfEmpty(formData.get("reference")),
      notes: nullIfEmpty(formData.get("notes")),
      tags: nullIfEmpty(formData.get("tags"))
        ? String(formData.get("tags")).split(",").map((tag) => tag.trim())
        : [],
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/shipments/new?error=dosya-no-unique");
  }

  revalidatePath("/shipments");
  redirect(`/shipments/${data.id}`);
}

export async function updateShipment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const shipmentId = String(formData.get("shipment_id") ?? "");

  if (!shipmentId) return;

  const { data: existing } = await supabase
    .from("shipments")
    .select("eta_current")
    .eq("id", shipmentId)
    .single();

  const etaCurrent = nullIfEmpty(formData.get("eta_current"));
  const atdActual = nullIfEmpty(formData.get("atd_actual"));

  const updatePayload: Record<string, string | string[] | null> = {
    file_no: nullIfEmpty(formData.get("file_no")),
    reference: nullIfEmpty(formData.get("reference")),
    notes: nullIfEmpty(formData.get("notes")),
    tags: nullIfEmpty(formData.get("tags"))
      ? String(formData.get("tags")).split(",").map((tag) => tag.trim())
      : null,
    forwarder_id: nullIfEmpty(formData.get("forwarder_id")),
    origin_port_id: nullIfEmpty(formData.get("origin_port_id")),
    destination_port_id: nullIfEmpty(formData.get("destination_port_id")),
    container_type: nullIfEmpty(formData.get("container_type")),
    container_no: nullIfEmpty(formData.get("container_no")),
    seal_no: nullIfEmpty(formData.get("seal_no")),
    etd_planned: nullIfEmpty(formData.get("etd_planned")),
    atd_actual: atdActual,
    eta_current: etaCurrent,
    ata_actual: nullIfEmpty(formData.get("ata_actual")),
    customs_entry_date: nullIfEmpty(formData.get("customs_entry_date")),
    warehouse_delivery_date: nullIfEmpty(formData.get("warehouse_delivery_date")),
  };

  await supabase.from("shipments").update(updatePayload).eq("id", shipmentId);

  if (!etaCurrent) {
    const baseDate = atdActual ?? nullIfEmpty(formData.get("etd_planned"));
    if (baseDate) {
      const { data: selectedQuote } = await supabase
        .from("forwarder_quotes")
        .select("transit_days")
        .eq("shipment_id", shipmentId)
        .eq("is_selected", true)
        .maybeSingle();

      const transitDays = Number(selectedQuote?.transit_days ?? 0);
      if (transitDays > 0) {
        const autoEta = addDays(baseDate, transitDays);
        if (autoEta) {
          await supabase
            .from("shipments")
            .update({ eta_current: autoEta })
            .eq("id", shipmentId);
        }
      }
    }
  }

  if (etaCurrent && existing?.eta_current && existing.eta_current !== etaCurrent) {
    await supabase.from("eta_history").insert({
      shipment_id: shipmentId,
      eta_date: existing.eta_current,
    });
  }

  revalidatePath(`/shipments/${shipmentId}`);
}

export async function updateShipmentOrders(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const shipmentId = String(formData.get("shipment_id") ?? "");
  if (!shipmentId) return;

  const orderIds = formData
    .getAll("order_ids")
    .map((value) => String(value))
    .filter(Boolean);

  const { error: deleteError } = await supabase
    .from("shipment_orders")
    .delete()
    .eq("shipment_id", shipmentId);
  if (deleteError) {
    console.error("Shipment orders delete failed", deleteError);
    redirect(`/shipments/${shipmentId}/edit?ordersError=delete-failed`);
  }

  if (orderIds.length) {
    const { error: insertError } = await supabase.from("shipment_orders").insert(
      orderIds.map((orderId) => ({
        shipment_id: shipmentId,
        order_id: orderId,
      }))
    );
    if (insertError) {
      console.error("Shipment orders insert failed", insertError);
      redirect(`/shipments/${shipmentId}/edit?ordersError=insert-failed`);
    }

    await supabase
      .from("orders")
      .update({ order_status: "Kalkis Limaninda" })
      .in("id", orderIds);
  }

  revalidatePath(`/shipments/${shipmentId}`);
  revalidatePath("/shipments");
}

export async function updateShipmentStatus(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const shipmentId = String(formData.get("shipment_id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!shipmentId || !status) return;

  const archivedAt = status === "Kapandi" ? new Date().toISOString() : null;

  await supabase
    .from("shipments")
    .update({ status, archived_at: archivedAt })
    .eq("id", shipmentId);

  if (status === "Denizde" || status === "Varis Limaninda" || status === "Gemiden Indi") {
    const targetStatus =
      status === "Gemiden Indi" ? "Gumrukte" : status;
    const { data: shipmentOrders } = await supabase
      .from("shipment_orders")
      .select("order_id")
      .eq("shipment_id", shipmentId);
    const orderIds = (shipmentOrders ?? [])
      .map((row) => row.order_id)
      .filter(Boolean) as string[];
    if (orderIds.length) {
      await supabase
        .from("orders")
        .update({ order_status: targetStatus })
        .in("id", orderIds);
    }
  }

  revalidatePath(`/shipments/${shipmentId}`);
}

export async function deleteShipment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const shipmentId = String(formData.get("shipment_id") ?? "");

  if (!shipmentId) return;

  const { error } = await supabase.from("shipments").delete().eq("id", shipmentId);

  if (error) {
    console.error("Shipment delete failed", error);
    redirect(`/shipments/${shipmentId}?error=delete-failed`);
  }

  revalidatePath("/shipments");
  redirect("/shipments");
}


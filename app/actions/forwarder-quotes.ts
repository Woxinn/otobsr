"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const nullIfEmpty = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const normalizeNumber = (value: FormDataEntryValue | null) => {
  const text = nullIfEmpty(value);
  if (!text) return null;
  return text.replace(",", ".");
};

const addDays = (dateText: string, days: number) => {
  const base = new Date(dateText);
  if (Number.isNaN(base.getTime())) return null;
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
};

export async function createForwarderQuote(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const forwarderId = String(formData.get("forwarder_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  const amount = normalizeNumber(formData.get("amount"));

  if (!forwarderId || !shipmentId || !amount) {
    console.error("Forwarder quote missing fields", {
      forwarderId,
      shipmentId,
      amount,
    });
    redirect(`/forwarders/${forwarderId}?quoteError=missing-fields`);
  }

  const { error } = await supabase.from("forwarder_quotes").insert({
    forwarder_id: forwarderId,
    shipment_id: shipmentId,
    amount,
    currency: "USD",
    container_size: nullIfEmpty(formData.get("container_size")),
    free_time_days: normalizeNumber(formData.get("free_time_days")),
    route_option: nullIfEmpty(formData.get("route_option")),
    transit_days: nullIfEmpty(formData.get("transit_days")),
    valid_until: nullIfEmpty(formData.get("valid_until")),
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Forwarder quote insert failed", error);
    redirect(`/forwarders/${forwarderId}?quoteError=insert-failed`);
  }

  revalidatePath(`/forwarders/${forwarderId}`);
}

export async function createForwarderQuoteForShipment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const forwarderId = String(formData.get("forwarder_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  const amount = normalizeNumber(formData.get("amount"));

  if (!forwarderId || !shipmentId || !amount) {
    console.error("Forwarder quote missing fields", {
      forwarderId,
      shipmentId,
      amount,
    });
    redirect(`/shipments/${shipmentId}?quoteError=missing-fields`);
  }

  const { error } = await supabase.from("forwarder_quotes").insert({
    forwarder_id: forwarderId,
    shipment_id: shipmentId,
    amount,
    currency: "USD",
    container_size: nullIfEmpty(formData.get("container_size")),
    free_time_days: normalizeNumber(formData.get("free_time_days")),
    route_option: nullIfEmpty(formData.get("route_option")),
    transit_days: nullIfEmpty(formData.get("transit_days")),
    valid_until: nullIfEmpty(formData.get("valid_until")),
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Forwarder quote insert failed", error);
    redirect(`/shipments/${shipmentId}?quoteError=insert-failed`);
  }

  revalidatePath(`/shipments/${shipmentId}`);
}

export async function updateForwarderQuote(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const quoteId = String(formData.get("quote_id") ?? "");
  const forwarderId = String(formData.get("forwarder_id") ?? "");

  if (!quoteId) return;

  await supabase
    .from("forwarder_quotes")
    .update({
      amount: nullIfEmpty(formData.get("amount")),
      container_size: nullIfEmpty(formData.get("container_size")),
      free_time_days: normalizeNumber(formData.get("free_time_days")),
      route_option: nullIfEmpty(formData.get("route_option")),
      transit_days: nullIfEmpty(formData.get("transit_days")),
      valid_until: nullIfEmpty(formData.get("valid_until")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", quoteId);

  if (forwarderId) {
    revalidatePath(`/forwarders/${forwarderId}`);
  }
}

export async function deleteForwarderQuote(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const quoteId = String(formData.get("quote_id") ?? "");
  const forwarderId = String(formData.get("forwarder_id") ?? "");

  if (!quoteId) return;

  await supabase.from("forwarder_quotes").delete().eq("id", quoteId);
  if (forwarderId) {
    revalidatePath(`/forwarders/${forwarderId}`);
  }
}

export async function selectForwarderQuote(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const quoteId = String(formData.get("quote_id") ?? "");
  const shipmentId = String(formData.get("shipment_id") ?? "");
  const forwarderId = String(formData.get("forwarder_id") ?? "");

  if (!quoteId || !shipmentId || !forwarderId) return;

  await supabase
    .from("forwarder_quotes")
    .update({ is_selected: false })
    .eq("shipment_id", shipmentId);

  await supabase
    .from("forwarder_quotes")
    .update({ is_selected: true })
    .eq("id", quoteId);

  await supabase
    .from("shipments")
    .update({ forwarder_id: forwarderId })
    .eq("id", shipmentId);

  const { data: quote } = await supabase
    .from("forwarder_quotes")
    .select("transit_days")
    .eq("id", quoteId)
    .maybeSingle();

  const { data: shipment } = await supabase
    .from("shipments")
    .select("atd_actual, etd_planned")
    .eq("id", shipmentId)
    .maybeSingle();

  const transitDays = Number(quote?.transit_days ?? 0);
  const baseDate = shipment?.atd_actual ?? shipment?.etd_planned ?? null;
  if (transitDays > 0 && baseDate) {
    const autoEta = addDays(baseDate, transitDays);
    if (autoEta) {
      await supabase
        .from("shipments")
        .update({ eta_current: autoEta })
        .eq("id", shipmentId);
    }
  }

  revalidatePath(`/forwarders/${forwarderId}`);
  revalidatePath(`/shipments/${shipmentId}`);
}

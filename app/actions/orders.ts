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

export async function createOrder(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("orders").insert({
    name: nullIfEmpty(formData.get("name")),
    consignment_no: nullIfEmpty(formData.get("consignment_no")),
    supplier_id: nullIfEmpty(formData.get("supplier_id")),
    packages: normalizeNumber(formData.get("packages")),
    weight_kg: normalizeNumber(formData.get("weight_kg")),
    payment_method: nullIfEmpty(formData.get("payment_method")),
    incoterm: nullIfEmpty(formData.get("incoterm")),
    total_amount: normalizeNumber(formData.get("total_amount")),
    extra_cost_percent: normalizeNumber(formData.get("extra_cost_percent")),
    currency: nullIfEmpty(formData.get("currency")) ?? "USD",
    expected_ready_date: nullIfEmpty(formData.get("expected_ready_date")),
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Order insert failed", error);
    return;
  }

  revalidatePath("/orders");
  const returnTo = String(formData.get("return_to") ?? "/orders");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}toast=created`);
}

export async function updateOrder(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const { error } = await supabase
    .from("orders")
    .update({
      name: nullIfEmpty(formData.get("name")),
      consignment_no: nullIfEmpty(formData.get("consignment_no")),
      supplier_id: nullIfEmpty(formData.get("supplier_id")),
      packages: normalizeNumber(formData.get("packages")),
      weight_kg: normalizeNumber(formData.get("weight_kg")),
      payment_method: nullIfEmpty(formData.get("payment_method")),
      incoterm: nullIfEmpty(formData.get("incoterm")),
      total_amount: normalizeNumber(formData.get("total_amount")),
      extra_cost_percent: normalizeNumber(formData.get("extra_cost_percent")),
      currency: nullIfEmpty(formData.get("currency")) ?? "USD",
      expected_ready_date: nullIfEmpty(formData.get("expected_ready_date")),
      notes: nullIfEmpty(formData.get("notes")),
    })
    .eq("id", orderId);

  if (error) {
    console.error("Order update failed", error);
    return;
  }

  revalidatePath("/orders");
  const returnTo = String(formData.get("return_to") ?? "/orders");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}toast=updated`);
}

export async function deleteOrder(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) {
    console.error("Order delete failed", error);
    return;
  }

  revalidatePath("/orders");
  redirect("/orders?toast=deleted");
}

export async function updateOrderProductionStatus(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const status = nullIfEmpty(formData.get("production_status"));
  const note = nullIfEmpty(formData.get("production_note"));

  const { error } = await supabase
    .from("orders")
    .update({
      production_status: status,
      production_note: note,
      production_checked_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (error) {
    console.error("Order production update failed", error);
    return;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function updateOrderStatus(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const status = nullIfEmpty(formData.get("order_status"));

  const { error } = await supabase
    .from("orders")
    .update({
      order_status: status,
    })
    .eq("id", orderId);

  if (error) {
    console.error("Order status update failed", error);
    return;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

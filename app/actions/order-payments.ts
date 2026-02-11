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

export async function createOrderPayment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const { error } = await supabase.from("order_payments").insert({
    order_id: orderId,
    amount: normalizeNumber(formData.get("amount")),
    currency: nullIfEmpty(formData.get("currency")) ?? "USD",
    payment_date: nullIfEmpty(formData.get("payment_date")),
    method: nullIfEmpty(formData.get("method")),
    status: nullIfEmpty(formData.get("status")) ?? "Bekleniyor",
    notes: nullIfEmpty(formData.get("notes")),
  });

  if (error) {
    console.error("Order payment insert failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=payment-created&tab=payments`);
}

export async function deleteOrderPayment(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const paymentId = String(formData.get("payment_id") ?? "");
  const orderId = String(formData.get("order_id") ?? "");
  if (!paymentId || !orderId) return;

  const { error } = await supabase
    .from("order_payments")
    .delete()
    .eq("id", paymentId);

  if (error) {
    console.error("Order payment delete failed", error);
    return;
  }

  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}?toast=payment-deleted&tab=payments`);
}

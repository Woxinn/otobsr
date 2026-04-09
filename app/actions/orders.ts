"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireAdminRole } from "@/lib/roles";

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

const normalizeStatusToken = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ç", "c")
    .trim();

const shipmentStageFromStatus = (value: string | null | undefined) => {
  const token = normalizeStatusToken(value);
  if (token === "kalkis limaninda") return 1;
  if (token === "denizde") return 2;
  if (token === "varis limaninda") return 3;
  if (token === "gemiden indi") return 4;
  return 0;
};

const shipmentStatusFromOrderStatus = (value: string | null | undefined) => {
  const token = normalizeStatusToken(value);
  if (token === "kalkis limaninda") return "Kalkis Limaninda";
  if (token === "denizde") return "Denizde";
  if (token === "varis limaninda") return "Varis Limaninda";
  if (token === "gumrukte") return "Gemiden Indi";
  if (token === "depoya teslim edildi" || token === "depoya teslim" || token === "delivered") {
    return "Gemiden Indi";
  }
  return null;
};

const syncShipmentStatusFromOrderUpdates = async (
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orderIds: string[]
) => {
  if (!orderIds.length) return;

  const uniqueOrderIds = Array.from(new Set(orderIds));
  const { data: links } = await supabase
    .from("shipment_orders")
    .select("shipment_id, order_id")
    .in("order_id", uniqueOrderIds);

  const shipmentIds = Array.from(
    new Set((links ?? []).map((row) => row.shipment_id).filter(Boolean) as string[])
  );
  if (!shipmentIds.length) return;

  const { data: shipmentOrders } = await supabase
    .from("shipment_orders")
    .select("shipment_id, order_id")
    .in("shipment_id", shipmentIds);

  const allLinkedOrderIds = Array.from(
    new Set((shipmentOrders ?? []).map((row) => row.order_id).filter(Boolean) as string[])
  );

  const [{ data: shipments }, { data: orders }] = await Promise.all([
    supabase.from("shipments").select("id, status").in("id", shipmentIds),
    allLinkedOrderIds.length
      ? supabase.from("orders").select("id, order_status").in("id", allLinkedOrderIds)
      : Promise.resolve({ data: [] as { id: string; order_status: string | null }[] }),
  ]);

  const orderStatusById = new Map((orders ?? []).map((row) => [row.id, row.order_status]));
  const shipmentStatusById = new Map((shipments ?? []).map((row) => [row.id, row.status]));

  for (const shipmentId of shipmentIds) {
    const linkedOrderIds = (shipmentOrders ?? [])
      .filter((row) => row.shipment_id === shipmentId)
      .map((row) => row.order_id)
      .filter(Boolean) as string[];
    if (!linkedOrderIds.length) continue;

    let targetStatus: string | null = null;
    let maxStage = 0;
    linkedOrderIds.forEach((orderId) => {
      const mapped = shipmentStatusFromOrderStatus(orderStatusById.get(orderId));
      if (!mapped) return;
      const stage = shipmentStageFromStatus(mapped);
      if (stage >= maxStage) {
        maxStage = stage;
        targetStatus = mapped;
      }
    });
    if (!targetStatus) continue;

    const currentStatus = shipmentStatusById.get(shipmentId) ?? null;
    const currentStage = shipmentStageFromStatus(currentStatus);
    if (maxStage > currentStage) {
      await supabase
        .from("shipments")
        .update({ status: targetStatus })
        .eq("id", shipmentId);
    }
  }
};

export async function createOrder(formData: FormData) {
  await requireAdminRole();
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
  await requireAdminRole();
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const totalAmountInput = normalizeNumber(formData.get("total_amount"));

  const updateData: Record<string, any> = {
    name: nullIfEmpty(formData.get("name")),
    consignment_no: nullIfEmpty(formData.get("consignment_no")),
    supplier_id: nullIfEmpty(formData.get("supplier_id")),
    packages: normalizeNumber(formData.get("packages")),
    weight_kg: normalizeNumber(formData.get("weight_kg")),
    payment_method: nullIfEmpty(formData.get("payment_method")),
    incoterm: nullIfEmpty(formData.get("incoterm")),
    extra_cost_percent: normalizeNumber(formData.get("extra_cost_percent")),
    currency: nullIfEmpty(formData.get("currency")) ?? "USD",
    expected_ready_date: nullIfEmpty(formData.get("expected_ready_date")),
    notes: nullIfEmpty(formData.get("notes")),
  };

  // total_amount alanı boş bırakıldıysa mevcut değeri koru
  if (totalAmountInput !== null) {
    updateData.total_amount = totalAmountInput;
  }

  const { error } = await supabase.from("orders").update(updateData).eq("id", orderId);

  if (error) {
    console.error("Order update failed", error);
    return;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  const returnTo = String(formData.get("return_to") ?? "/orders");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}toast=updated`);
}

export async function deleteOrder(formData: FormData) {
  await requireAdminRole();
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
  await requireAdminRole();
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
  await requireAdminRole();
  const supabase = await createSupabaseServerClient();
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return;

  const status = nullIfEmpty(formData.get("order_status"));
  const normalized = (status ?? "").toLowerCase().trim();
  const deliveredTokens = ["depoya teslim edildi", "depoya teslim", "delivered"];
  const shouldArchive = deliveredTokens.includes(normalized);

  const { error } = await supabase
    .from("orders")
    .update({
      order_status: status,
      archived: shouldArchive,
      archived_at: shouldArchive ? new Date().toISOString() : null,
    })
    .eq("id", orderId);

  if (error) {
    console.error("Order status update failed", error);
    return;
  }

  await syncShipmentStatusFromOrderUpdates(supabase, [orderId]);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/shipments");
}

export async function archiveOrder(orderId: string) {
  await requireAdminRole();
  const supabase = await createSupabaseServerClient();
  if (!orderId) return;
  await supabase
    .from("orders")
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq("id", orderId);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function unarchiveOrder(orderId: string) {
  await requireAdminRole();
  const supabase = await createSupabaseServerClient();
  if (!orderId) return;
  await supabase
    .from("orders")
    .update({ archived: false, archived_at: null })
    .eq("id", orderId);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function bulkUpdateOrders(formData: FormData) {
  "use server";
  await requireAdminRole();
  const supabase = await createSupabaseServerClient();
  const ids = formData.getAll("selected").map(String).filter(Boolean);
  if (!ids.length) return;
  const action = String(formData.get("bulk_action") ?? "");
  const now = new Date().toISOString();

  const deliveredTokens = ["depoya teslim edildi", "depoya teslim", "delivered"];

  if (action === "archive") {
    await supabase
      .from("orders")
      .update({ archived: true, archived_at: now })
      .in("id", ids);
  } else if (action === "unarchive") {
    await supabase
      .from("orders")
      .update({ archived: false, archived_at: null })
      .in("id", ids);
  } else if (action === "delete") {
    await supabase.from("orders").delete().in("id", ids);
  } else if (action === "status") {
    const status = nullIfEmpty(formData.get("bulk_status"));
    const normalized = (status ?? "").toLowerCase().trim();
    const shouldArchive = deliveredTokens.includes(normalized);
    await supabase
      .from("orders")
      .update({
        order_status: status,
        archived: shouldArchive,
        archived_at: shouldArchive ? now : null,
      })
      .in("id", ids);
    await syncShipmentStatusFromOrderUpdates(supabase, ids);
  }

  revalidatePath("/orders");
  revalidatePath("/shipments");
}

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Basit koruma: env ile kontrol et
const ENABLE_BACKFILL = process.env.ENABLE_BACKFILL === "true";

type PackingLine = {
  packages_count?: number | null;
  net_weight?: number | null;
  gross_weight?: number | null;
};

type PackingItem = {
  packages?: number | null;
  net_weight_kg?: number | null;
  gross_weight_kg?: number | null;
  weight_kg?: number | null;
  cbm?: number | null;
};

type OrderItem = {
  net_weight_kg?: number | null;
  gross_weight_kg?: number | null;
};

const sumLines = (lines: PackingLine[]) =>
  lines.reduce(
    (acc, line) => {
      acc.packages += Number(line.packages_count ?? 0);
      acc.netWeight += Number(line.net_weight ?? 0);
      acc.grossWeight += Number(line.gross_weight ?? 0);
      return acc;
    },
    { packages: 0, netWeight: 0, grossWeight: 0 }
  );

const sumItems = (items: PackingItem[]) =>
  items.reduce<{
    packages: number;
    netWeight: number;
    grossWeight: number;
    cbm: number;
  }>(
    (acc, item) => {
      acc.packages += Number(item.packages ?? 0);
      acc.netWeight += Number(item.net_weight_kg ?? item.weight_kg ?? 0);
      acc.grossWeight += Number(item.gross_weight_kg ?? item.weight_kg ?? 0);
      acc.cbm += Number(item.cbm ?? 0);
      return acc;
    },
    { packages: 0, netWeight: 0, grossWeight: 0, cbm: 0 }
  );

const sumOrderItems = (items: OrderItem[]) =>
  items.reduce(
    (acc, item) => {
      acc.netWeight += Number(item.net_weight_kg ?? 0);
      acc.grossWeight += Number(item.gross_weight_kg ?? 0);
      return acc;
    },
    { netWeight: 0, grossWeight: 0 }
  );

export async function POST(request: Request) {
  if (!ENABLE_BACKFILL) {
    return NextResponse.json({ error: "Backfill disabled (set ENABLE_BACKFILL=true)" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const body = await request.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit ?? 1000), 1), 2000);
  const offset = Math.max(Number(body.offset ?? 0), 0);

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  let processed = 0;
  for (const order of orders ?? []) {
    const orderId = order.id as string;
    const { data: packingLists } = await supabase
      .from("packing_lists")
      .select("id")
      .eq("order_id", orderId);
    const packingListIds = (packingLists ?? []).map((p) => p.id);

    const { data: packingLines } = packingListIds.length
      ? await supabase
          .from("packing_list_lines")
          .select("packages_count, net_weight, gross_weight")
          .in("packing_list_id", packingListIds)
      : { data: [] as PackingLine[] };

    const { data: packingItems } = await supabase
      .from("order_packing_list_items")
      .select("packages, net_weight_kg, gross_weight_kg, weight_kg, cbm")
      .eq("order_id", orderId);

    const { data: orderItems } = await supabase
      .from("order_items")
      .select("net_weight_kg, gross_weight_kg")
      .eq("order_id", orderId);

    const lineTotals = sumLines(packingLines ?? []);
    const itemTotals = sumItems(packingItems ?? []);
    const orderItemTotals = sumOrderItems(orderItems ?? []);

    const payload = {
      order_id: orderId,
      total_packages: lineTotals.packages || itemTotals.packages || 0,
      total_net_weight_kg: lineTotals.netWeight || itemTotals.netWeight || orderItemTotals.netWeight || 0,
      total_gross_weight_kg:
        lineTotals.grossWeight || itemTotals.grossWeight || orderItemTotals.grossWeight || 0,
      total_cbm: itemTotals.cbm || 0,
    };

    await supabase.from("order_packing_list_summary").upsert([payload], { onConflict: "order_id" });
    processed += 1;
  }

  return NextResponse.json({
    processed,
    remainingHint: (orders ?? []).length === limit ? `run again with offset=${offset + limit}` : "done",
  });
}

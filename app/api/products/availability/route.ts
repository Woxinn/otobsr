import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canViewModule } from "@/lib/roles";

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.product_ids) ? body.product_ids : [];
  if (!ids.length) return NextResponse.json({ error: "product_ids gerekli" }, { status: 400 });

  // Transit (view)
  const { data: transitRows } = await supabase
    .from("order_transit_totals")
    .select("product_id, transit_qty")
    .in("product_id", ids);
  const transitMap = new Map<string, number>();
  (transitRows ?? []).forEach((row: any) => {
    transitMap.set(row.product_id, Number(row.transit_qty ?? 0));
  });

  // Açık siparişler (depoya teslim edilmiş hariç)
  const { data: openOrders } = await supabase
    .from("order_items")
    .select("product_id, quantity, orders!inner(order_status)")
    .in("product_id", ids)
    .not("orders.order_status", "in", "(depoya teslim edildi,depoya teslim,delivered)");
  const openMap = new Map<string, number>();
  (openOrders ?? []).forEach((row: any) => {
    const pid = row.product_id;
    if (!pid) return;
    const qty = Number(row.quantity ?? 0);
    openMap.set(pid, (openMap.get(pid) ?? 0) + qty);
  });

  const result = ids.map((id) => ({
    product_id: id,
    transit_qty: transitMap.get(id) ?? 0,
    open_order_qty: openMap.get(id) ?? 0,
    stock_qty: null, // elimizde stok verisi yok
  }));

  return NextResponse.json({ ok: true, items: result });
}

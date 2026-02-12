import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateOrderItem } from "@/app/actions/order-items";

export default async function OrderItemEditPage({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, name, currency")
    .eq("id", resolvedParams.id)
    .single();

  if (!order) {
    notFound();
  }

  const { data: item } = await supabase
    .from("order_items")
    .select("*, products(id, code, name)")
    .eq("id", resolvedParams.itemId)
    .eq("order_id", order.id)
    .single();

  if (!item) {
    notFound();
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, code, name")
    .order("code");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Ürün duzenle
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {item.name ?? "Ürün"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/orders/${order.id}`}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Siparis detay
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-black/40">
              Siparis
            </p>
            <p className="text-lg font-semibold">{order.name ?? "Siparis"}</p>
          </div>
          <div className="rounded-full border border-black/10 bg-[var(--sky)]/50 px-4 py-2 text-xs font-semibold text-black/70">
            Para birimi: {order.currency ?? "USD"}
          </div>
        </div>

        <form action={updateOrderItem} className="mt-6 space-y-4 text-sm">
          <input type="hidden" name="order_id" value={order.id} />
          <input type="hidden" name="order_item_id" value={item.id} />
          <div className="grid gap-4 lg:grid-cols-3">
            <label className="text-sm font-medium lg:col-span-2">
              Ürün kodu
              <select
                name="product_id"
                defaultValue={item.product_id ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              >
                <option value="">Ürün seciniz</option>
                {products?.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} - {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium lg:col-span-2">
              Tedarikçi urun adi
              <input
                name="name"
                defaultValue={item.name ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium">
              Adet
              <input
                name="quantity"
                defaultValue={item.quantity ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium">
              Birim fiyat
              <input
                name="unit_price"
                defaultValue={item.unit_price ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium">
              Net kg
              <input
                name="net_weight_kg"
                defaultValue={item.net_weight_kg ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium">
              Brut kg
              <input
                name="gross_weight_kg"
                defaultValue={item.gross_weight_kg ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium lg:col-span-3">
              Not
              <input
                name="notes"
                defaultValue={item.notes ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-black/60">
            Toplam tutar adet ve birim fiyata gore otomatik hesaplanir.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
              Kaydet
            </button>
            <Link
              href={`/orders/${order.id}`}
              className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold"
            >
              Iptal
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}




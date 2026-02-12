import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createOrder } from "@/app/actions/orders";

export default async function OrderCreatePage() {
  const supabase = await createSupabaseServerClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Siparis olustur
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Yeni siparis
          </h2>
        </div>
        <Link
          href="/orders"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={createOrder}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="return_to" value="/orders" />
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Siparis adi
            <input
              name="name"
              placeholder="Orn: 2026 Mart siparisi"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            KonÅŸimento No
            <input
              name="consignment_no"
              placeholder="Orn: BL-2026-001"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Tedarikçi
            <select
              name="supplier_id"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seciniz</option>
              {suppliers?.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Odeme yontemi
            <select
              name="payment_method"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seciniz</option>
              <option value="TT">TT</option>
              <option value="LC">LC</option>
              <option value="Diger">Diger</option>
            </select>
          </label>
          <div className="rounded-2xl border border-dashed border-black/10 bg-[var(--sand)]/40 px-4 py-3 text-xs text-black/60 lg:col-span-3">
            Ürün adedi, agirlik ve toplam tutar urun kalemlerinden otomatik
            hesaplanir.
          </div>
          <label className="text-sm font-medium">
            Para birimi
            <input
              name="currency"
              defaultValue="USD"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Incoterm
            <input
              name="incoterm"
              placeholder="Orn: FOB, CIF"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Ekstra masraf (%)
            <input
              name="extra_cost_percent"
              placeholder="Orn: 12.5"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Hazir olus tarihi
            <input
              type="date"
              name="expected_ready_date"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-3">
            Not
            <input
              name="notes"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
          Kaydet
        </button>
      </form>
    </section>
  );
}


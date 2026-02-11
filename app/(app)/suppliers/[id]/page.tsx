import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateSupplier } from "@/app/actions/master-data";
import CountrySelect from "@/components/CountrySelect";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createSupabaseServerClient();

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!supplier) {
    notFound();
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, name, payment_method, total_amount, currency, expected_ready_date, created_at")
    .eq("supplier_id", supplier.id)
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Tedarikci detay
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {supplier.name}
          </h2>
        </div>
        <Link
          href="/suppliers"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={updateSupplier}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={supplier.id} />
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Tedarikci adi
            <input
              name="name"
              defaultValue={supplier.name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Yetkili kisi
            <input
              name="contact_name"
              defaultValue={supplier.contact_name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            E-posta
            <input
              name="email"
              defaultValue={supplier.email ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Telefon
            <input
              name="phone"
              defaultValue={supplier.phone ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Ulke
            <CountrySelect
              name="country"
              defaultValue={supplier.country ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Sehir
            <input
              name="city"
              defaultValue={supplier.city ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-2">
            Adres
            <input
              name="address"
              defaultValue={supplier.address ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Vergi no
            <input
              name="tax_no"
              defaultValue={supplier.tax_no ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-3">
            Not
            <input
              name="notes"
              defaultValue={supplier.notes ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
          Guncelle
        </button>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Gecmis siparisler</h3>
        <div className="mt-4 space-y-3 text-sm">
          {orders?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                    <th className="px-3 py-2">Siparis</th>
                    <th className="px-3 py-2">Odeme</th>
                    <th className="px-3 py-2">Tutar</th>
                    <th className="px-3 py-2">Hazir olus</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order, index) => (
                    <tr
                      key={order.id}
                      style={{ animationDelay: `${index * 40}ms` }}
                      className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/15 [&>td]:bg-white [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl [&>td]:shadow-[0_16px_26px_-24px_rgba(15,61,62,0.6)] hover:[&>td]:bg-[var(--mint)] hover:[&>td]:shadow-[0_20px_30px_-24px_rgba(15,61,62,0.7)]"
                    >
                      <td className="px-3 py-3 font-semibold">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block w-full text-[var(--ocean)] transition hover:underline"
                        >
                          {order.name ?? "-"}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block w-full text-black/70"
                        >
                          {order.payment_method ?? "-"}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block w-full text-black/70"
                        >
                          {order.total_amount ?? "-"} {order.currency ?? "USD"}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block w-full text-black/70"
                        >
                          {order.expected_ready_date ?? "-"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Bu tedarikci icin siparis bulunamadi.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

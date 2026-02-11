import Link from "next/link";
import { redirect } from "next/navigation";
import { completeMissingOrderProducts } from "@/app/actions/order-items";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MissingProductRow from "@/components/MissingProductRow";

type MissingRow = {
  code: string;
  name: string | null;
  group_id?: string | null;
  group_name?: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_amount: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  notes: string | null;
  attributes: {
    name: string;
    unit: string | null;
    valueType: "text" | "number";
    rawValue: string;
  }[];
};

type SearchParams = {
  stagingId?: string;
};

export default async function MissingProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { id: orderId } = await params;
  const resolvedSearch = await searchParams;
  const stagingId = resolvedSearch.stagingId;

  if (!stagingId) {
    redirect(`/orders/${orderId}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: staging } = await supabase
    .from("order_item_import_staging")
    .select("id, order_id, payload")
    .eq("id", stagingId)
    .single();

  if (!staging || staging.order_id !== orderId) {
    redirect(`/orders/${orderId}?toast=missing-products-error`);
  }

  const rows = (staging.payload as MissingRow[]) ?? [];

  if (!rows.length) {
    redirect(`/orders/${orderId}`);
  }

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name, product_attributes(id, name, unit, value_type)")
    .order("name");

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
            Eksik urunler
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {rows.length} urunu sisteme ekleyelim
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Import sirasinda bulunamayan urunleri kaydedin, sonra siparis kalemlerine eklenecek.
          </p>
        </div>
        <Link
          href={`/orders/${orderId}`}
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Siparise don
        </Link>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <form action={completeMissingOrderProducts} className="space-y-6">
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="staging_id" value={stagingId} />
          <input type="hidden" name="row_count" value={rows.length} />
          <div className="grid gap-4">
            {rows.map((row, index) => (
              <MissingProductRow
                key={row.code || index}
                row={row}
                index={index}
                groups={groups ?? []}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Kaydet ve importu tamamla
            </button>
            <Link
              href={`/orders/${orderId}`}
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            >
              Vazgec
            </Link>
          </div>
        </form>
      </div>
    </section>
  );
}

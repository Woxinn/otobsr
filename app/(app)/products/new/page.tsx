import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProduct, importProducts } from "@/app/actions/products";
import ProductForm from "@/components/ProductForm";
import ProductsToast from "@/components/ProductsToast";

export default async function NewProductPage() {
  const supabase = await createSupabaseServerClient();

  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name")
    .order("name");

  const { data: attributes } = await supabase
    .from("product_attributes")
    .select("id, group_id, name, unit, value_type, is_required, sort_order")
    .order("sort_order", { ascending: true })
    .order("name");

  const { data: gtips } = await supabase
    .from("gtips")
    .select("id, code, description")
    .order("code");

  return (
    <section className="space-y-6">
      <ProductsToast />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Yeni urun
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Urun olustur
          </h2>
        </div>
        <Link
          href="/products"
          className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <ProductForm
        mode="create"
        groups={groups ?? []}
        attributes={attributes ?? []}
        gtips={gtips ?? []}
        action={createProduct}
      />

      <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-black/40">
              Toplu urun import
            </p>
            <p className="text-sm font-semibold">
              Nitelikleri ile birlikte CSV yukleyin
            </p>
            <p className="mt-1 text-xs text-black/60">
              CSV UTF-8 (virgul) ya da Excel (.xlsx) kullanin. Nitelikler icin
              attr_name_1, attr_value_1 gibi kolonlari kullanin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/templates/products-template.csv"
              className="rounded-full border border-black/15 px-4 py-2 text-xs font-semibold"
            >
              Ornek CSV
            </Link>
            <Link
              href="/templates/products-template.xlsx"
              className="rounded-full border border-black/15 px-4 py-2 text-xs font-semibold"
            >
              Ornek Excel
            </Link>
          </div>
        </div>
        <form
          action={importProducts}
          className="mt-4 flex flex-wrap items-center gap-3"
        >
          <input
            type="file"
            name="file"
            accept=".csv,.xlsx"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
            CSV import et
          </button>
        </form>
      </div>
    </section>
  );
}

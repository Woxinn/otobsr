import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createProductGroup } from "@/app/actions/products";
import ProductGroupTableClient from "@/components/ProductGroupTableClient";

export default async function ProductGroupsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: groups } = await supabase
    .from("product_groups")
    .select("id, name, notes, created_at, products(count)")
    .order("name");

  const { data: attributes } = await supabase
    .from("product_attributes")
    .select("group_id");

  const productCount = (groups ?? []).reduce<Record<string, number>>((acc, group) => {
    const count =
      Array.isArray(group.products) && group.products.length
        ? group.products[0]?.count ?? 0
        : 0;
    acc[group.id] = count;
    return acc;
  }, {});

  const attributeCount = (attributes ?? []).reduce<Record<string, number>>((acc, item) => {
    if (!item.group_id) return acc;
    acc[item.group_id] = (acc[item.group_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Ürün kategorileri
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Ürün kategorileri
          </h2>
        </div>
        <Link
          href="/products"
          className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm font-semibold"
        >
          Ürünler
        </Link>
      </div>

      <form
        action={createProductGroup}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <p className="text-sm font-semibold">Yeni kategori ekle</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <input
            name="name"
            placeholder="Kategori adi"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <input
            name="notes"
            placeholder="Not"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-2"
          />
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
          Kategori ekle
        </button>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        {groups?.length ? (
          <ProductGroupTableClient
            groups={groups}
            productCount={productCount}
            attributeCount={attributeCount}
          />
        ) : (
          <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
            Henüz kategori yok.
          </div>
        )}
      </div>
    </section>
  );
}


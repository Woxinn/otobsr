import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateProduct } from "@/app/actions/products";
import ProductForm from "@/components/ProductForm";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, code, name, brand, unit_price, description, notes, group_id, gtip_id, domestic_cost_percent")
    .eq("id", id)
    .single();

  if (!product) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-8 text-sm text-black/60">
        Ürün bulunamadi.
      </section>
    );
  }

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

  const { data: values } = await supabase
    .from("product_attribute_values")
    .select("attribute_id, value_text, value_number")
    .eq("product_id", product.id);

  const { data: extraAttributes } = await supabase
    .from("product_extra_attributes")
    .select("id, name, unit, value_type, value_text, value_number")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true });

  const extraAttributeItems =
    extraAttributes?.map((item) => ({
      id: item.id,
      name: item.name ?? "",
      unit: item.unit ?? "",
      value_type: (item.value_type === "number" ? "number" : "text") as
        | "number"
        | "text",
      value:
        item.value_type === "number"
          ? item.value_number !== null && item.value_number !== undefined
            ? String(item.value_number)
            : ""
          : item.value_text ?? "",
    })) ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Ürün duzenle
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {product.name}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link
            href={`/products/${product.id}`}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold"
          >
            Detaya don
          </Link>
        </div>
      </div>

      <ProductForm
        mode="edit"
        product={product}
        groups={groups ?? []}
        attributes={attributes ?? []}
        values={values ?? []}
        extraAttributes={extraAttributeItems}
        gtips={gtips ?? []}
        action={updateProduct}
      />
    </section>
  );
}


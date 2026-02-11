// FEATURE: product-cost/gtip + country rates
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pickWeightKg, GtipRow } from "@/lib/gtipCost";
import ProductCostCalculatorClient from "@/components/ProductCostCalculatorClient";

export default async function ProductCostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ country?: string }>;
}) {
  const { id } = await params;
  const { country: countryParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, code, gtip_id, domestic_cost_percent, unit_price")
    .eq("id", id)
    .single();

  if (!product) notFound();

  const { data: gtip } = product.gtip_id
    ? await supabase.from("gtips").select("*").eq("id", product.gtip_id).single()
    : { data: null };

  const { data: countryRates } = product.gtip_id
    ? await supabase
        .from("gtip_country_rates")
        .select("*")
        .eq("gtip_id", product.gtip_id)
        .order("country")
    : { data: [] as any[] };

  const availableCountries: string[] = (countryRates ?? []).map((c) => c.country);

  const { data: latestOrderItem } = await supabase
    .from("order_items")
    .select("unit_price, product_id, created_at, order_id")
    .eq("product_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastOrderCountry: string | null = null;
  if (latestOrderItem?.order_id) {
    const { data: orderWithSupplier } = await supabase
      .from("orders")
      .select("id, supplier_id, suppliers:orders_supplier_id_fkey(country)")
      .eq("id", latestOrderItem.order_id)
      .maybeSingle();
    lastOrderCountry = (orderWithSupplier as any)?.suppliers?.country ?? null;
  }

  const fallbackCountry = availableCountries[0] ?? null;
  const chosenCountry = countryParam ?? lastOrderCountry ?? fallbackCountry;

  const { data: attributeValues } = await supabase
    .from("product_attribute_values")
    .select("value_text, value_number, product_attributes(name, value_type)")
    .eq("product_id", id);

  const weightSource =
    attributeValues?.map((raw) => {
      const item = raw as any;
      const attr = Array.isArray(item.product_attributes)
        ? item.product_attributes[0]
        : item.product_attributes;
      return {
        name: attr?.name,
        value: attr?.value_type === "number" ? item.value_number : item.value_text,
      };
    }) ?? [];

  const weightKg = pickWeightKg(weightSource as any[]);
  const basePrice = latestOrderItem?.unit_price ?? product.unit_price ?? null;

  return (
    <ProductCostCalculatorClient
      product={{
        id: product.id,
        name: product.name,
        code: product.code,
        gtip_id: product.gtip_id,
        domestic_cost_percent: product.domestic_cost_percent,
      }}
      gtipBase={(gtip as unknown as GtipRow) ?? null}
      countryRates={(countryRates ?? []) as any[]}
      availableCountries={availableCountries}
      initialCountry={chosenCountry}
      initialBasePrice={basePrice}
      initialWeightKg={weightKg}
    />
  );
}
// END FEATURE: product-cost/gtip


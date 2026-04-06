import { NextResponse } from "next/server";
import { pickWeightKg, type GtipRow } from "@/lib/gtipCost";
import { canViewFinance, canViewModule, getCurrentUserRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "products") || !canViewFinance(role)) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const productId = (searchParams.get("id") ?? "").trim();
  if (!productId) {
    return NextResponse.json({ error: "Urun id zorunlu" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select("id, name, code, gtip_id, domestic_cost_percent, unit_price")
    .eq("id", productId)
    .maybeSingle();

  if (!product) {
    return NextResponse.json({ error: "Urun bulunamadi" }, { status: 404 });
  }

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

  const availableCountries = (countryRates ?? []).map((row) => String(row.country));

  const { data: latestOrderItem } = await supabase
    .from("order_items")
    .select("unit_price, order_id, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let lastOrderCountry: string | null = null;
  if (latestOrderItem?.order_id) {
    const { data: orderWithSupplier } = await supabase
      .from("orders")
      .select("id, suppliers:orders_supplier_id_fkey(country)")
      .eq("id", latestOrderItem.order_id)
      .maybeSingle();
    lastOrderCountry = (orderWithSupplier as any)?.suppliers?.country ?? null;
  }

  const fallbackCountry = availableCountries[0] ?? null;
  const chosenCountry = lastOrderCountry ?? fallbackCountry;

  const { data: attributeValues } = await supabase
    .from("product_attribute_values")
    .select("value_text, value_number, product_attributes(name, value_type)")
    .eq("product_id", productId);

  const weightSource =
    attributeValues?.map((raw) => {
      const item = raw as any;
      const attr = Array.isArray(item.product_attributes) ? item.product_attributes[0] : item.product_attributes;
      return {
        name: attr?.name,
        value: attr?.value_type === "number" ? item.value_number : item.value_text,
      };
    }) ?? [];

  const weightKg = pickWeightKg(weightSource as any[]);
  const basePrice = latestOrderItem?.unit_price ?? product.unit_price ?? null;

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      code: product.code,
      gtip_id: product.gtip_id,
      domestic_cost_percent: product.domestic_cost_percent,
    },
    gtipBase: (gtip as unknown as GtipRow) ?? null,
    countryRates: (countryRates ?? []) as any[],
    availableCountries,
    initialCountry: chosenCountry,
    initialBasePrice: basePrice,
    initialWeightKg: weightKg,
  });
}

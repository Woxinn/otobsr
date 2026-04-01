import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { pickWeightKg } from "@/lib/gtipCost";
import { calculateDisplayedNetCost, type CountryRateRow } from "@/lib/productCostDisplay";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupplierRow = {
  id: string;
  name: string;
  country?: string | null;
  currency?: string | null;
};

type ItemRow = {
  id: string;
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  target_unit_price?: number | null;
  domestic_cost_percent?: number | null;
  weight_kg?: number | null;
  gtip?: any | null;
  country_rates?: CountryRateRow[] | null;
  products?: any;
};

type Baseline = {
  kind: "offer" | "target" | null;
  value: number | null;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rfqId = searchParams.get("rfq_id");
  if (!rfqId) {
    return NextResponse.json({ error: "rfq_id gerekli" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: rfq, error: rfqErr } = await supabase
    .from("rfqs")
    .select("id, code, currency")
    .eq("id", rfqId)
    .maybeSingle();
  if (rfqErr || !rfq) {
    return NextResponse.json({ error: rfqErr?.message ?? "RFQ bulunamadi" }, { status: 404 });
  }

  const { data: items, error: itemErr } = await supabase
    .from("rfq_items")
    .select(
      `
      id, product_code, product_name, quantity, target_unit_price, product_id,
      products(
        domestic_cost_percent,
        gtip:gtips(
          id, code, customs_duty_rate, additional_duty_rate,
          anti_dumping_applicable, anti_dumping_rate, vat_rate,
          surveillance_applicable, surveillance_unit_value
        )
      )
    `
    )
    .eq("rfq_id", rfqId);
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }

  const productIds = Array.from(
    new Set(((items ?? []) as any[]).map((item) => item.product_id).filter((value): value is string => Boolean(value)))
  );
  const gtipIds = Array.from(
    new Set(
      ((items ?? []) as any[])
        .map((item) => item.products?.gtip?.id ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );

  const [{ data: suppliers }, { data: countryRates }, { data: attrRows }] = await Promise.all([
    supabase.from("suppliers").select("id, name, country"),
    gtipIds.length
      ? supabase
          .from("gtip_country_rates")
          .select(
            "gtip_id, country, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, vat_rate"
          )
          .in("gtip_id", gtipIds)
      : Promise.resolve({ data: [], error: null } as any),
    productIds.length
      ? supabase
          .from("product_attribute_values")
          .select("product_id, value_text, value_number, product_attributes(name, value_type)")
          .in("product_id", productIds)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  const supplierById = new Map<string, any>((suppliers ?? []).map((s: any) => [String(s.id), s]));
  const countryRatesByGtip = new Map<string, CountryRateRow[]>();
  (countryRates ?? []).forEach((row: any) => {
    const key = String(row.gtip_id ?? "");
    if (!key) return;
    const list = countryRatesByGtip.get(key) ?? [];
    list.push({
      country: row.country,
      customs_duty_rate: row.customs_duty_rate,
      additional_duty_rate: row.additional_duty_rate,
      anti_dumping_applicable: row.anti_dumping_applicable,
      anti_dumping_rate: row.anti_dumping_rate,
      surveillance_applicable: row.surveillance_applicable,
      surveillance_unit_value: row.surveillance_unit_value,
      vat_rate: row.vat_rate,
    });
    countryRatesByGtip.set(key, list);
  });
  const attrsByProduct = new Map<string, any[]>();
  (attrRows ?? []).forEach((row: any) => {
    const key = String(row.product_id ?? "");
    if (!key) return;
    const list = attrsByProduct.get(key) ?? [];
    list.push({
      value_text: row.value_text,
      value_number: row.value_number,
      name: row.product_attributes?.name,
      value_type: row.product_attributes?.value_type,
    });
    attrsByProduct.set(key, list);
  });

  const normalizedItems: ItemRow[] = ((items ?? []) as any[]).map((item) => {
    const gtip = item.products?.gtip ?? null;
    const gtipId = gtip?.id ? String(gtip.id) : null;
    const productId = item.product_id ? String(item.product_id) : null;
    return {
      id: item.id,
      product_code: item.product_code,
      product_name: item.product_name,
      quantity: item.quantity,
      target_unit_price: item.target_unit_price,
      domestic_cost_percent: item.products?.domestic_cost_percent ?? null,
      gtip,
      weight_kg: productId ? pickWeightKg(attrsByProduct.get(productId) ?? []) : null,
      country_rates: gtipId ? countryRatesByGtip.get(gtipId) ?? [] : [],
      products: item.products,
    };
  });

  const { data: quotes, error: quoteErr } = await supabase
    .from("rfq_quotes")
    .select("id, supplier_id, currency")
    .eq("rfq_id", rfqId);
  if (quoteErr) {
    return NextResponse.json({ error: quoteErr.message }, { status: 500 });
  }

  const quoteIds = (quotes ?? []).map((q) => q.id);
  const { data: quoteItems, error: qiErr } = await supabase
    .from("rfq_quote_items")
    .select("rfq_quote_id, rfq_item_id, unit_price")
    .in("rfq_quote_id", quoteIds.length ? quoteIds : ["-"]);
  if (qiErr) {
    return NextResponse.json({ error: qiErr.message }, { status: 500 });
  }

  const supplierList: SupplierRow[] = Array.from(
    new Map(
      (quotes ?? []).map((q: any) => [
        String(q.supplier_id),
        {
          id: String(q.supplier_id),
          name: supplierById.get(String(q.supplier_id))?.name ?? q.supplier_id ?? "",
          country: supplierById.get(String(q.supplier_id))?.country ?? null,
          currency: q.currency ?? rfq.currency ?? "",
        },
      ])
    ).values()
  );

  const getPrice = (sup: SupplierRow, item: ItemRow) => {
    const quote = (quotes ?? []).find((q: any) => String(q.supplier_id) === sup.id);
    const qi = (quoteItems ?? []).find((x: any) => x.rfq_quote_id === quote?.id && x.rfq_item_id === item.id);
    return qi?.unit_price ?? null;
  };

  const isComparableCurrency = (sup: SupplierRow) => !rfq.currency || !sup.currency || String(sup.currency) === String(rfq.currency);

  const getItemBaseline = (item: ItemRow): Baseline => {
    const offerPrices = supplierList
      .filter((sup) => isComparableCurrency(sup))
      .map((sup) => getPrice(sup, item))
      .filter((price): price is number => typeof price === "number" && Number.isFinite(price));

    if (offerPrices.length >= 2) return { kind: "offer" as const, value: Math.min(...offerPrices) };
    if (offerPrices.length === 1 && item.target_unit_price != null && Number(item.target_unit_price) !== 0) {
      return { kind: "target" as const, value: Number(item.target_unit_price) };
    }
    return { kind: null, value: null };
  };

  const getSupplierTotal = (sup: SupplierRow) => {
    if (!isComparableCurrency(sup)) return null;
    let total = 0;
    for (const item of normalizedItems) {
      const qty = Number(item.quantity ?? 0);
      const price = getPrice(sup, item);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (price == null || !Number.isFinite(price)) return null;
      total += qty * price;
    }
    return total;
  };

  const targetTotal = (() => {
    let total = 0;
    let used = false;
    for (const item of normalizedItems) {
      const qty = Number(item.quantity ?? 0);
      const target = Number(item.target_unit_price ?? NaN);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (!Number.isFinite(target)) return null;
      total += qty * target;
      used = true;
    }
    return used ? total : null;
  })();

  const totalBaseline: Baseline = (() => {
    const totals = supplierList
      .map((sup) => getSupplierTotal(sup))
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (totals.length >= 2) return { kind: "offer" as const, value: Math.min(...totals) };
    if (totals.length === 1 && targetTotal != null && targetTotal !== 0) return { kind: "target" as const, value: targetTotal };
    return { kind: null, value: null };
  })();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Teklifler");

  const columns: Partial<ExcelJS.Column>[] = [
    { header: "Product code", key: "code", width: 18 },
    { header: "Product name", key: "name", width: 32 },
    { header: "RFQ quantity", key: "qty", width: 14 },
    { header: "Target unit price", key: "target_price", width: 16, style: { numFmt: "#,##0.000000" } },
  ];

  supplierList.forEach((sup) => {
    columns.push(
      { header: `${sup.name} price`, key: `price_${sup.id}`, width: 14, style: { numFmt: "#,##0.000000" } },
      { header: `${sup.name} diff %`, key: `diff_pct_${sup.id}`, width: 12, style: { numFmt: "0.00%" } },
      { header: `${sup.name} net cost`, key: `cost_${sup.id}`, width: 16, style: { numFmt: "#,##0.000000" } }
    );
  });

  ws.columns = columns;
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  normalizedItems.forEach((item) => {
    const row: Record<string, any> = {
      code: item.product_code ?? "",
      name: item.product_name ?? "",
      qty: item.quantity ?? "",
      target_price: item.target_unit_price ?? null,
    };
    const baseline = getItemBaseline(item);

    supplierList.forEach((sup) => {
      const price = getPrice(sup, item);
      const costResult =
        price != null
          ? calculateDisplayedNetCost({
              basePrice: price,
              domesticCostPercent: item.domestic_cost_percent ?? null,
              weightKg: item.weight_kg ?? null,
              gtipBase: item.gtip ?? null,
              countryRates: item.country_rates ?? [],
              selectedCountry: sup.country ?? null,
            })
          : null;
      const netCost = costResult?.netCost ?? null;
      const diffPct =
        price != null && isComparableCurrency(sup) && baseline.value != null && baseline.value !== 0
          ? (price - baseline.value) / baseline.value
          : null;

      row[`price_${sup.id}`] = price;
      row[`diff_pct_${sup.id}`] = diffPct;
      row[`cost_${sup.id}`] = netCost != null ? Number(netCost) : null;
    });

    const excelRow = ws.addRow(row);
    const comparablePrices = supplierList
      .filter((sup) => isComparableCurrency(sup))
      .map((sup) => row[`price_${sup.id}`])
      .filter((price): price is number => typeof price === "number" && Number.isFinite(price));
    const minPrice = comparablePrices.length > 0 ? Math.min(...comparablePrices) : null;

    supplierList.forEach((sup) => {
      const priceCell = excelRow.getCell(`price_${sup.id}`);
      const diffPctCell = excelRow.getCell(`diff_pct_${sup.id}`);
      const costCell = excelRow.getCell(`cost_${sup.id}`);

      priceCell.alignment = { horizontal: "right" };
      diffPctCell.alignment = { horizontal: "right" };
      costCell.alignment = { horizontal: "right" };

      if (minPrice !== null && Number(priceCell.value) === minPrice) {
        const green = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFC6EFCE" } };
        priceCell.fill = green;
        diffPctCell.fill = green;
        costCell.fill = green;
      }

      const diffPctValue = row[`diff_pct_${sup.id}`];
      if (diffPctValue != null) {
        const favorable = Number(diffPctValue) <= 0;
        diffPctCell.font = { color: { argb: favorable ? "FF166534" : "FFB91C1C" }, bold: true };
      }

      if (priceCell.value === null || priceCell.value === "") {
        priceCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
      if (diffPctCell.value === null || diffPctCell.value === "") {
        diffPctCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
      if (costCell.value === null || costCell.value === "") {
        costCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
    });
  });

  const totalRow: Record<string, any> = {
    code: "TOTAL",
    name: "Quantity x unit price",
    qty: "",
    target_price: targetTotal,
  };

  supplierList.forEach((sup) => {
    const total = getSupplierTotal(sup);
    const diffPct = total != null && totalBaseline.value != null && totalBaseline.value !== 0 ? (total - totalBaseline.value) / totalBaseline.value : null;
    totalRow[`price_${sup.id}`] = total;
    totalRow[`diff_pct_${sup.id}`] = diffPct;
    totalRow[`cost_${sup.id}`] = null;
  });

  const excelTotalRow = ws.addRow(totalRow);
  excelTotalRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rfq_${rfq.code ?? rfq.id}.xlsx"`,
    },
  });
}

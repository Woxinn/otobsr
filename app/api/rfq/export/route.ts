import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { computeCosts } from "@/lib/gtipCost";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    return NextResponse.json({ error: rfqErr?.message ?? "RFQ bulunamadı" }, { status: 404 });
  }

  const { data: items, error: itemErr } = await supabase
    .from("rfq_items")
    .select(
      `
      id, product_id, product_code, product_name, quantity,
      products(
        domestic_cost_percent,
        gtip:gtips(
          id, code, customs_duty_rate, additional_duty_rate,
          anti_dumping_applicable, anti_dumping_rate,
          surveillance_applicable, surveillance_unit_value
        )
      )
    `
    )
    .eq("rfq_id", rfqId);
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  const itemById = new Map<string, any>();
  (items ?? []).forEach((it: any) => itemById.set(String(it.id), it));

  const { data: suppliers } = await supabase.from("suppliers").select("id, name");
  const supplierById = new Map<string, any>((suppliers ?? []).map((s: any) => [String(s.id), s]));

  const { data: quotes, error: quoteErr } = await supabase
    .from("rfq_quotes")
    .select("id, supplier_id, currency, transit_time")
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

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Teklifler");

  // Dynamic columns: base + per supplier (price, net cost, lead)
  const supplierList = Array.from(
    new Map(
      (quotes ?? []).map((q: any) => [
        String(q.supplier_id),
        {
          id: String(q.supplier_id),
          name: supplierById.get(String(q.supplier_id))?.name ?? q.supplier_id ?? "",
          transit: q.transit_time,
          currency: q.currency ?? rfq.currency ?? "",
        },
      ])
    ).values()
  );

  const columns: ExcelJS.Column[] = [
    { header: "Product code", key: "code", width: 18 },
    { header: "Product name", key: "name", width: 32 },
    { header: "RFQ quantity", key: "qty", width: 14 },
  ];

  supplierList.forEach((sup) => {
    columns.push(
      { header: `${sup.name} fiyat`, key: `price_${sup.id}`, width: 14, style: { numFmt: "#,##0.0000" } },
      { header: `${sup.name} KDV'siz maliyet`, key: `cost_${sup.id}`, width: 16, style: { numFmt: "#,##0.0000" } },
      { header: `${sup.name} hazır (gün)`, key: `lead_${sup.id}`, width: 12 }
    );
  });

  ws.columns = columns;

  // Header styling
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4B5563" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  (items ?? []).forEach((item: any) => {
    const row: Record<string, any> = {
      code: item?.product_code ?? "",
      name: item?.product_name ?? "",
      qty: item?.quantity ?? "",
    };

    supplierList.forEach((sup) => {
      const quote = (quotes ?? []).find((q: any) => String(q.supplier_id) === sup.id);
      const qi = (quoteItems ?? []).find(
        (x: any) => x.rfq_quote_id === quote?.id && x.rfq_item_id === item.id
      );
      const price = qi?.unit_price ?? null;
      const costResult =
        price != null
          ? computeCosts({
              basePrice: price,
              domesticCostPercent: item?.products?.domestic_cost_percent ?? null,
              weightKg: null,
              gtip: item?.products?.gtip ?? null,
            })
          : null;
      const netCost = costResult?.gozetimsizMatrah ?? costResult?.gozetimliMatrah ?? null;

      row[`price_${sup.id}`] = price;
      row[`cost_${sup.id}`] = netCost != null ? Number(netCost) : null;
      row[`lead_${sup.id}`] = sup.transit ?? "";
    });

    const excelRow = ws.addRow(row);

    // highlight best prices and color missing
    const prices = supplierList
      .map((sup) => ({ sup, price: row[`price_${sup.id}`] }))
      .filter((p) => p.price != null && p.price !== "");
    const minPrice =
      prices.length > 0 ? Math.min(...prices.map((p) => Number(p.price))) : null;

    supplierList.forEach((sup) => {
      const priceCell = excelRow.getCell(`price_${sup.id}`);
      const costCell = excelRow.getCell(`cost_${sup.id}`);
      const leadCell = excelRow.getCell(`lead_${sup.id}`);

      priceCell.alignment = { horizontal: "right" };
      costCell.alignment = { horizontal: "right" };
      leadCell.alignment = { horizontal: "center" };

      if (minPrice !== null && Number(priceCell.value) === minPrice) {
        const green = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        priceCell.fill = green;
        costCell.fill = green;
      }

      if (priceCell.value === null || priceCell.value === "") {
        priceCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
      if (costCell.value === null || costCell.value === "") {
        costCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
      if (leadCell.value === null || leadCell.value === "") {
        leadCell.font = { color: { argb: "FF9CA3AF" }, italic: true };
      }
    });
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

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const pageSize = 1000;
  let from = 0;
  const rows: {
    order_name: string;
    supplier_name: string;
    product_code: string;
    name: string;
    quantity: number | string | null;
    unit_price: number | string | null;
  }[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("order_items")
      .select(
        "quantity, unit_price, name, products(code, name), orders(name, suppliers(name))"
      )
      .range(from, from + pageSize - 1)
      .order("order_id", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const batch = data ?? [];
    batch.forEach((i: any) => {
      const orderName = i.orders?.name ?? "";
      const supplierName = Array.isArray(i.orders?.suppliers)
        ? i.orders.suppliers[0]?.name ?? ""
        : i.orders?.suppliers?.name ?? "";
      rows.push({
        order_name: orderName,
        supplier_name: supplierName,
        product_code: i.products?.code ?? "",
        name: i.products?.name ?? i.name ?? "",
        quantity: i.quantity ?? "",
        unit_price: i.unit_price ?? "",
      });
    });

    if (batch.length < pageSize) break;
    from += pageSize;
    if (from > 100000) break; // safety guard
  }

  const format = "excel";
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Order items");
  ws.columns = [
    { header: "order_name", key: "order_name", width: 28 },
    { header: "supplier_name", key: "supplier_name", width: 28 },
    { header: "product_code", key: "product_code", width: 18 },
    { header: "name", key: "name", width: 32 },
    { header: "quantity", key: "quantity", width: 12 },
    { header: "unit_price", key: "unit_price", width: 14 },
  ];
  rows.forEach((r) => ws.addRow(r));
  ws.getColumn("unit_price").numFmt = "#,##0.######";

  const buffer = await wb.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="order-items-all.xlsx"`,
    },
  });
}

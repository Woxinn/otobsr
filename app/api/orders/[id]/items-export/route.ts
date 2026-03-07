import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const slugifyAscii = (value: string | null | undefined) => {
  if (!value) return "order";

  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "I")
    .replace(/ğ/g, "g")
    .replace(/Ğ/g, "G")
    .replace(/ü/g, "u")
    .replace(/Ü/g, "U")
    .replace(/ş/g, "s")
    .replace(/Ş/g, "S")
    .replace(/ö/g, "o")
    .replace(/Ö/g, "O")
    .replace(/ç/g, "c")
    .replace(/Ç/g, "C");

  return (
    normalized
      .trim()
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "order"
  );
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: orderId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: orderRow, error: orderErr } = await supabase
    .from("orders")
    .select("name, suppliers(name)")
    .eq("id", orderId)
    .single();

  if (orderErr || !orderRow) {
    return NextResponse.json({ error: "Siparis bulunamadi" }, { status: 404 });
  }

  const orderName = orderRow.name ?? "";
  const supplierName =
    (Array.isArray((orderRow as any).suppliers)
      ? (orderRow as any).suppliers[0]?.name
      : (orderRow as any).suppliers?.name) ?? "";
  const fileBase = slugifyAscii(orderName);

  const { data: items, error } = await supabase
    .from("order_items")
    .select("quantity, unit_price, name, products(code, name)")
    .eq("order_id", orderId)
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const format = (() => {
    try {
      const url = new URL(req.url);
      return (url.searchParams.get('format') ?? "csv").toLowerCase();
    } catch {
      return "csv";
    }
  })();

  const rows = (items ?? []).map((item: any) => ({
    order_name: orderName,
    supplier_name: supplierName,
    code: item.products?.code ?? "",
    name: item.products?.name ?? item.name ?? "",
    quantity: item.quantity ?? "",
    unit_price: item.unit_price ?? "",
  }));

  if (format === "xlsx" || format === "excel") {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Items");

    sheet.columns = [
      { header: "order_name", key: "order_name", width: 28 },
      { header: "supplier_name", key: "supplier_name", width: 28 },
      { header: "product_code", key: "code", width: 18 },
      { header: "name", key: "name", width: 32 },
      { header: "quantity", key: "quantity", width: 12 },
      { header: "unit_price", key: "unit_price", width: 14 },
    ];

    rows.forEach((row) => sheet.addRow(row));
    sheet.getColumn("unit_price").numFmt = "#,##0.00";

    const buffer = await workbook.xlsx.writeBuffer();
    const body = buffer instanceof ArrayBuffer ? buffer : Buffer.from(buffer);

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  }

  const csvRows = [
    ["order_name", "supplier_name", "product_code", "name", "quantity", "unit_price"],
    ...rows.map((row) => [
      row.order_name,
      row.supplier_name,
      row.code,
      row.name,
      row.quantity,
      row.unit_price,
    ]),
  ];

  const csv = csvRows
    .map((row) =>
      row
        .map((value) =>
          typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : String(value ?? "")
        )
        .join(",")
    )
    .join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
    },
  });
}

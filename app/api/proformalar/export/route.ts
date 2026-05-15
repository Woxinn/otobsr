import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fmtNum = (value: number | null | undefined) => Number(value ?? 0);

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("tr-TR");
};

const applyHeaderStyle = (ws: ExcelJS.Worksheet) => {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3A53" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF0F172A" } },
      bottom: { style: "thin", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FF0F172A" } },
    };
  });
};

const applyBodyStyle = (ws: ExcelJS.Worksheet) => {
  for (let rowNo = 2; rowNo <= ws.rowCount; rowNo += 1) {
    const row = ws.getRow(rowNo);
    const zebra = rowNo % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
    row.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
  }
};

const chunk = <T,>(arr: T[], size = 500) => {
  const list: T[][] = [];
  for (let i = 0; i < arr.length; i += size) list.push(arr.slice(i, i + size));
  return list;
};

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const supplier = (url.searchParams.get("supplier") ?? "").trim();

  const { data: proformas, error } = await supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, currency, total_amount, supplier_id, suppliers(name), created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ ok: false, message: `Proformalar okunamadi: ${error.message}` }, { status: 500 });
  }

  const filtered = (proformas ?? []).filter((p) => {
    if (supplier && p.supplier_id !== supplier) return false;
    if (!q) return true;
    const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
    const haystack = [p.proforma_no ?? "", p.name ?? "", supplierName ?? ""].join(" ").toLowerCase();
    return haystack.includes(q);
  });

  const proformaIds = filtered.map((p) => p.id).filter(Boolean);
  const itemRows: any[] = [];
  for (const ids of chunk(proformaIds)) {
    const { data: items, error: itemsError } = await supabase
      .from("proforma_items")
      .select("id, proforma_id, product_code, product_name, quantity, unit_price, line_total")
      .in("proforma_id", ids);
    if (itemsError) {
      return NextResponse.json({ ok: false, message: `Proforma kalemleri okunamadi: ${itemsError.message}` }, { status: 500 });
    }
    itemRows.push(...(items ?? []));
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Otobsr Import";
  wb.created = new Date();

  const summary = wb.addWorksheet("Proforma Ozet");
  summary.columns = [
    { header: "Proforma No", key: "proforma_no", width: 22 },
    { header: "Proforma Adi", key: "name", width: 34 },
    { header: "Tedarikci", key: "supplier", width: 24 },
    { header: "Tarih", key: "date", width: 14 },
    { header: "Toplam", key: "total_amount", width: 16 },
    { header: "Para Birimi", key: "currency", width: 12 },
    { header: "Kalem Sayisi", key: "line_count", width: 12 },
    { header: "Toplam Adet", key: "total_qty", width: 14 },
  ];

  const itemsByProforma = new Map<string, any[]>();
  itemRows.forEach((item) => {
    const pid = String(item.proforma_id ?? "");
    if (!pid) return;
    const bucket = itemsByProforma.get(pid) ?? [];
    bucket.push(item);
    itemsByProforma.set(pid, bucket);
  });

  filtered.forEach((p) => {
    const rows = itemsByProforma.get(String(p.id)) ?? [];
    const totalQty = rows.reduce((sum, row) => sum + fmtNum(row.quantity), 0);
    const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
    summary.addRow({
      proforma_no: p.proforma_no ?? "-",
      name: p.name ?? "-",
      supplier: supplierName ?? "-",
      date: fmtDate(p.proforma_date),
      total_amount: fmtNum(p.total_amount),
      currency: p.currency ?? "-",
      line_count: rows.length,
      total_qty: totalQty,
    });
  });

  applyHeaderStyle(summary);
  applyBodyStyle(summary);
  summary.getColumn("total_amount").numFmt = "#,##0.00";
  summary.getColumn("line_count").alignment = { horizontal: "right" };
  summary.getColumn("total_qty").alignment = { horizontal: "right" };

  const detail = wb.addWorksheet("Proforma Kalemleri");
  detail.columns = [
    { header: "Proforma No", key: "proforma_no", width: 22 },
    { header: "Tedarikci", key: "supplier", width: 24 },
    { header: "Tarih", key: "date", width: 14 },
    { header: "Urun Kodu", key: "product_code", width: 20 },
    { header: "Urun Adi", key: "product_name", width: 34 },
    { header: "Adet", key: "quantity", width: 12 },
    { header: "Birim Fiyat", key: "unit_price", width: 14 },
    { header: "Satir Tutari", key: "line_total", width: 16 },
    { header: "Para Birimi", key: "currency", width: 12 },
  ];

  const proformaMap = new Map(
    filtered.map((p) => {
      const supplierName = Array.isArray(p.suppliers) ? p.suppliers[0]?.name : (p.suppliers as any)?.name;
      return [
        String(p.id),
        {
          no: p.proforma_no ?? "-",
          supplier: supplierName ?? "-",
          date: fmtDate(p.proforma_date),
          currency: p.currency ?? "-",
        },
      ] as const;
    })
  );

  itemRows.forEach((item) => {
    const meta = proformaMap.get(String(item.proforma_id ?? ""));
    if (!meta) return;
    detail.addRow({
      proforma_no: meta.no,
      supplier: meta.supplier,
      date: meta.date,
      product_code: item.product_code ?? "-",
      product_name: item.product_name ?? "-",
      quantity: fmtNum(item.quantity),
      unit_price: fmtNum(item.unit_price),
      line_total: fmtNum(item.line_total),
      currency: meta.currency,
    });
  });

  applyHeaderStyle(detail);
  applyBodyStyle(detail);
  detail.getColumn("quantity").alignment = { horizontal: "right" };
  detail.getColumn("unit_price").numFmt = "#,##0.00";
  detail.getColumn("line_total").numFmt = "#,##0.00";
  detail.getColumn("unit_price").alignment = { horizontal: "right" };
  detail.getColumn("line_total").alignment = { horizontal: "right" };

  const buffer = await wb.xlsx.writeBuffer();
  const dateTag = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="proformalar-${dateTag}.xlsx"`,
    },
  });
}


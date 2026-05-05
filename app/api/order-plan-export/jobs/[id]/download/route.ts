import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const fmt0 = (n: number) => Number(n ?? 0);
const ceil = (n: number) => Math.ceil(n);

const computeTrend = (sales60: number, salesPrev60: number) => {
  if (salesPrev60 === 0) return { trendDirection: "stable", multiplier: 1 };
  const changeRatio = (sales60 - salesPrev60) / salesPrev60;
  if (changeRatio > 0.1) return { trendDirection: "increasing", multiplier: 1.15 };
  if (changeRatio < -0.1) return { trendDirection: "decreasing", multiplier: 0.85 };
  return { trendDirection: "stable", multiplier: 1 };
};

const applyWorksheetStyle = (ws: ExcelJS.Worksheet) => {
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: ws.columns.length },
  };

  const header = ws.getRow(1);
  header.height = 24;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0E7490" },
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF0F172A" } },
      left: { style: "thin", color: { argb: "FF0F172A" } },
      bottom: { style: "thin", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FF0F172A" } },
    };
  });

  for (let rowNo = 2; rowNo <= ws.rowCount; rowNo += 1) {
    const row = ws.getRow(rowNo);
    row.height = 20;
    const zebra = rowNo % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF";
    row.eachCell((cell, colNo) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: zebra } };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
      cell.alignment =
        colNo >= 4
          ? { vertical: "middle", horizontal: "right" }
          : { vertical: "middle", horizontal: "left" };
    });
  }

  const integerCols = [
    "D",
    "E",
    "F",
    "G",
    "H",
    "I",
    "J",
    "K",
    "L",
    "M",
    "N",
    "O",
    "P",
    "R",
  ];
  integerCols.forEach((col) => {
    ws.getColumn(col).numFmt = "#,##0";
  });

  ws.getColumn("Q").alignment = { horizontal: "center", vertical: "middle" };
};

const fetchAllRows = async (supabase: any, jobId: string) => {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("order_plan_export_job_rows")
      .select("*")
      .eq("job_id", jobId)
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
};

const fetchAllCodes = async (supabase: any, jobId: string) => {
  const rows: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("order_plan_export_job_codes")
      .select("netsis_code, stock, sales120, sales60, sales_prev60, sales10y")
      .eq("job_id", jobId)
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: job, error: jobError } = await supabase
    .from("order_plan_export_jobs")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (jobError || !job) {
    return NextResponse.json({ ok: false, message: "Job bulunamadi." }, { status: 404 });
  }
  if (job.status !== "ready") {
    return NextResponse.json(
      { ok: false, message: "Export henuz hazir degil." },
      { status: 409 }
    );
  }

  const [staticRows, codeRows] = await Promise.all([fetchAllRows(supabase, id), fetchAllCodes(supabase, id)]);
  const codeMap = new Map<string, any>();
  codeRows.forEach((row) => {
    codeMap.set(String(row.netsis_code ?? ""), row);
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Siparis Plani");
  ws.columns = [
    { header: "Kod", key: "code", width: 18 },
    { header: "Urun", key: "name", width: 30 },
    { header: "Kategori", key: "group", width: 18 },
    { header: "Stok", key: "stock", width: 12 },
    { header: "Yolda", key: "transit", width: 12 },
    { header: "Proforma Acik", key: "proforma_open", width: 14 },
    { header: "RFQ", key: "rfq", width: 12 },
    { header: "Toplam", key: "total_stock", width: 14 },
    { header: "Onceki 2A", key: "sales_prev60", width: 14 },
    { header: "Son 2A", key: "sales_60", width: 14 },
    { header: "2026 YTD", key: "sales_120", width: 14 },
    { header: "10Y", key: "sales_10y", width: 14 },
    { header: "Lead", key: "lead", width: 10 },
    { header: "Safety", key: "safety", width: 10 },
    { header: "Ihtiyac", key: "need", width: 14 },
    { header: "Tavsiye", key: "suggest", width: 14 },
    { header: "Trend", key: "trend", width: 12 },
    { header: "Plan Girisi", key: "plan_value", width: 14 },
  ];

  staticRows.forEach((row) => {
    const codeMetrics = row.netsis_code ? codeMap.get(String(row.netsis_code)) : null;
    const stock = Number(codeMetrics?.stock ?? 0);
    const sales120 = Number(codeMetrics?.sales120 ?? 0);
    const sales60 = Number(codeMetrics?.sales60 ?? 0);
    const salesPrev60 = Number(codeMetrics?.sales_prev60 ?? 0);
    const sales10y = Number(codeMetrics?.sales10y ?? row.sales10y ?? 0);

    const inTransit = Number(row.in_transit ?? 0);
    const proformaOpen = Number(row.proforma_open ?? 0);
    const rfqQty = Number(row.rfq_qty ?? 0);
    const lead = Number(row.lead ?? 0);
    const safety = Number(row.safety ?? 0);
    const availableStock = stock + inTransit + proformaOpen;

    const trend = computeTrend(sales60, salesPrev60);
    let need = 0;
    if (availableStock < sales120) {
      need = sales120;
    } else if (availableStock >= sales120 && lead + safety >= 120) {
      need = sales120 * 2 - availableStock;
    }
    if (need < 0) need = 0;
    need = ceil(need);

    const added = ws.addRow({
      code: row.code,
      name: row.name,
      group: row.group_name ?? "Kategori yok",
      stock: fmt0(stock),
      transit: fmt0(inTransit),
      proforma_open: fmt0(proformaOpen),
      rfq: fmt0(rfqQty),
      total_stock: fmt0(stock + inTransit + proformaOpen + rfqQty),
      sales_prev60: fmt0(salesPrev60),
      sales_60: fmt0(sales60),
      sales_120: fmt0(sales120),
      sales_10y: fmt0(sales10y),
      lead,
      safety,
      need,
      suggest: ceil(need * trend.multiplier),
      trend:
        trend.trendDirection === "increasing"
          ? "satis artiyor"
          : trend.trendDirection === "decreasing"
          ? "satis azaliyor"
          : "stabil",
      plan_value: fmt0(Number(row.plan_value ?? 0)),
    });

    const trendCell = added.getCell(17);
    if (trend.trendDirection === "increasing") {
      trendCell.font = { color: { argb: "FF166534" }, bold: true };
    } else if (trend.trendDirection === "decreasing") {
      trendCell.font = { color: { argb: "FFB91C1C" }, bold: true };
    } else {
      trendCell.font = { color: { argb: "FF475569" }, italic: true };
    }
  });

  applyWorksheetStyle(ws);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"siparis-plani-job-${id}.xlsx\"`,
    },
  });
}

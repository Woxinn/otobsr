import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: types } = await supabase
    .from("product_types")
    .select(
      "id, name, product_type_compliance(country, tse_status, analiz_gecerlilik, tareks_no, rapor_no, valid_from, valid_to)"
    )
    .order("name");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("TipUyumlulukSablon");
  ws.columns = [
    { header: "Tip", key: "tip", width: 20 },
    { header: "Ulke (opsiyonel)", key: "country", width: 18 },
    { header: "TSE Durumu", key: "tse", width: 18 },
    { header: "Analiz Gecerlilik (YYYY-MM-DD)", key: "analiz", width: 24 },
    { header: "TAREKS No", key: "tareks", width: 18 },
    { header: "Rapor No", key: "rapor", width: 18 },
    { header: "Gecerlilik Baslangic (YYYY-MM-DD)", key: "valid_from", width: 28 },
    { header: "Gecerlilik Bitis (YYYY-MM-DD)", key: "valid_to", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };

  // Mevcut tipleri ve varsa uyumluluk kayıtlarını doldur
  (types ?? []).forEach((t) => {
    const compliances = t.product_type_compliance ?? [];
    if (!compliances.length) {
      ws.addRow({
        tip: t.name,
        country: "",
        tse: "",
        analiz: "",
        tareks: "",
        rapor: "",
        valid_from: "",
        valid_to: "",
      });
      return;
    }
    compliances.forEach((c: any) => {
      ws.addRow({
        tip: t.name,
        country: c.country ?? "",
        tse: c.tse_status ?? "",
        analiz: c.analiz_gecerlilik ?? "",
        tareks: c.tareks_no ?? "",
        rapor: c.rapor_no ?? "",
        valid_from: c.valid_from ?? "",
        valid_to: c.valid_to ?? "",
      });
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="product-types-template.xlsx"',
    },
  });
}

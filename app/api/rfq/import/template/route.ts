import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const header = [
    "product_code",
    "supplier_name",
    "unit_price",
    "currency",
    "quantity",
    "transit_days",
    "min_order",
    "delivery_time",
    "validity_date",
    "notes",
  ];

  const { searchParams } = new URL(req.url);
  const rfqId = searchParams.get("rfq_id");

  let rows: any[][] = [];

  if (rfqId) {
    try {
      const supabase = await createSupabaseServerClient();
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data: items, error } = await supabase
          .from("rfq_items")
          .select("product_code, quantity")
          .eq("rfq_id", rfqId)
          .range(from, to);
        if (error) {
          console.error("[rfq-template] rfq_items error", error);
          break;
        }
        const batch = items ?? [];
        batch.forEach((it) => {
          rows.push([
            it.product_code ?? "",
            "",
            "",
            "USD",
            it.quantity ?? "",
            "",
            "",
            "",
            "",
            "",
          ]);
        });
        if (batch.length < pageSize) break;
      }
    } catch (err) {
      console.error("[rfq-template] err", err);
    }
  }

  if (!rows.length) {
    rows = [["ABC-01", "", "", "USD", 100, "", "", "", "", ""]];
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RFQ Import");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=rfq-import-template.xlsx",
    },
  });
}

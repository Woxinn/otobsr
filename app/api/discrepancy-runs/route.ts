import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

type ImportRow = {
  product_code?: string | null;
  product_name?: string | null;
  quantity?: number | string | null;
};

const MAX_QTY = 9_999_999_999_999_999.9999;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

const normalizeCode = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const codeKey = (value: string | null | undefined) => normalizeCode(value).toLowerCase();

const normalizeName = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  const normalized =
    typeof value === "string" ? value.replace(/\./g, "").replace(",", ".") : String(value);
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const aggregateRows = (rows: ImportRow[]) => {
  const map = new Map<string, { product_code: string; product_name: string; quantity: number }>();
  rows.forEach((row) => {
    const code = normalizeCode(row.product_code);
    const key = codeKey(code);
    if (!code) return;
    const qty = toNumber(row.quantity);
    const name = normalizeName(row.product_name);
    const existing = map.get(key);
    if (existing) {
      existing.quantity += qty;
      if (!existing.product_name && name) existing.product_name = name;
      map.set(key, existing);
      return;
    }
    map.set(key, { product_code: code, product_name: name, quantity: qty });
  });
  return map;
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") return NextResponse.json({ error: "Yetki yok" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const notes = String(body?.notes ?? "").trim();
  const supplierName = String(body?.supplier_name ?? "").trim();
  const orderFileName = String(body?.order_file_name ?? "").trim();
  const packingFileName = String(body?.packing_file_name ?? "").trim();
  const orderRows = (Array.isArray(body?.order_rows) ? body.order_rows : []) as ImportRow[];
  const packingRows = (Array.isArray(body?.packing_rows) ? body.packing_rows : []) as ImportRow[];

  if (!title) return NextResponse.json({ error: "Baslik gerekli" }, { status: 400 });
  if (!orderRows.length || !packingRows.length) {
    return NextResponse.json({ error: "Order ve packing dosyalari gerekli" }, { status: 400 });
  }

  const orderAgg = aggregateRows(orderRows);
  const packingAgg = aggregateRows(packingRows);
  const allCodes = new Set([...orderAgg.keys(), ...packingAgg.keys()]);

  const rowsPayload: any[] = [];
  const overflowDetails: Array<{ product_code: string; source: "order" | "packing" | "diff"; value: number }> = [];
  let equalCount = 0;
  let shortageCount = 0;
  let excessCount = 0;
  let unexpectedCount = 0;

  allCodes.forEach((key) => {
    const o = orderAgg.get(key);
    const p = packingAgg.get(key);
    const code = o?.product_code || p?.product_code || key;
    const orderQty = round4(Number(o?.quantity ?? 0));
    const packingQty = round4(Number(p?.quantity ?? 0));
    const diffQty = round4(packingQty - orderQty);

    if (!Number.isFinite(orderQty) || Math.abs(orderQty) > MAX_QTY) {
      overflowDetails.push({ product_code: code, source: "order", value: orderQty });
      return;
    }
    if (!Number.isFinite(packingQty) || Math.abs(packingQty) > MAX_QTY) {
      overflowDetails.push({ product_code: code, source: "packing", value: packingQty });
      return;
    }
    if (!Number.isFinite(diffQty) || Math.abs(diffQty) > MAX_QTY) {
      overflowDetails.push({ product_code: code, source: "diff", value: diffQty });
      return;
    }

    let status: "tam" | "eksik" | "fazla" | "beklenmeyen" = "tam";
    if (orderQty <= 0 && packingQty > 0) {
      status = "beklenmeyen";
      unexpectedCount += 1;
    } else if (diffQty < 0) {
      status = "eksik";
      shortageCount += 1;
    } else if (diffQty > 0) {
      status = "fazla";
      excessCount += 1;
    } else {
      status = "tam";
      equalCount += 1;
    }

    rowsPayload.push({
      product_code: code,
      product_name: o?.product_name || p?.product_name || null,
      order_qty: orderQty,
      packing_qty: packingQty,
      diff_qty: diffQty,
      status,
    });
  });

  if (overflowDetails.length) {
    return NextResponse.json(
      {
        error:
          "numeric field overflow: Dosyada cok buyuk veya hatali miktar var. Quantity kolonunu kontrol edin.",
        overflow_product_codes: Array.from(new Set(overflowDetails.map((x) => x.product_code))).slice(0, 50),
        overflow_details: overflowDetails.slice(0, 50),
      },
      { status: 400 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: run, error: runErr } = await supabase
    .from("discrepancy_runs")
    .insert({
      title,
      notes: notes || null,
      supplier_name: supplierName || null,
      created_by: user?.id ?? null,
      total_products: rowsPayload.length,
      equal_count: equalCount,
      shortage_count: shortageCount,
      excess_count: excessCount,
      unexpected_count: unexpectedCount,
    })
    .select("id")
    .single();

  if (runErr || !run) {
    return NextResponse.json({ error: runErr?.message ?? "Karsilastirma olusturulamadi" }, { status: 500 });
  }

  const runId = run.id;
  const chunkSize = 1000;
  for (let i = 0; i < rowsPayload.length; i += chunkSize) {
    const chunk = rowsPayload.slice(i, i + chunkSize).map((row) => ({ ...row, run_id: runId }));
    const { error } = await supabase.from("discrepancy_rows").insert(chunk);
    if (error) {
      await supabase.from("discrepancy_runs").delete().eq("id", runId);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const filesPayload = [
    {
      run_id: runId,
      source_type: "order",
      file_name: orderFileName || null,
      row_count: orderRows.length,
    },
    {
      run_id: runId,
      source_type: "packing",
      file_name: packingFileName || null,
      row_count: packingRows.length,
    },
  ];
  await supabase.from("discrepancy_files").insert(filesPayload);

  return NextResponse.json({
    ok: true,
    id: runId,
    summary: {
      total_products: rowsPayload.length,
      tam: equalCount,
      eksik: shortageCount,
      fazla: excessCount,
      beklenmeyen: unexpectedCount,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Row = {
  tip: string;
  country: string | null;
  tse: string | null;
  analiz: string | null;
  tareks: string | null;
  rapor: string | null;
  valid_from: string | null;
  valid_to: string | null;
};

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Dosya zorunlu" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const isCsv =
      file.type?.includes("csv") ||
      file.name?.toLowerCase().endsWith(".csv") ||
      file.name?.toLowerCase().endsWith(".txt");

    // Debug: ham satırları tutalım
    const debugRows: any[] = [];

    const parseDate = (raw: any): string | null => {
      if (!raw) return null;
      if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
      if (typeof raw === "number") {
        const d = new Date(Math.round((raw - 25569) * 86400 * 1000));
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }
      if (typeof raw === "object" && raw !== null && "text" in raw) {
        const val = String((raw as any).text ?? "").trim();
        if (!val) return null;
        // dd.MM.yyyy or dd/MM/yyyy (optionally with time)
        const m = val.match(/^(\d{2})[./](\d{2})[./](\d{4})(?:\s+.*)?$/);
        if (m) {
          const iso = `${m[3]}-${m[2]}-${m[1]}`;
          const d2 = new Date(iso);
          return Number.isNaN(d2.getTime()) ? null : iso;
        }
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
      }
      const val = String(raw).trim();
      if (!val) return null;
      const m = val.match(/^(\d{2})[./](\d{2})[./](\d{4})(?:\s+.*)?$/);
      if (m) {
        const iso = `${m[3]}-${m[2]}-${m[1]}`;
        const d2 = new Date(iso);
        return Number.isNaN(d2.getTime()) ? null : iso;
      }
      const d = new Date(val);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };

    const rows: Row[] = [];
    if (isCsv) {
      const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
      console.log("[product-types import] raw csv", text);
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
      // beklenen: tip;country;tse;analiz;tareks;rapor;valid_from;valid_to
      for (let idx = 0; idx < lines.length; idx++) {
        if (idx === 0) continue; // header
        const line = lines[idx];
        const parts = line.includes(";")
          ? line.split(";")
          : line.includes("\t")
          ? line.split("\t")
          : line.split(",");
        const [tipRaw, countryRaw, tseRaw, analizRaw, tareksRaw, raporRaw, vfRaw, vtRaw] =
          parts;
        const tip = String(tipRaw ?? "").trim();
        if (!tip) continue;
        const stripQuotes = (v: any) =>
          String(v ?? "")
            .trim()
            .replace(/^"+|"+$/g, "")
            .replace(/^'+|'+$/g, "");
        const country = stripQuotes(countryRaw) || null;
        const tse = stripQuotes(tseRaw) || null;
        const analiz = parseDate(stripQuotes(analizRaw));
        const tareks = stripQuotes(tareksRaw) || null;
        const rapor = stripQuotes(raporRaw) || null;
        const valid_from = parseDate(stripQuotes(vfRaw));
        const valid_to = parseDate(stripQuotes(vtRaw));
        rows.push({ tip, country, tse, analiz, tareks, rapor, valid_from, valid_to });
        debugRows.push({
          row: idx + 1,
          raw: parts,
          partsCount: parts.length,
          tip,
          country,
          tse,
          analiz,
          tareks,
          rapor,
          valid_from,
          valid_to,
        });
      }
    } else {
      const wb = new ExcelJS.Workbook();
      const input = Buffer.from(buffer);
      await wb.xlsx.load(input as any);
      const ws = wb.worksheets[0];
      if (!ws) return NextResponse.json({ error: "Bos sheet" }, { status: 400 });

      ws.eachRow((row, idx) => {
        if (idx === 1) return; // header
        const tip = String(row.getCell(1).text ?? row.getCell(1).value ?? "").trim();
        if (!tip) return;
        const country = String(row.getCell(2).text ?? row.getCell(2).value ?? "").trim() || null;
        const tse = String(row.getCell(3).text ?? row.getCell(3).value ?? "").trim() || null;
        const analiz = parseDate(row.getCell(4).value);
        const tareks = String(row.getCell(5).text ?? row.getCell(5).value ?? "").trim() || null;
        const rapor = String(row.getCell(6).text ?? row.getCell(6).value ?? "").trim() || null;
        const valid_from = parseDate(row.getCell(7).value);
        const valid_to = parseDate(row.getCell(8).value);
        rows.push({ tip, country, tse, analiz, tareks, rapor, valid_from, valid_to });

        debugRows.push({
          row: idx,
          tip,
          country,
          tse,
          analiz,
          tareks,
          rapor,
          valid_from,
          valid_to,
        });
      });
    }

    if (!rows.length) return NextResponse.json({ error: "Veri yok" }, { status: 400 });
    // debug
    console.log("[product-types import] raw rows", debugRows);
    console.log("[product-types import] incoming rows", rows.length);

    const supabase = await createSupabaseServerClient();
    const tipIdMap = new Map<string, string>();

    // Tipleri upsert et
    for (const r of rows) {
      const name = r.tip.trim();
      if (!name) continue;
      const { data, error } = await supabase
        .from("product_types")
        .upsert({ name }, { onConflict: "name" })
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("tip upsert error", { r, error });
        continue;
      }
      if (data?.id) tipIdMap.set(name.toLowerCase(), data.id);
    }
    console.log("[product-types import] upserted tip count", tipIdMap.size);

    // Sadece importtaki tiplere ait eski uyumluluk kayitlarini sil
    const tipIds = Array.from(tipIdMap.values());
    if (tipIds.length) {
      await supabase.from("product_type_compliance").delete().in("product_type_id", tipIds);
    }

    // Uyumluluk ekle
    for (const r of rows) {
      const typeId = tipIdMap.get(r.tip.toLowerCase());
      if (!typeId) continue;
      const payload = {
        product_type_id: typeId,
        country: r.country,
        tse_status: r.tse,
        analiz_gecerlilik: r.analiz,
        tareks_no: r.tareks,
        rapor_no: r.rapor,
        valid_from: r.valid_from,
        valid_to: r.valid_to,
      };
      const { error } = await supabase.from("product_type_compliance").insert(payload);
      if (error) console.error("compliance insert error", { payload, error });
    }

    console.log("[product-types import] compliance inserted", rows.length);

    return NextResponse.json({ ok: true, imported: rows.length });
  } catch (err) {
    console.error("product-types import error", err);
    return NextResponse.json({ error: "Beklenmeyen hata", detail: String(err) }, { status: 500 });
  }
}

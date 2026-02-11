import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type IncomingRow = {
  code?: string;
  urun_kodu?: string;
  netsis?: string;
  netsis_stok?: string;
  netsis_stok_kodu?: string;
};

export async function POST(req: NextRequest) {
  const { rows } = await req.json();
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: "rows bos" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Kod -> netsis map (trim'li, yinelenenlerde son deÄŸer kazanÄ±r)
  const codeToNetsis = new Map<string, string>();
  for (const r of rows as IncomingRow[]) {
    const code = (r.code ?? r.urun_kodu ?? "").trim();
    const netsis = (r.netsis ?? r.netsis_stok ?? r.netsis_stok_kodu ?? "").trim();
    if (!code || !netsis) continue;
    codeToNetsis.set(code, netsis);
  }

  const codes = Array.from(codeToNetsis.keys());
  if (!codes.length) {
    return NextResponse.json({ error: "Kod veya netsis yok" }, { status: 400 });
  }

  const chunk = <T,>(arr: T[], size = 200) => {
    const res: T[][] = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
  };

  let missing = 0;
  const updates: { id: string; code: string; name: string; netsis_stok_kodu: string }[] = [];

  for (const part of chunk(codes, 200)) {
    const { data: prods, error } = await supabase
      .from("products")
      .select("id, code, name")
      .in("code", part);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const found = new Set<string>();
    (prods ?? []).forEach((p) => {
      const prodCode = p.code ? String(p.code).trim() : "";
      if (!prodCode) return;
      const netsis = codeToNetsis.get(prodCode);
      if (!netsis) return;
      updates.push({ id: p.id, code: prodCode, name: p.name ?? prodCode, netsis_stok_kodu: netsis });
      found.add(prodCode);
    });
    part.forEach((c) => {
      if (!found.has(c)) missing += 1;
    });
  }

  if (updates.length) {
    const { error: updErr } = await supabase
      .from("products")
      .upsert(updates, { onConflict: "id" });
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, updated: updates.length, missing });
}


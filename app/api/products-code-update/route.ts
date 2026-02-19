import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CodeRow = {
  old_code?: string;
  new_code?: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? (body.rows as CodeRow[]) : [];
  if (!rows.length) {
    return NextResponse.json({ error: "rows bos" }, { status: 400 });
  }

  const parsed = rows
    .map((row, idx) => ({
      idx,
      oldCode: clean(row.old_code),
      newCode: clean(row.new_code),
    }))
    .filter((row) => row.oldCode && row.newCode);

  if (!parsed.length) {
    return NextResponse.json({ error: "Gecerli satir yok" }, { status: 400 });
  }

  const oldCodes = Array.from(new Set(parsed.map((r) => r.oldCode)));
  const allNewCodes = parsed.map((r) => r.newCode);
  const newCodes = Array.from(new Set(allNewCodes));

  const duplicateNewCodes = allNewCodes.filter(
    (code, index) => allNewCodes.indexOf(code) !== index
  );
  if (duplicateNewCodes.length) {
    return NextResponse.json(
      { error: `Yeni kod tekrarli: ${Array.from(new Set(duplicateNewCodes)).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();

  const { data: sourceProducts, error: sourceErr } = await supabase
    .from("products")
    .select("id, code")
    .in("code", oldCodes);
  if (sourceErr) {
    return NextResponse.json({ error: sourceErr.message }, { status: 500 });
  }

  const sourceByCode = new Map(
    (sourceProducts ?? []).map((p) => [String(p.code ?? ""), String(p.id)])
  );

  const notFound = parsed
    .filter((row) => !sourceByCode.has(row.oldCode))
    .map((row) => row.oldCode);

  const updateCandidates = parsed
    .map((row) => {
      const id = sourceByCode.get(row.oldCode);
      if (!id) return null;
      return { id, oldCode: row.oldCode, newCode: row.newCode };
    })
    .filter(Boolean) as { id: string; oldCode: string; newCode: string }[];

  const effectiveUpdates = updateCandidates.filter((row) => row.oldCode !== row.newCode);

  if (!effectiveUpdates.length) {
    return NextResponse.json({ ok: true, updated: 0, not_found: Array.from(new Set(notFound)) });
  }

  const updateIds = effectiveUpdates.map((r) => r.id);
  const targetCodes = Array.from(new Set(effectiveUpdates.map((r) => r.newCode)));
  const { data: targetProducts, error: targetErr } = await supabase
    .from("products")
    .select("id, code")
    .in("code", targetCodes);
  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }

  const blockedCodes = (targetProducts ?? [])
    .filter((row) => !updateIds.includes(String(row.id)))
    .map((row) => String(row.code ?? ""))
    .filter(Boolean);

  if (blockedCodes.length) {
    return NextResponse.json(
      {
        error: `Yeni kod zaten baska urunde var: ${Array.from(new Set(blockedCodes)).join(", ")}`,
      },
      { status: 400 }
    );
  }

  const updateById = new Map<string, { id: string; code: string }>();
  effectiveUpdates.forEach((row) => {
    updateById.set(row.id, { id: row.id, code: row.newCode });
  });
  const updates = Array.from(updateById.values());

  let updated = 0;
  const failed: { id: string; code: string; error: string }[] = [];
  for (const row of updates) {
    const { error: updateErr } = await supabase
      .from("products")
      .update({ code: row.code })
      .eq("id", row.id);
    if (updateErr) {
      failed.push({ id: row.id, code: row.code, error: updateErr.message });
    } else {
      updated += 1;
    }
  }

  if (failed.length) {
    return NextResponse.json(
      {
        error: `Guncelleme hatasi: ${failed[0].error}`,
        updated,
        failed_count: failed.length,
        failed: failed.slice(0, 20),
        not_found: Array.from(new Set(notFound)),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    updated,
    not_found: Array.from(new Set(notFound)),
  });
}

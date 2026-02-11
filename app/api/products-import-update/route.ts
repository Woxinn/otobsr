import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type IncomingRow = {
  urun_kodu?: string;
  code?: string;
  ad?: string;
  name?: string;
  birim_fiyat?: string | number;
  price?: string | number;
  netsis?: string;
  netsis_kodu?: string;
  netsis_stok_kodu?: string;
  netsis_stok?: string;
  agirlik?: string | number;
  tip?: string;
  gtip?: string;
};

const chunk = <T,>(arr: T[], size = 200) => {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
};

const parseNumber = (v: any) => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export async function POST(req: NextRequest) {
  const { rows, groupId } = await req.json();
  if (!Array.isArray(rows) || !rows.length) {
    return NextResponse.json({ error: 'rows bos' }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const normalizeKey = (value: string) => value;
  const cleanRaw = (value: string) =>
    value
      .replace(/\uFEFF/g, "")
      .replace(/\u200B/g, "")
      .replace(/\u00A0/g, " ")
      .trim();

  const normalizedRows = rows.map((r: IncomingRow, idx: number) => {
    const codeRaw = cleanRaw(String(r.urun_kodu ?? r.code ?? ""));
    const nameRaw = cleanRaw(String(r.ad ?? r.name ?? ""));
    return {
      idx,
      row: r,
      codeKey: codeRaw ? normalizeKey(codeRaw) : '',
      nameKey: nameRaw ? normalizeKey(nameRaw) : '',
    };
  });

  const rowByCode = new Map<string, { idx: number; row: IncomingRow; raw: string }>();
  const rowByName = new Map<string, { idx: number; row: IncomingRow; raw: string }>();

  normalizedRows.forEach((item) => {
    if (item.codeKey && !rowByCode.has(item.codeKey)) {
      rowByCode.set(item.codeKey, { idx: item.idx, row: item.row, raw: cleanRaw(String(item.row.urun_kodu ?? item.row.code ?? "")) });
    }
    if (item.nameKey && !rowByName.has(item.nameKey)) {
      rowByName.set(item.nameKey, { idx: item.idx, row: item.row, raw: cleanRaw(String(item.row.ad ?? item.row.name ?? "")) });
    }
    if (item.codeKey && !rowByName.has(item.codeKey)) {
      rowByName.set(item.codeKey, { idx: item.idx, row: item.row, raw: cleanRaw(String(item.row.urun_kodu ?? item.row.code ?? "")) });
    }
  });

  const codes = Array.from(new Set(Array.from(rowByCode.values()).map((v) => v.raw))).filter(Boolean);
  const names = Array.from(new Set(Array.from(rowByName.values()).map((v) => v.raw))).filter(Boolean);
  if (!codes.length && !names.length) {
    return NextResponse.json({ error: 'Kod veya ad yok' }, { status: 400 });
  }

  console.log("[products-import-update] rows:", rows.length);
  console.log("[products-import-update] code keys:", codes.length, "name keys:", names.length);

  const matchedRowIndexes = new Set<number>();
  let missing = 0;
  const updates: {
    id: string;
    code: string;
    name?: string;
    unit_price?: number;
    netsis_stok_kodu?: string;
    gtip_id?: string | null;
  }[] = [];
  const attrUpserts: { product_id: string; name: string; value_text: string }[] = [];
  const tipAttrUpdates: {
    id: string;
    product_id: string;
    attribute_id: string;
    value_text: string;
    value_number?: number | null;
  }[] = [];

  // GTIP kodlarını topla ve id eşleşmesini hazırla
  const gtipCodes = Array.from(
    new Set(
      rows
        .map((r: IncomingRow) => (r.gtip as string | undefined)?.trim?.() ?? "")
        .filter((c) => c.length)
    )
  );
  const gtipIdByCode = new Map<string, string>();
  if (gtipCodes.length) {
    const { data: gtipRows, error: gtipErr } = await supabase
      .from("gtips")
      .select("id, code")
      .in("code", gtipCodes);
    if (gtipErr) return NextResponse.json({ error: gtipErr.message }, { status: 500 });
    (gtipRows ?? []).forEach((g) => {
      if (g.code && g.id) gtipIdByCode.set(String(g.code), String(g.id));
    });
  }

  const applyRowToProduct = (
    p: any,
    row: IncomingRow,
    tipAttrByProduct: Map<string, { pavId: string; attrId: string }>
  ) => {
    const upd: any = { id: p.id, code: p.code ?? "" };
    const netsis = (row.netsis ?? row.netsis_kodu ?? row.netsis_stok_kodu ?? row.netsis_stok ?? "").trim();
    if (netsis) upd.netsis_stok_kodu = netsis;
    const name = (row.ad ?? row.name)?.trim();
    const finalName = name || p.name || p.code;
    upd.name = finalName;
    const price = parseNumber(row.birim_fiyat ?? row.price);
    if (price !== null) upd.unit_price = price;

    const gtipCode = (row as any).gtip ? String((row as any).gtip).trim() : "";
    if (gtipCode && gtipIdByCode.has(gtipCode)) {
      upd.gtip_id = gtipIdByCode.get(gtipCode)!;
    }
    updates.push(upd);

    const weight = parseNumber(row.agirlik);
    if (weight !== null) {
      attrUpserts.push({ product_id: p.id, name: "ağırlık", value_text: String(weight) });
    }
    const tip = (row.tip ?? "").trim();
    if (tip) {
      const tipAttr = tipAttrByProduct.get(p.id);
      if (tipAttr) {
        tipAttrUpdates.push({
          id: tipAttr.pavId,
          product_id: p.id,
          attribute_id: tipAttr.attrId,
          value_text: tip,
          value_number: null,
        });
      }
    }
  };

  for (const part of chunk(codes, 200)) {
    const { data: prods, error } = await supabase
      .from('products')
      .select('id, code, name, group_id')
      .in('code', part);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const prodIds = (prods ?? []).map((p) => p.id).filter(Boolean);
    // Mevcut tip attribute'lerini çek (varsa güncelle, yoksa atla)
    const { data: tipAttrs } = prodIds.length
      ? await supabase
          .from('product_attribute_values')
          .select('id, product_id, attribute_id, attribute:product_attributes(name,id)')
          .in('product_id', prodIds)
      : { data: [] as any[] };
    const tipAttrByProduct = new Map<string, { pavId: string; attrId: string }>();
    (tipAttrs ?? []).forEach((row: any) => {
      const attrName = row.attribute?.name?.toLowerCase?.() ?? '';
      if (attrName.includes('tip')) {
        if (!tipAttrByProduct.has(row.product_id)) {
          const attrId = row.attribute_id ?? row.attribute?.id;
          if (attrId) {
            tipAttrByProduct.set(row.product_id, { pavId: row.id as string, attrId });
          }
        }
      }
    });

    (prods ?? []).forEach((p) => {
      const prodCode = p.code ? String(p.code).trim() : '';
      const prodName = p.name ? String(p.name).trim() : '';
      const codeKey = prodCode ? normalizeKey(prodCode) : '';
      const nameKey = prodName ? normalizeKey(prodName) : '';
      const matchByCode = codeKey ? rowByCode.get(codeKey) : undefined;
      const matchByName = nameKey ? rowByName.get(nameKey) : undefined;
      const rowEntry = matchByCode ?? matchByName;
      const row = rowEntry?.row;
      if (!row) return;
      if (groupId && p.group_id !== groupId) return;

      applyRowToProduct(p, row, tipAttrByProduct);
      if (rowEntry) matchedRowIndexes.add(rowEntry.idx);
    });
  }

  if (names.length) {
    for (const part of chunk(names, 200)) {
      const { data: prodsByName, error: nameErr } = await supabase
        .from('products')
        .select('id, code, name, group_id')
        .in('name', part);
      if (nameErr) return NextResponse.json({ error: nameErr.message }, { status: 500 });

      const prodIds = (prodsByName ?? []).map((p) => p.id).filter(Boolean);
      const { data: tipAttrs } = prodIds.length
        ? await supabase
            .from('product_attribute_values')
            .select('id, product_id, attribute_id, attribute:product_attributes(name,id)')
            .in('product_id', prodIds)
        : { data: [] as any[] };
      const tipAttrByProduct = new Map<string, { pavId: string; attrId: string }>();
      (tipAttrs ?? []).forEach((row: any) => {
        const attrName = row.attribute?.name?.toLowerCase?.() ?? '';
        if (attrName.includes('tip')) {
          if (!tipAttrByProduct.has(row.product_id)) {
            const attrId = row.attribute_id ?? row.attribute?.id;
            if (attrId) {
              tipAttrByProduct.set(row.product_id, { pavId: row.id as string, attrId });
            }
          }
        }
      });

      (prodsByName ?? []).forEach((p) => {
        const prodName = p.name ? String(p.name).trim() : '';
        const nameKey = prodName ? normalizeKey(prodName) : '';
        const rowEntry = nameKey ? rowByName.get(nameKey) : undefined;
        const row = rowEntry?.row;
        if (!row) return;
        if (groupId && p.group_id !== groupId) return;

        applyRowToProduct(p, row, tipAttrByProduct);

        if (rowEntry) matchedRowIndexes.add(rowEntry.idx);
      });
    }
  }

  normalizedRows.forEach((item) => {
    if (!matchedRowIndexes.has(item.idx)) missing += 1;
  });

  if (missing) {
    const missingSamples = normalizedRows
      .filter((item) => !matchedRowIndexes.has(item.idx))
      .slice(0, 10)
      .map((item) => ({
        idx: item.idx,
        code: item.row.urun_kodu ?? item.row.code ?? null,
        name: item.row.ad ?? item.row.name ?? null,
        codeKey: item.codeKey,
        nameKey: item.nameKey,
      }));
    console.warn("[products-import-update] missing rows:", missingSamples);
  }

  if (updates.length) {
    const byId = new Map<string, any>();
    updates.forEach((u) => {
      if (!u?.id) return;
      byId.set(u.id, { ...(byId.get(u.id) ?? {}), ...u });
    });
    const deduped = Array.from(byId.values());
    const { error: updErr } = await supabase.from('products').upsert(deduped, { onConflict: 'id' });
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  if (attrUpserts.length) {
    const byKey = new Map<string, any>();
    attrUpserts.forEach((u) => {
      const key = `${u.product_id}::${u.name}`;
      byKey.set(key, u);
    });
    const deduped = Array.from(byKey.values());
    const { error: attrErr } = await supabase.from('product_extra_attributes').upsert(deduped);
    if (attrErr) return NextResponse.json({ error: attrErr.message }, { status: 500 });
  }

  if (tipAttrUpdates.length) {
    const byId = new Map<string, any>();
    tipAttrUpdates.forEach((u) => {
      if (!u?.id) return;
      byId.set(u.id, u);
    });
    const deduped = Array.from(byId.values());
    const { error: tipErr } = await supabase
      .from('product_attribute_values')
      .upsert(deduped, { onConflict: 'id' });
    if (tipErr) return NextResponse.json({ error: tipErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updates.length, missing });
}


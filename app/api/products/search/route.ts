import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "rfqs")) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
  const gtip = searchParams.get("gtip") ?? "";
  const supplier = searchParams.get("supplier") ?? "";
  const codesParam = (searchParams.get("codes") ?? "").trim();
  const codes = codesParam
    ? codesParam
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  // Exact code search path (only products.code)
  if (codes.length) {
    const normalized = Array.from(new Set(codes.map((c) => c.trim()).filter(Boolean)));
    if (!normalized.length) return NextResponse.json({ items: [], count: 0 });

    // build OR eq clauses for exact match (case-sensitive), Supabase lacks lower() in IN
    const orClause = normalized.map((c) => `code.eq.${c}`).join(",");
    let query = supabase
      .from("products")
      .select("id, code, name, gtip_id", { count: "exact", head: false })
      .or(orClause);

    // apply gtip filter if requested
    if (gtip) {
      query = gtip === "none" ? query.is("gtip_id", null) : query.eq("gtip_id", gtip);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ items: data ?? [], count: count ?? data?.length ?? 0 });
  }

  // Fuzzy search path
  let query = supabase
    .from("products")
    .select("id, code, name", { count: "exact", head: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q.length >= 2) {
    const tokens = q.replace(/,/g, " ").split(/\s+/).map((token) => token.trim()).filter(Boolean);
    if (tokens.length === 1) {
      const term = tokens[0];
      query = query.or(
        `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
      );
    } else {
      tokens.forEach((term) => {
        query = query.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      });
    }
  }

  if (gtip) {
    if (gtip === "none") {
      query = query.is("gtip_id", null);
    } else {
      query = query.eq("gtip_id", gtip);
    }
  }

  if (supplier) {
    query = query.eq("supplier_product_aliases.supplier_id", supplier);
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [], count: count ?? 0 });
}

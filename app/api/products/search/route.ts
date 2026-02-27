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

  let query = supabase
    .from("products")
    .select("id, code, name", { count: "exact", head: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (q.length >= 2) {
    const tokens = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (tokens.length) {
      const ors = tokens
        .map((token) => ["code", "name", "brand", "description", "notes"].map((col) => `${col}.ilike.%${token}%`).join(","))
        .join(",");
      query = query.or(ors);
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
    query = query.eq("supplier_product_aliases.supplier_id", supplier).select(
      "id, code, name, supplier_product_aliases!inner(supplier_id)",
      { count: "exact", head: false }
    );
  }

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ items: data ?? [], count: count ?? 0 });
}

import { NextRequest, NextResponse } from "next/server";
import { fetchLiveStockMap } from "@/lib/live-mssql";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";

export async function GET(req: NextRequest) {
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "products")) {
    return NextResponse.json({ error: "Yetki yok" }, { status: 403 });
  }

  const code = String(req.nextUrl.searchParams.get("code") ?? "").trim();
  if (!code) {
    return NextResponse.json({ error: "code gerekli" }, { status: 400 });
  }

  try {
    const stockMap = await fetchLiveStockMap([code], "exact");
    return NextResponse.json({ ok: true, code, value: Number(stockMap.get(code) ?? 0) });
  } catch {
    return NextResponse.json({ ok: false, code, value: null, error: "Canli stok alinamadi" }, { status: 200 });
  }
}


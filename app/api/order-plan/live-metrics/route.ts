import { NextResponse } from "next/server";
import { fetchLiveSalesAgg, fetchLiveStockMap } from "@/lib/live-mssql";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { codes?: string[] };
    const codes = Array.from(
      new Set(
        (Array.isArray(body.codes) ? body.codes : [])
          .map((code) => String(code ?? "").trim())
          .filter(Boolean)
      )
    ).slice(0, 2000);

    if (!codes.length) {
      return NextResponse.json({ ok: true, metrics: {} });
    }

    const [stockMap, salesMap] = await Promise.all([
      fetchLiveStockMap(codes, "prefix"),
      fetchLiveSalesAgg(codes),
    ]);

    const metrics = Object.fromEntries(
      codes.map((code) => {
        const sales = salesMap.get(code);
        return [
          code,
          {
            stock: Number(stockMap.get(code) ?? 0),
            sales120: Number(sales?.sales120 ?? 0),
            sales60: Number(sales?.sales60 ?? 0),
            salesPrev60: Number(sales?.salesPrev60 ?? 0),
            sales10y: Number(sales?.sales10y ?? 0),
          },
        ];
      })
    );

    return NextResponse.json({ ok: true, metrics });
  } catch (error) {
    console.error("[order-plan-live-metrics] failed", error);
    return NextResponse.json({ ok: false, metrics: {} }, { status: 200 });
  }
}


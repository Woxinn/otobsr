import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  const start = searchParams.get("start") ?? "2000-01-01";
  const end = searchParams.get("end") ?? "2100-01-01";

  if (!productId) return NextResponse.json({ error: "productId gerekli" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, netsis_stok_kodu")
    .eq("id", productId)
    .maybeSingle();

  if (!product?.netsis_stok_kodu) {
    return NextResponse.json({ error: "netsis_stok_kodu yok" }, { status: 400 });
  }

  const {
    MSSQL_SERVER,
    MSSQL_PORT,
    MSSQL_DB,
    MSSQL_USER,
    MSSQL_PASS,
    MSSQL_TRUST_CERT,
    MSSQL_ENCRYPT,
  } = process.env;

  if (!MSSQL_SERVER || !MSSQL_DB || !MSSQL_USER || !MSSQL_PASS) {
    return NextResponse.json({ error: "MSSQL env eksik" }, { status: 500 });
  }

  try {
    const pool = await sql.connect({
      server: MSSQL_SERVER,
      port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
      database: MSSQL_DB,
      user: MSSQL_USER,
      password: MSSQL_PASS,
      options: {
        encrypt: MSSQL_ENCRYPT !== "false",
        trustServerCertificate: MSSQL_TRUST_CERT === "true",
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
        enableArithAbort: true,
      },
    });

    const result = await pool
      .request()
      .input("stok", sql.VarChar, product.netsis_stok_kodu)
      .input("start", sql.Date, start)
      .input("end", sql.Date, end)
      .query(`
        SELECT SUM(CASE WHEN Har.STHAR_GCKOD='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
        FROM TBLSTHAR Har
        WHERE Har.STOK_KODU = @stok AND Har.STHAR_TARIH BETWEEN @start AND @end
      `);

    await pool.close();
    const net = result.recordset?.[0]?.NetMiktar ?? 0;
    return NextResponse.json({ ok: true, net });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}

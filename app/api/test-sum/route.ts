import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";

// Test route: runs a SUM over TBLSTHAR with optional query params
// Params: stok=22SBC%20%2200 (or any LIKE pattern), start=2026-01-01, end=2026-12-31
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stok = searchParams.get("stok") ?? "22SBC 2200%";
  const start = searchParams.get("start") ?? "2026-01-01";
  const end = searchParams.get("end") ?? "2026-12-31";

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
    return NextResponse.json({ error: "Missing MSSQL env vars" }, { status: 500 });
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
        cryptoCredentialsDetails: {
          minVersion: "TLSv1",
          maxVersion: "TLSv1.2",
        },
        enableArithAbort: true,
      },
    });

    const result = await pool
      .request()
      .input("stok", sql.VarChar, stok)
      .input("start", sql.Date, start)
      .input("end", sql.Date, end)
      .query(`
        SELECT SUM(CASE WHEN Har.STHAR_GCKOD = 'G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
        FROM TBLSTHAR Har
        WHERE Har.STOK_KODU LIKE @stok AND Har.STHAR_TARIH BETWEEN @start AND @end
      `);

    await pool.close();
    return NextResponse.json({ ok: true, stok, start, end, net: result.recordset?.[0]?.NetMiktar ?? null });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}

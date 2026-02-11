import { NextResponse } from "next/server";
import sql from "mssql";

export async function GET() {
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
    return NextResponse.json(
      { error: "Missing MSSQL env vars" },
      { status: 500 }
    );
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

    const result = await pool.request().query("SELECT TOP 5 name FROM sys.tables");
    await pool.close();

    return NextResponse.json({ ok: true, tables: result.recordset });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? String(error) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import sql from "mssql";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const connectMssql = async (databaseName?: string) => {
  const {
    MSSQL_SERVER,
    MSSQL_PORT,
    MSSQL_DB,
    MSSQL_USER,
    MSSQL_PASS,
    MSSQL_TRUST_CERT,
    MSSQL_ENCRYPT,
  } = process.env;
  if (!MSSQL_SERVER || !MSSQL_DB || !MSSQL_USER || !MSSQL_PASS) return null;
  try {
    const pool = new sql.ConnectionPool({
      server: MSSQL_SERVER,
      port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
      database: databaseName ?? MSSQL_DB,
      user: MSSQL_USER,
      password: MSSQL_PASS,
      options: {
        encrypt: MSSQL_ENCRYPT !== "false",
        trustServerCertificate: MSSQL_TRUST_CERT === "true",
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
        enableArithAbort: true,
      },
    });
    pool.setMaxListeners(0);
    await pool.connect();
    return pool;
  } catch {
    return null;
  }
};

const salesDbs = () => {
  const envList = (process.env.MSSQL_DB_SALES_LIST ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const base = process.env.MSSQL_DB ? [process.env.MSSQL_DB] : [];
  const fallbackList = [
    "SEL2026",
    "SEL2025",
    "SEL2024",
    "SEL2023",
    "SEL2022",
    "SEL2021",
    "SEL2020",
    "SEL2019",
    "SEL2018",
    "SEL2017",
    "SEL2016",
  ];
  return Array.from(new Set([...envList, ...base, ...fallbackList]));
};

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  if (role === "Satis") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetProductId = body?.product_id as string | undefined;

  const { data: products } = await supabase
    .from("products")
    .select("id, netsis_stok_kodu")
    .not("netsis_stok_kodu", "is", null)
    .match(targetProductId ? { id: targetProductId } : {});

  const codeToProduct = new Map<string, string>();
  (products ?? []).forEach((p) => {
    if (p.netsis_stok_kodu) {
      codeToProduct.set(String(p.netsis_stok_kodu).trim().toUpperCase(), p.id);
    }
  });

  const codes = Array.from(
    new Set(
      (products ?? [])
        .map((p) => (p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : null))
        .filter(Boolean) as string[]
    )
  );
  if (!codes.length) {
    return NextResponse.json({ error: "no codes" }, { status: 400 });
  }

  const start10y = new Date();
  start10y.setHours(0, 0, 0, 0);
  start10y.setDate(start10y.getDate() - 3650);

  const dbs = salesDbs();
  const totals = new Map<string, number>();
  const dbDebug: { db: string; code: string; total: number; fisnos: string | null }[] = [];

  for (const dbName of dbs) {
    const pool = await connectMssql(dbName);
    if (!pool) continue;
    try {
      for (const code of codes) {
        const key = code.trim();
        const keyUpper = key.toUpperCase();
        const keyProductId = codeToProduct.get(keyUpper);
        const wordPattern = new RegExp(
          `(^|[\\s-])${escapeRegex(keyUpper)}([\\s-]|$)`,
          "i"
        );
        try {
          const codeLike = `%${key}%`;
          const result = await pool
            .request()
            .input("codeLike", sql.VarChar, codeLike)
            .query(
              `SELECT
                 LTRIM(RTRIM(t.STOK_KODU)) AS stok_kodu,
                 SUM(CASE WHEN UPPER(t.STHAR_GCKOD)='C' THEN ISNULL(t.STHAR_GCMIK,0) ELSE 0 END) AS total_sales,
                 STUFF((
                    SELECT ',' + CAST(t2.FISNO AS nvarchar(100))
                    FROM TBLSTHAR t2
                    WHERE UPPER(LTRIM(RTRIM(t2.STOK_KODU))) LIKE UPPER(@codeLike)
                      AND UPPER(t2.STHAR_GCKOD)='C'
                  FOR XML PATH(''), TYPE).value('.','NVARCHAR(MAX)'),1,1,'') AS fisnos
               FROM TBLSTHAR t
               WHERE UPPER(LTRIM(RTRIM(t.STOK_KODU))) LIKE UPPER(@codeLike)
               GROUP BY LTRIM(RTRIM(t.STOK_KODU))`
            );
          for (const row of result.recordset ?? []) {
            const stokKoduRaw = String(row.stok_kodu ?? "").trim();
            const stokKoduUpper = stokKoduRaw.toUpperCase();
            // Eğer MSSQL stok kodu Supabase'te başka bir ürüne aitse ve bu ürün hedef kod değilse, atla
            const mappedProductId = codeToProduct.get(stokKoduUpper);
            if (mappedProductId && mappedProductId !== keyProductId) continue;
            if (!wordPattern.test(stokKoduUpper)) continue;
            const prev = totals.get(key) ?? 0;
            const current = Number(row.total_sales ?? 0);
            totals.set(key, prev + current);
            dbDebug.push({
              db: dbName,
              code: key,
              total: current,
              fisnos: (row as { fisnos?: string }).fisnos ?? null,
            });
          }
        } catch (err) {
          console.error("[sales-10y-sync] code fail", dbName, key, err);
        }
      }
    } catch (err) {
      console.error("[sales-10y-sync] db fail", dbName, err);
    } finally {
      await pool.close();
    }
  }

  // Prepare upsert rows
  const rows = (products ?? []).map((p) => {
    const code = p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : "";
    const total = totals.get(code) ?? 0;
    return { product_id: p.id, total_10y: total };
  });

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("product_sales_10y_totals")
      .upsert(chunk, { onConflict: "product_id" });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Terminal log için
  console.log("[sales-10y-sync] debug", dbDebug);

  return NextResponse.json(dbDebug);
}

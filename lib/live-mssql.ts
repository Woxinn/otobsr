import sql from "mssql";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type StockMatchMode = "prefix" | "exact";

export type SalesAgg = {
  sales120: number;
  sales60: number;
  salesPrev60: number;
  sales10y: number;
};

export type Sales10yDebugRow = {
  db: string;
  code: string;
  total: number;
  fisnos: string | null;
};

const BRIDGE_TIMEOUT_MS = Math.max(5000, Number(process.env.MSSQL_BRIDGE_TIMEOUT_MS ?? "30000"));
const BRIDGE_POLL_MS = Math.max(250, Number(process.env.MSSQL_BRIDGE_POLL_MS ?? "500"));
const STOCK_CACHE_TTL_MS = Math.max(0, Number(process.env.MSSQL_STOCK_CACHE_TTL_MS ?? "15000"));

const stockCache = new Map<string, { expiresAt: number; result: Map<string, number> }>();
type DirectPool = InstanceType<typeof sql.ConnectionPool>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const trimDistinctCodes = (codes: string[]) => Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));

const cloneStockMap = (source: Map<string, number>) =>
  new Map(Array.from(source.entries()).map(([key, value]) => [key, Number(value ?? 0)]));

const getStockCacheKey = (codes: string[], matchMode: StockMatchMode) =>
  `${matchMode}:${codes.slice().sort((a, b) => a.localeCompare(b)).join("|")}`;

const readStockCache = (codes: string[], matchMode: StockMatchMode) => {
  if (!STOCK_CACHE_TTL_MS) return null;
  const entry = stockCache.get(getStockCacheKey(codes, matchMode));
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    stockCache.delete(getStockCacheKey(codes, matchMode));
    return null;
  }
  return cloneStockMap(entry.result);
};

const writeStockCache = (codes: string[], matchMode: StockMatchMode, result: Map<string, number>) => {
  if (!STOCK_CACHE_TTL_MS) return;
  stockCache.set(getStockCacheKey(codes, matchMode), {
    expiresAt: Date.now() + STOCK_CACHE_TTL_MS,
    result: cloneStockMap(result),
  });
};

async function fetchDirectStockMapChunk(
  pool: DirectPool,
  codes: string[],
  matchMode: StockMatchMode
) {
  const request = pool.request();
  const normalizedCodes = codes.map((code) => code.trim()).filter(Boolean);
  if (!normalizedCodes.length) return new Map<string, number>();

  const params = normalizedCodes.map((code, index) => {
    const param = `stok${index}`;
    request.input(param, sql.VarChar, matchMode === "exact" ? code : `${code}%`);
    return { code, param };
  });

  const whereClause = params
    .map(({ param }) =>
      matchMode === "exact"
        ? `LTRIM(RTRIM(Har.STOK_KODU)) = @${param}`
        : `LTRIM(RTRIM(Har.STOK_KODU)) LIKE @${param}`
    )
    .join(" OR ");

  const selectClause = params
    .map(
      ({ param }, index) => `SUM(CASE WHEN ${
        matchMode === "exact"
          ? `LTRIM(RTRIM(Har.STOK_KODU)) = @${param}`
          : `LTRIM(RTRIM(Har.STOK_KODU)) LIKE @${param}`
      } THEN CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END ELSE 0 END) AS s${index}`
    )
    .join(",\n            ");

  const result = await request.query(`
    SELECT
      ${selectClause}
    FROM TBLSTHAR Har
    WHERE ${whereClause}
  `);

  const row = result.recordset?.[0] ?? {};
  return new Map(params.map(({ code }, index) => [code, Number((row as any)[`s${index}`] ?? 0)]));
}

const canUseDirectMssql = () => {
  const { MSSQL_SERVER, MSSQL_DB, MSSQL_USER, MSSQL_PASS } = process.env;
  return Boolean(MSSQL_SERVER && MSSQL_DB && MSSQL_USER && MSSQL_PASS);
};

const getBridgeMode = () => (process.env.MSSQL_BRIDGE_MODE ?? "direct").trim().toLowerCase();

const getDirectConfig = (databaseName?: string) => {
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
  return {
    server: MSSQL_SERVER,
    port: MSSQL_PORT ? Number(MSSQL_PORT) : 1433,
    database: databaseName ?? MSSQL_DB,
    user: MSSQL_USER,
    password: MSSQL_PASS,
    options: {
      encrypt: MSSQL_ENCRYPT !== "false",
      trustServerCertificate: MSSQL_TRUST_CERT === "true",
      cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" } as const,
      enableArithAbort: true,
    },
  };
};

const connectDirectMssql = async (databaseName?: string) => {
  const config = getDirectConfig(databaseName);
  if (!config) return null;
  const pool = new sql.ConnectionPool(config);
  pool.setMaxListeners(0);
  await pool.connect();
  return pool;
};

const getSalesDbs = () => {
  const raw = process.env.MSSQL_DB_SALES_LIST ?? "";
  const listed = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const base = process.env.MSSQL_DB ? [process.env.MSSQL_DB] : [];
  return Array.from(new Set([...listed, ...base]));
};

async function runBridgeRequest<T>(requestType: string, payload: Record<string, unknown>, requestedBy: string) {
  const supabase = createSupabaseAdminClient();
  const { data: inserted, error: insertError } = await supabase
    .from("mssql_bridge_requests")
    .insert({
      request_type: requestType,
      payload,
      requested_by: requestedBy,
      expires_at: new Date(Date.now() + BRIDGE_TIMEOUT_MS).toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    throw new Error(insertError?.message ?? "MSSQL bridge istegi olusturulamadi");
  }

  const deadline = Date.now() + BRIDGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const pollClient = createSupabaseAdminClient({
      "x-mssql-bridge-poll": `${inserted.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });
    const { data: requestRow, error } = await pollClient
      .from("mssql_bridge_requests")
      .select("status, result, error")
      .eq("id", inserted.id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (requestRow?.status === "completed") {
      return (requestRow.result ?? null) as T;
    }

    if (requestRow?.status === "failed" || requestRow?.status === "expired") {
      throw new Error(requestRow.error ?? "MSSQL bridge istegi basarisiz oldu");
    }

    await sleep(BRIDGE_POLL_MS);
  }

  await supabase
    .from("mssql_bridge_requests")
    .update({
      status: "expired",
      error: "Bridge timeout",
      completed_at: new Date().toISOString(),
    })
    .eq("id", inserted.id)
    .in("status", ["pending", "claimed"]);

  throw new Error("MSSQL bridge timeout");
}

async function withModeFallback<T>(requestedBy: string, directFn: () => Promise<T>, bridgeFn: () => Promise<T>) {
  const mode = getBridgeMode();

  if (mode === "agent") return bridgeFn();

  if (mode === "auto") {
    if (canUseDirectMssql()) {
      try {
        return await directFn();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[live-mssql] ${requestedBy} direct failed, bridge fallback`, error);
      }
    }
    return bridgeFn();
  }

  return directFn();
}

async function fetchDirectStockMap(codes: string[], matchMode: StockMatchMode) {
  const map = new Map<string, number>();
  const pool = await connectDirectMssql();
  if (!pool) return map;

  try {
    for (let i = 0; i < codes.length; i += 100) {
      const chunk = codes.slice(i, i + 100);
      const chunkResult = await fetchDirectStockMapChunk(pool, chunk, matchMode);
      chunkResult.forEach((value, key) => map.set(key, value));
    }
  } finally {
    await pool.close();
  }

  return map;
}

async function fetchDirectSalesAgg(codes: string[]) {
  const result = new Map<string, SalesAgg>();
  const dbs = getSalesDbs();
  const pools: any[] = [];

  for (const dbName of dbs) {
    const pool = await connectDirectMssql(dbName);
    if (pool) pools.push(pool);
  }

  if (!pools.length) return result;

  const today = new Date();
  const start120 = new Date(today);
  start120.setHours(0, 0, 0, 0);
  start120.setDate(start120.getDate() - 120);
  const start60 = new Date(today);
  start60.setHours(0, 0, 0, 0);
  start60.setDate(start60.getDate() - 60);
  const startPrev60 = new Date(today);
  startPrev60.setHours(0, 0, 0, 0);
  startPrev60.setDate(startPrev60.getDate() - 120);
  const start10y = new Date(today);
  start10y.setHours(0, 0, 0, 0);
  start10y.setDate(start10y.getDate() - 3650);

  try {
    for (const code of codes) {
      const key = code.trim();
      const agg = { sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };
      for (const pool of pools) {
        const query = `
          SELECT
            SUM(CASE WHEN STHAR_TARIH >= @start120 THEN STHAR_GCMIK ELSE 0 END) AS sales120,
            SUM(CASE WHEN STHAR_TARIH >= @start60 THEN STHAR_GCMIK ELSE 0 END) AS sales60,
            SUM(CASE WHEN STHAR_TARIH >= @startPrev60 AND STHAR_TARIH < @start60 THEN STHAR_GCMIK ELSE 0 END) AS salesPrev60,
            SUM(CASE WHEN STHAR_TARIH >= @start10y THEN STHAR_GCMIK ELSE 0 END) AS sales10y
          FROM TBLSTHAR
          WHERE LTRIM(RTRIM(STOK_KODU)) LIKE @code AND UPPER(STHAR_GCKOD) = 'C'
        `;

        const row =
          (
            await pool
              .request()
              .input("start120", sql.DateTime, start120)
              .input("start60", sql.DateTime, start60)
              .input("startPrev60", sql.DateTime, startPrev60)
              .input("start10y", sql.DateTime, start10y)
              .input("code", sql.VarChar, `${key}%`)
              .query(query)
          ).recordset?.[0] ?? {};

        agg.sales120 += Number(row.sales120 ?? 0);
        agg.sales60 += Number(row.sales60 ?? 0);
        agg.salesPrev60 += Number(row.salesPrev60 ?? 0);
        agg.sales10y += Number(row.sales10y ?? 0);
      }
      result.set(key, agg);
    }
  } finally {
    await Promise.all(pools.map((pool) => pool.close()));
  }

  return result;
}

async function fetchDirectSalesPerDb(codes: string[], days = 3650) {
  const result = new Map<string, Map<string, number>>();
  if (!codes.length) return result;
  const dbs = getSalesDbs();
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - days);

  for (const dbName of dbs) {
    const pool = await connectDirectMssql(dbName);
    if (!pool) continue;
    try {
      for (let i = 0; i < codes.length; i += 100) {
        const part = codes.slice(i, i + 100);
        const request = pool.request().input("startDate", sql.DateTime, startDate);
        const params = part.map((code, index) => {
          request.input(`c${index}`, sql.VarChar, code.trim());
          return `@c${index}`;
        });
        const rs = await request.query(`
          SELECT LTRIM(RTRIM(STOK_KODU)) AS code, SUM(STHAR_GCMIK) AS qty
          FROM TBLSTHAR
          WHERE UPPER(STHAR_GCKOD) = 'C'
            AND STHAR_TARIH >= @startDate
            AND LTRIM(RTRIM(STOK_KODU)) IN (${params.join(",")})
          GROUP BY LTRIM(RTRIM(STOK_KODU))
        `);

        (rs.recordset ?? []).forEach((row: any) => {
          const code = String(row.code ?? "").trim();
          if (!code) return;
          const bucket = result.get(code) ?? new Map<string, number>();
          bucket.set(dbName, (bucket.get(dbName) ?? 0) + Number(row.qty ?? 0));
          result.set(code, bucket);
        });
      }
    } finally {
      await pool.close();
    }
  }

  return result;
}

async function fetchDirectSales10yChunk(codes: string[]) {
  const totals = new Map<string, number>();
  const debug: Sales10yDebugRow[] = [];
  const dbs = getSalesDbs();
  const codeSet = new Set(codes.map((code) => code.trim().toUpperCase()));

  for (const dbName of dbs) {
    const pool = await connectDirectMssql(dbName);
    if (!pool) continue;
    try {
      for (const code of codes) {
        const key = code.trim();
        const wordPattern = new RegExp(`(^|[\\s-])${escapeRegex(key.toUpperCase())}([\\s-]|$)`, "i");
        const codeLike = `%${key}%`;
        const rs = await pool
          .request()
          .input("codeLike", sql.VarChar, codeLike)
          .query(`
            SELECT
              LTRIM(RTRIM(t.STOK_KODU)) AS stok_kodu,
              SUM(CASE WHEN UPPER(t.STHAR_GCKOD)='C' THEN ISNULL(t.STHAR_GCMIK,0) ELSE 0 END) AS total_sales,
              STUFF((
                SELECT ',' + CAST(t2.FISNO AS nvarchar(100))
                FROM TBLSTHAR t2
                WHERE UPPER(LTRIM(RTRIM(t2.STOK_KODU))) LIKE UPPER(@codeLike)
                  AND UPPER(t2.STHAR_GCKOD)='C'
                FOR XML PATH(''), TYPE
              ).value('.','NVARCHAR(MAX)'),1,1,'') AS fisnos
            FROM TBLSTHAR t
            WHERE UPPER(LTRIM(RTRIM(t.STOK_KODU))) LIKE UPPER(@codeLike)
            GROUP BY LTRIM(RTRIM(t.STOK_KODU))
          `);

        for (const row of rs.recordset ?? []) {
          const stokKodu = String(row.stok_kodu ?? "").trim().toUpperCase();
          if (codeSet.has(stokKodu) && stokKodu !== key.toUpperCase()) continue;
          if (!stokKodu || !wordPattern.test(stokKodu)) continue;
          const current = Number(row.total_sales ?? 0);
          totals.set(key, (totals.get(key) ?? 0) + current);
          debug.push({
            db: dbName,
            code: key,
            total: current,
            fisnos: row.fisnos ?? null,
          });
        }
      }
    } finally {
      await pool.close();
    }
  }

  return { totals, debug };
}

export async function fetchLiveStockMap(codes: string[], matchMode: StockMatchMode = "prefix") {
  const distinctCodes = trimDistinctCodes(codes);
  if (!distinctCodes.length) return new Map<string, number>();
  const cached = readStockCache(distinctCodes, matchMode);
  if (cached) return cached;
  try {
    const result = await withModeFallback(
      "stock.lookup",
      () => fetchDirectStockMap(distinctCodes, matchMode),
      async () => {
        const result = await runBridgeRequest<Record<string, number>>(
          "stock.lookup",
          { codes: distinctCodes, matchMode },
          "stock.lookup"
        );
        return new Map(Object.entries(result ?? {}).map(([key, value]) => [key, Number(value ?? 0)]));
      }
    );
    writeStockCache(distinctCodes, matchMode, result);
    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[live-mssql] fetchLiveStockMap failed", error);
    return new Map<string, number>();
  }
}

export async function fetchLiveSalesAgg(codes: string[]) {
  const distinctCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!distinctCodes.length) return new Map<string, SalesAgg>();
  try {
    return await withModeFallback(
      "sales.aggregate",
      () => fetchDirectSalesAgg(distinctCodes),
      async () => {
        const result = await runBridgeRequest<Record<string, SalesAgg>>(
          "sales.aggregate",
          { codes: distinctCodes },
          "sales.aggregate"
        );
        return new Map(
          Object.entries(result ?? {}).map(([key, value]) => [
            key,
            {
              sales120: Number(value?.sales120 ?? 0),
              sales60: Number(value?.sales60 ?? 0),
              salesPrev60: Number(value?.salesPrev60 ?? 0),
              sales10y: Number(value?.sales10y ?? 0),
            },
          ])
        );
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[live-mssql] fetchLiveSalesAgg failed", error);
    return new Map<string, SalesAgg>();
  }
}

export async function fetchLiveSalesPerDb(codes: string[], days = 3650) {
  const distinctCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!distinctCodes.length) return new Map<string, Map<string, number>>();
  try {
    return await withModeFallback(
      "sales.by-db",
      () => fetchDirectSalesPerDb(distinctCodes, days),
      async () => {
        const result = await runBridgeRequest<Record<string, Record<string, number>>>(
          "sales.by-db",
          { codes: distinctCodes, days },
          "sales.by-db"
        );
        return new Map(
          Object.entries(result ?? {}).map(([code, dbRows]) => [
            code,
            new Map(Object.entries(dbRows ?? {}).map(([dbName, qty]) => [dbName, Number(qty ?? 0)])),
          ])
        );
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[live-mssql] fetchLiveSalesPerDb failed", error);
    return new Map<string, Map<string, number>>();
  }
}

export async function fetchLiveSales10yChunk(codes: string[]) {
  const distinctCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  if (!distinctCodes.length) return { totals: new Map<string, number>(), debug: [] as Sales10yDebugRow[] };
  try {
    return await withModeFallback(
      "sales10y.chunk",
      () => fetchDirectSales10yChunk(distinctCodes),
      async () => {
        const result = await runBridgeRequest<{ totals: Record<string, number>; debug: Sales10yDebugRow[] }>(
          "sales10y.chunk",
          { codes: distinctCodes },
          "sales10y.chunk"
        );
        return {
          totals: new Map(
            Object.entries(result?.totals ?? {}).map(([code, total]) => [code, Number(total ?? 0)])
          ),
          debug: Array.isArray(result?.debug) ? result.debug : [],
        };
      }
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[live-mssql] fetchLiveSales10yChunk failed", error);
    return { totals: new Map<string, number>(), debug: [] as Sales10yDebugRow[] };
  }
}

export async function fetchLiveBridgeStatus() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mssql_bridge_agents")
    .select("agent_name,status,last_seen_at,version,host,meta")
    .order("last_seen_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

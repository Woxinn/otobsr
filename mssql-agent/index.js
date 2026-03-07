require("dotenv").config();

const os = require("os");
const sql = require("mssql");

const APP_BASE_URL = String(process.env.APP_BASE_URL || "").replace(/\/+$/, "");
const AGENT_TOKEN = String(process.env.AGENT_TOKEN || "").trim();
const AGENT_NAME = String(process.env.AGENT_NAME || "mssql-agent").trim();
const AGENT_VERSION = String(process.env.AGENT_VERSION || "1.0.0").trim();
const POLL_INTERVAL_MS = Math.max(500, Number(process.env.POLL_INTERVAL_MS || "1000"));
const HEARTBEAT_INTERVAL_MS = Math.max(5000, Number(process.env.HEARTBEAT_INTERVAL_MS || "15000"));

if (!APP_BASE_URL || !AGENT_TOKEN) {
  console.error("[mssql-agent] APP_BASE_URL ve AGENT_TOKEN zorunlu");
  process.exit(1);
}

const directConfig = {
  server: process.env.MSSQL_SERVER,
  port: process.env.MSSQL_PORT ? Number(process.env.MSSQL_PORT) : 1433,
  database: process.env.MSSQL_DB,
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASS,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT !== "false",
    trustServerCertificate: process.env.MSSQL_TRUST_CERT === "true",
    cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
    enableArithAbort: true,
  },
};

const salesDbs = () => {
  const listed = String(process.env.MSSQL_DB_SALES_LIST || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const base = directConfig.database ? [directConfig.database] : [];
  return Array.from(new Set([...listed, ...base]));
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const poolCache = new Map();

async function getPool(databaseName) {
  const key = databaseName || directConfig.database;
  if (!key) throw new Error("MSSQL_DB eksik");
  const cached = poolCache.get(key);
  if (cached) {
    if (cached.connected) return cached;
    poolCache.delete(key);
  }

  const pool = new sql.ConnectionPool({
    ...directConfig,
    database: key,
  });
  pool.setMaxListeners(0);
  await pool.connect();
  poolCache.set(key, pool);
  return pool;
}

async function closeAllPools() {
  await Promise.all(
    Array.from(poolCache.values()).map(async (pool) => {
      try {
        await pool.close();
      } catch {}
    })
  );
  poolCache.clear();
}

async function apiPost(path, body) {
  const res = await fetch(`${APP_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_TOKEN}`,
    },
    body: JSON.stringify(body || {}),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `${path} failed (${res.status})`);
  }
  return json;
}

async function sendHeartbeat() {
  return apiPost("/api/mssql-bridge/agent/heartbeat", {
    agentName: AGENT_NAME,
    version: AGENT_VERSION,
    host: os.hostname(),
    meta: {
      pid: process.pid,
      db: directConfig.database || null,
      salesDbs: salesDbs(),
    },
  });
}

async function claimRequest() {
  const json = await apiPost("/api/mssql-bridge/agent/claim", {
    agentName: AGENT_NAME,
  });
  return json.request || null;
}

async function respond(requestId, status, payload) {
  return apiPost("/api/mssql-bridge/agent/respond", {
    requestId,
    status,
    ...payload,
  });
}

async function handleStockLookup(payload) {
  const codes = Array.isArray(payload?.codes) ? payload.codes.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const matchMode = payload?.matchMode === "exact" ? "exact" : "prefix";
  const result = {};
  if (!codes.length) return result;

  const pool = await getPool();
  for (const code of Array.from(new Set(codes))) {
    const rs = await pool
      .request()
      .input("stok", sql.VarChar, matchMode === "exact" ? code : `${code}%`)
      .query(
        matchMode === "exact"
          ? `SELECT SUM(CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
             FROM TBLSTHAR Har
             WHERE LTRIM(RTRIM(Har.STOK_KODU)) = @stok`
          : `SELECT SUM(CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
             FROM TBLSTHAR Har
             WHERE LTRIM(RTRIM(Har.STOK_KODU)) LIKE @stok`
      );
    result[code] = Number(rs.recordset?.[0]?.NetMiktar || 0);
  }

  return result;
}

async function handleSalesAggregate(payload) {
  const codes = Array.isArray(payload?.codes) ? payload.codes.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const result = {};
  if (!codes.length) return result;

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

  const dbNames = salesDbs();
  for (const code of Array.from(new Set(codes))) {
    const agg = { sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };
    for (const dbName of dbNames) {
      const pool = await getPool(dbName);
      const rs = await pool
        .request()
        .input("start120", sql.DateTime, start120)
        .input("start60", sql.DateTime, start60)
        .input("startPrev60", sql.DateTime, startPrev60)
        .input("start10y", sql.DateTime, start10y)
        .input("code", sql.VarChar, `${code}%`)
        .query(`
          SELECT
            SUM(CASE WHEN STHAR_TARIH >= @start120 THEN STHAR_GCMIK ELSE 0 END) AS sales120,
            SUM(CASE WHEN STHAR_TARIH >= @start60 THEN STHAR_GCMIK ELSE 0 END) AS sales60,
            SUM(CASE WHEN STHAR_TARIH >= @startPrev60 AND STHAR_TARIH < @start60 THEN STHAR_GCMIK ELSE 0 END) AS salesPrev60,
            SUM(CASE WHEN STHAR_TARIH >= @start10y THEN STHAR_GCMIK ELSE 0 END) AS sales10y
          FROM TBLSTHAR
          WHERE LTRIM(RTRIM(STOK_KODU)) LIKE @code AND UPPER(STHAR_GCKOD) = 'C'
        `);
      const row = rs.recordset?.[0] || {};
      agg.sales120 += Number(row.sales120 || 0);
      agg.sales60 += Number(row.sales60 || 0);
      agg.salesPrev60 += Number(row.salesPrev60 || 0);
      agg.sales10y += Number(row.sales10y || 0);
    }
    result[code] = agg;
  }

  return result;
}

async function handleSalesByDb(payload) {
  const codes = Array.isArray(payload?.codes) ? payload.codes.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const days = Math.max(1, Number(payload?.days || 3650));
  const result = {};
  if (!codes.length) return result;

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - days);

  for (const dbName of salesDbs()) {
    const pool = await getPool(dbName);
    for (let i = 0; i < codes.length; i += 100) {
      const part = codes.slice(i, i + 100);
      const request = pool.request().input("startDate", sql.DateTime, startDate);
      const params = part.map((code, index) => {
        request.input(`c${index}`, sql.VarChar, code);
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

      for (const row of rs.recordset || []) {
        const code = String(row.code || "").trim();
        if (!code) continue;
        result[code] = result[code] || {};
        result[code][dbName] = Number(row.qty || 0);
      }
    }
  }

  return result;
}

async function handleSales10yChunk(payload) {
  const codes = Array.isArray(payload?.codes) ? payload.codes.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const totals = {};
  const debug = [];
  if (!codes.length) return { totals, debug };
  const codeSet = new Set(codes.map((code) => code.toUpperCase()));

  for (const dbName of salesDbs()) {
    const pool = await getPool(dbName);
    for (const code of codes) {
      const wordPattern = new RegExp(`(^|[\\s-])${escapeRegex(code.toUpperCase())}([\\s-]|$)`, "i");
      const rs = await pool
        .request()
        .input("codeLike", sql.VarChar, `%${code}%`)
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

      for (const row of rs.recordset || []) {
        const stokKodu = String(row.stok_kodu || "").trim().toUpperCase();
        if (codeSet.has(stokKodu) && stokKodu !== code.toUpperCase()) continue;
        if (!stokKodu || !wordPattern.test(stokKodu)) continue;
        const total = Number(row.total_sales || 0);
        totals[code] = Number(totals[code] || 0) + total;
        debug.push({
          db: dbName,
          code,
          total,
          fisnos: row.fisnos || null,
        });
      }
    }
  }

  return { totals, debug };
}

async function processRequest(request) {
  switch (request.request_type) {
    case "stock.lookup":
      return handleStockLookup(request.payload);
    case "sales.aggregate":
      return handleSalesAggregate(request.payload);
    case "sales.by-db":
      return handleSalesByDb(request.payload);
    case "sales10y.chunk":
      return handleSales10yChunk(request.payload);
    default:
      throw new Error(`Desteklenmeyen request_type: ${request.request_type}`);
  }
}

let shuttingDown = false;

async function workerLoop() {
  while (!shuttingDown) {
    try {
      const request = await claimRequest();
      if (!request) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log("[mssql-agent] request", request.id, request.request_type);
      try {
        const result = await processRequest(request);
        await respond(request.id, "completed", { result });
      } catch (error) {
        console.error("[mssql-agent] request fail", request.id, error);
        await respond(request.id, "failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      console.error("[mssql-agent] loop fail", error);
      await sleep(POLL_INTERVAL_MS * 2);
    }
  }
}

async function main() {
  console.log("[mssql-agent] basliyor", { agent: AGENT_NAME, baseUrl: APP_BASE_URL });
  await sendHeartbeat();
  const timer = setInterval(() => {
    sendHeartbeat().catch((error) => {
      console.error("[mssql-agent] heartbeat fail", error);
    });
  }, HEARTBEAT_INTERVAL_MS);

  process.on("SIGINT", async () => {
    shuttingDown = true;
    clearInterval(timer);
    await closeAllPools();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    shuttingDown = true;
    clearInterval(timer);
    await closeAllPools();
    process.exit(0);
  });

  await workerLoop();
}

main().catch(async (error) => {
  console.error("[mssql-agent] fatal", error);
  await closeAllPools();
  process.exit(1);
});

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const { EventEmitter } = require("events");
const sql = require("mssql");
const dotenv = require("dotenv");

function resolveAppDir(baseDir) {
  return (
    baseDir ||
    process.env.PORTABLE_EXECUTABLE_DIR ||
    path.dirname(process.execPath)
  );
}

function loadEnv(baseDir) {
  const appDir = resolveAppDir(baseDir);
  const sourceDir = __dirname;
  const envCandidates = [
    path.join(process.cwd(), ".env"),
    path.join(appDir, ".env"),
    path.join(sourceDir, ".env"),
  ];

  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
      return envPath;
    }
  }

  return null;
}

if (typeof AbortSignal !== "undefined" && typeof AbortSignal.any !== "function") {
  AbortSignal.any = function any(signals) {
    const controller = new AbortController();
    for (const signal of signals || []) {
      if (!signal) continue;
      if (signal.aborted) {
        controller.abort(signal.reason);
        return controller.signal;
      }
      signal.addEventListener(
        "abort",
        () => {
          if (!controller.signal.aborted) controller.abort(signal.reason);
        },
        { once: true }
      );
    }
    return controller.signal;
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const nowIso = () => new Date().toISOString();
const trimCode = (value) => String(value || "").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class AgentCore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.appDir = resolveAppDir(options.appDir);
    this.statusFilePath = path.join(this.appDir, "agent-status.json");
    this.running = false;
    this.heartbeatPromise = null;
    this.claimPromise = null;

    loadEnv(this.appDir);

    this.baseUrl = String(process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
    this.token = String(process.env.AGENT_TOKEN || "").trim();
    this.agentName = String(process.env.AGENT_NAME || "mssql-main").trim();
    this.pollIntervalMs = Math.max(250, Number(process.env.POLL_INTERVAL_MS || "1000"));
    this.heartbeatIntervalMs = Math.max(5000, Number(process.env.HEARTBEAT_INTERVAL_MS || "30000"));
    this.requestTimeoutMs = Math.max(5000, Number(process.env.REQUEST_TIMEOUT_MS || "60000"));
    this.salesDbs = Array.from(
      new Set(
        String(process.env.MSSQL_DB_SALES_LIST || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .concat(process.env.MSSQL_DB ? [String(process.env.MSSQL_DB).trim()] : [])
      )
    );

    this.status = {
      agentName: this.agentName,
      baseUrl: this.baseUrl,
      pid: process.pid,
      startedAt: nowIso(),
      state: "starting",
      lastHeartbeatAt: null,
      lastHeartbeatOk: null,
      lastRequestId: null,
      lastRequestType: null,
      lastRequestStatus: null,
      lastRequestAt: null,
      lastError: null,
      updatedAt: nowIso(),
    };
  }

  validateConfig() {
    if (!this.baseUrl) throw new Error("APP_BASE_URL eksik");
    if (!/^https?:\/\//i.test(this.baseUrl)) {
      throw new Error("APP_BASE_URL http:// veya https:// ile baslamali");
    }
    if (!this.token) throw new Error("AGENT_TOKEN eksik");
    if (!process.env.MSSQL_SERVER || !process.env.MSSQL_DB || !process.env.MSSQL_USER || !process.env.MSSQL_PASS) {
      throw new Error("MSSQL_SERVER, MSSQL_DB, MSSQL_USER, MSSQL_PASS zorunlu");
    }
  }

  writeStatus() {
    try {
      this.status.updatedAt = nowIso();
      fs.writeFileSync(this.statusFilePath, JSON.stringify(this.status, null, 2), "utf8");
      this.emit("status", { ...this.status });
    } catch (error) {
      this.emit("log", { level: "error", message: "status write fail", error: String(error) });
    }
  }

  patchStatus(patch) {
    Object.assign(this.status, patch || {});
    this.writeStatus();
  }

  log(level, message, extra) {
    this.emit("log", { level, message, ...(extra ? { extra } : {}) });
  }

  async apiPost(urlPath, body) {
    const endpoint = new URL(urlPath, this.baseUrl);
    const payload = Buffer.from(JSON.stringify(body || {}), "utf8");
    const transport = endpoint.protocol === "https:" ? https : http;

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: endpoint.protocol,
          hostname: endpoint.hostname,
          port: endpoint.port || (endpoint.protocol === "https:" ? 443 : 80),
          path: `${endpoint.pathname}${endpoint.search}`,
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "otobsr-mssql-agent/2.0.0",
            "Content-Length": payload.length,
          },
          timeout: this.requestTimeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let parsed = raw;
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {}

            if ((res.statusCode || 500) >= 200 && (res.statusCode || 500) < 300) {
              resolve(parsed);
              return;
            }

            reject(
              new Error(
                `${urlPath} failed (${res.statusCode || 500}) ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`
              )
            );
          });
        }
      );

      req.on("timeout", () => req.destroy(new Error(`Request timeout: ${urlPath}`)));
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }

  getSqlConfig(databaseName) {
    return {
      server: String(process.env.MSSQL_SERVER).trim(),
      port: Number(process.env.MSSQL_PORT || "1433"),
      database: databaseName || String(process.env.MSSQL_DB).trim(),
      user: String(process.env.MSSQL_USER).trim(),
      password: String(process.env.MSSQL_PASS).trim(),
      pool: { max: 4, min: 0, idleTimeoutMillis: 30000 },
      options: {
        encrypt: process.env.MSSQL_ENCRYPT !== "false",
        trustServerCertificate: process.env.MSSQL_TRUST_CERT === "true",
        enableArithAbort: true,
        cryptoCredentialsDetails: { minVersion: "TLSv1", maxVersion: "TLSv1.2" },
      },
    };
  }

  async withPool(databaseName, fn) {
    const pool = new sql.ConnectionPool(this.getSqlConfig(databaseName));
    pool.setMaxListeners(0);
    await pool.connect();
    try {
      return await fn(pool);
    } finally {
      await pool.close().catch(() => {});
    }
  }

  async sendHeartbeat() {
    const result = await this.apiPost("/api/mssql-bridge/agent/heartbeat", {
      agentName: this.agentName,
      version: "2.0.0",
      host: os.hostname(),
      meta: {
        platform: process.platform,
        release: os.release(),
        pid: process.pid,
        startedAt: this.status.startedAt,
      },
    });

    this.patchStatus({
      state: "online",
      lastHeartbeatAt: nowIso(),
      lastHeartbeatOk: true,
      lastError: null,
    });
    return result;
  }

  async claimRequest() {
    const data = await this.apiPost("/api/mssql-bridge/agent/claim", { agentName: this.agentName });
    return data?.request ?? null;
  }

  async respondRequest(requestId, status, payload) {
    return this.apiPost("/api/mssql-bridge/agent/respond", {
      requestId,
      status,
      ...payload,
    });
  }

  async handleStockLookup(payload) {
    const codes = Array.from(new Set((payload?.codes || []).map(trimCode).filter(Boolean)));
    const matchMode = payload?.matchMode === "exact" ? "exact" : "prefix";
    if (!codes.length) return {};

    return this.withPool(undefined, async (pool) => {
      const result = {};
      for (const code of codes) {
        const query =
          matchMode === "exact"
            ? `SELECT SUM(CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
               FROM TBLSTHAR Har
               WHERE LTRIM(RTRIM(Har.STOK_KODU)) = @stok`
            : `SELECT SUM(CASE WHEN UPPER(Har.STHAR_GCKOD)='G' THEN Har.STHAR_GCMIK ELSE -Har.STHAR_GCMIK END) AS NetMiktar
               FROM TBLSTHAR Har
               WHERE LTRIM(RTRIM(Har.STOK_KODU)) LIKE @stok`;

        const rs = await pool
          .request()
          .input("stok", sql.VarChar, matchMode === "exact" ? code : `${code}%`)
          .query(query);
        result[code] = Number(rs.recordset?.[0]?.NetMiktar || 0);
      }
      return result;
    });
  }

  async handleSalesAggregate(payload) {
    const codes = Array.from(new Set((payload?.codes || []).map(trimCode).filter(Boolean)));
    if (!codes.length) return {};

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

    const output = {};
    for (const code of codes) {
      output[code] = { sales120: 0, sales60: 0, salesPrev60: 0, sales10y: 0 };
    }

    for (const dbName of this.salesDbs) {
      await this.withPool(dbName, async (pool) => {
        for (const code of codes) {
          const row =
            (
              await pool
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
                `)
            ).recordset?.[0] || {};

          output[code].sales120 += Number(row.sales120 || 0);
          output[code].sales60 += Number(row.sales60 || 0);
          output[code].salesPrev60 += Number(row.salesPrev60 || 0);
          output[code].sales10y += Number(row.sales10y || 0);
        }
      });
    }

    return output;
  }

  async handleSalesByDb(payload) {
    const codes = Array.from(new Set((payload?.codes || []).map(trimCode).filter(Boolean)));
    const days = Math.max(1, Number(payload?.days || 3650));
    if (!codes.length) return {};

    const output = {};
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - days);

    for (const dbName of this.salesDbs) {
      await this.withPool(dbName, async (pool) => {
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
            const code = trimCode(row.code);
            if (!code) continue;
            output[code] = output[code] || {};
            output[code][dbName] = (output[code][dbName] || 0) + Number(row.qty || 0);
          }
        }
      });
    }

    return output;
  }

  async handleSales10yChunk(payload) {
    const codes = Array.from(new Set((payload?.codes || []).map(trimCode).filter(Boolean)));
    const totals = {};
    const debug = [];
    if (!codes.length) return { totals, debug };

    const codeSet = new Set(codes.map((code) => code.toUpperCase()));
    for (const dbName of this.salesDbs) {
      await this.withPool(dbName, async (pool) => {
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
            const stokKodu = trimCode(row.stok_kodu).toUpperCase();
            if (!stokKodu) continue;
            if (codeSet.has(stokKodu) && stokKodu !== code.toUpperCase()) continue;
            if (!wordPattern.test(stokKodu)) continue;
            const total = Number(row.total_sales || 0);
            totals[code] = (totals[code] || 0) + total;
            debug.push({
              db: dbName,
              code,
              total,
              fisnos: row.fisnos || null,
            });
          }
        }
      });
    }

    return { totals, debug };
  }

  async executeRequest(requestType, payload) {
    if (requestType === "stock.lookup") return this.handleStockLookup(payload);
    if (requestType === "sales.aggregate") return this.handleSalesAggregate(payload);
    if (requestType === "sales.by-db") return this.handleSalesByDb(payload);
    if (requestType === "sales10y.chunk") return this.handleSales10yChunk(payload);
    throw new Error(`Desteklenmeyen request_type: ${requestType}`);
  }

  async processRequest(request) {
    const started = Date.now();
    this.log("info", `request ${request.id} ${request.request_type}`);
    this.patchStatus({
      state: "processing",
      lastRequestId: request.id,
      lastRequestType: request.request_type,
      lastRequestStatus: "processing",
      lastRequestAt: nowIso(),
      lastError: null,
    });

    try {
      const result = await this.executeRequest(request.request_type, request.payload || {});
      this.log("info", `request result ${request.id} ${request.request_type} ${Date.now() - started}ms`);
      await this.respondRequest(request.id, "completed", { result });
      this.log("info", `request responded ${request.id} completed`);
      this.patchStatus({
        state: "online",
        lastRequestStatus: "completed",
        lastRequestAt: nowIso(),
        lastError: null,
      });
    } catch (error) {
      const message = error && error.stack ? error.stack : String(error);
      this.log("error", `request fail ${request.id}`, message);
      try {
        await this.respondRequest(request.id, "failed", { error: message });
      } catch (respondError) {
        this.log("error", `request respond fail ${request.id}`, String(respondError));
      }
      this.patchStatus({
        state: "error",
        lastRequestStatus: "failed",
        lastRequestAt: nowIso(),
        lastError: message,
      });
    }
  }

  async heartbeatLoop() {
    while (this.running) {
      try {
        await this.sendHeartbeat();
      } catch (error) {
        this.log("error", "heartbeat fail", String(error));
        this.patchStatus({
          state: "error",
          lastHeartbeatAt: nowIso(),
          lastHeartbeatOk: false,
          lastError: error && error.stack ? error.stack : String(error),
        });
      }
      await sleep(this.heartbeatIntervalMs);
    }
  }

  async claimLoop() {
    while (this.running) {
      try {
        const request = await this.claimRequest();
        if (request) {
          await this.processRequest(request);
          continue;
        }
        this.patchStatus({
          state: "online",
          lastError: null,
        });
      } catch (error) {
        this.log("error", "claim fail", String(error));
        this.patchStatus({
          state: "error",
          lastError: error && error.stack ? error.stack : String(error),
        });
      }
      await sleep(this.pollIntervalMs);
    }
  }

  async start() {
    this.validateConfig();
    this.running = true;
    this.writeStatus();
    this.log("info", "basliyor", { agent: this.agentName, baseUrl: this.baseUrl });
    await this.sendHeartbeat();
    this.heartbeatPromise = this.heartbeatLoop();
    this.claimPromise = this.claimLoop();
  }

  stop() {
    this.running = false;
    this.patchStatus({ state: "stopped" });
  }
}

module.exports = {
  AgentCore,
  loadEnv,
};

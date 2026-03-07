# MSSQL Agent

Bu klasor MSSQL makinesine kurulacak agent icin ayrildi. Agent lokal MSSQL'e baglanir, sizin Next uygulamanizin bridge endpointlerine outbound HTTPS ile baglanir.

## Kurulum

1. MSSQL makinesine Node.js 20+ kurun.
2. Bu klasoru kopyalayin.
3. `.env.example` dosyasini `.env` olarak kopyalayin.
4. `.env` icini doldurun:
   - `APP_BASE_URL`: sizin uygulamanizin dis URL'i
   - `AGENT_TOKEN`: Next uygulamasindaki `MSSQL_BRIDGE_AGENT_TOKEN` ile ayni olmali
   - `AGENT_NAME`: agent ismi
   - MSSQL baglanti bilgileri
5. Kurulum:

```powershell
cd mssql-agent
npm install
npm start
```

## Servis olarak calistirma

En pratik yontem:

- `nssm`
- veya Windows Task Scheduler + `node index.js`

NSSM ornegi:

```powershell
nssm install OtobsrMssqlAgent "C:\\Program Files\\nodejs\\node.exe" "C:\\path\\to\\mssql-agent\\index.js"
nssm set OtobsrMssqlAgent AppDirectory "C:\\path\\to\\mssql-agent"
nssm start OtobsrMssqlAgent
```

## Agent ne yapar

- `stock.lookup`
- `sales.aggregate`
- `sales.by-db`
- `sales10y.chunk`

isteklerini alir.

## Guvenlik

- MSSQL kullanicisi sadece read-only olmali.
- `AGENT_TOKEN` guclu ve rastgele olmali.
- MSSQL portu disariya acilmaz.
- Agent sadece uygulamaya outbound HTTPS yapar.

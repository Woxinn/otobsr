# MSSQL Bridge

## App tarafi env

Next uygulamasinda su env'leri tanimlayin:

```env
MSSQL_BRIDGE_MODE=agent
MSSQL_BRIDGE_AGENT_TOKEN=guclu-rastgele-token
MSSQL_BRIDGE_TIMEOUT_MS=30000
MSSQL_BRIDGE_POLL_MS=500
```

Local ortamda direkt MSSQL kullanmaya devam etmek isterseniz:

```env
MSSQL_BRIDGE_MODE=direct
```

Otomatik fallback isterseniz:

```env
MSSQL_BRIDGE_MODE=auto
```

## Route'lar

- `POST /api/mssql-bridge/agent/heartbeat`
- `POST /api/mssql-bridge/agent/claim`
- `POST /api/mssql-bridge/agent/respond`
- `GET /api/mssql-bridge/status`

## Kullanim

- `products` sayfasi stok icin bridge kullanir
- `product detail` bridge kullanir
- `siparis plani` stok ve satis toplamlari icin bridge kullanir
- `order-plan` export route'lari bridge kullanir
- `sales-10y-sync` bridge kullanir

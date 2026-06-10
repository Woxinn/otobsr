# Poke MCP Entegrasyonu

Poke, bu uygulamaya `/api/poke/mcp` endpoint'i üzerinden MCP ile bağlanır.

## Ortam değişkenleri

```bash
POKE_MCP_API_KEY="uzun-rastgele-bir-secret"
POKE_MCP_ALLOW_FINANCE="false"
NEXT_PUBLIC_APP_URL="https://uygulama-domainin.com"
```

- `POKE_MCP_API_KEY`: Poke entegrasyonunda API key olarak girilir.
- `POKE_MCP_ALLOW_FINANCE`: `true` yapılırsa ödeme/fiyat tool'ları finans verisini döner.
- `NEXT_PUBLIC_APP_URL`: Poke cevaplarında uygulama linkleri üretmek için kullanılır.

## Lokal test

Önce uygulamayı çalıştır:

```bash
npm run dev
```

Sonra Poke CLI ile tunnel aç:

```bash
npx poke@latest login
npx poke@latest tunnel http://localhost:3000/api/poke/mcp -n "Otobsr ERP"
```

API key kullanacaksan:

```bash
npx poke@latest mcp add https://domain.com/api/poke/mcp -n "Otobsr ERP" -k "$POKE_MCP_API_KEY"
```

## İlk tool seti

- `ping_system`
- `get_dashboard_priority_list`
- `get_overdue_shipments`
- `search_products`
- `get_supplier_open_orders`
- `get_rfq_missing_prices`
- `get_order_payment_summary`

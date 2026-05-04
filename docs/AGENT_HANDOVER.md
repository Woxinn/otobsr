# AGENT HANDOVER - FULL PROJE HARITASI

Bu dokuman yeni bir AI/agent'in projeyi sifirdan devralip dogru yerden devam etmesi icin hazirlandi.

- Tarih: 2026-05-04
- Proje: `otobsrimportv`
- Stack: Next.js App Router + TypeScript + Supabase + MSSQL (direct/bridge agent)

---

## 1) UST SEVIYE MIMARI

### 1.1 Uygulama katmanlari

- `app/(app)/...`: ana urun modulleri (dashboard, orders, shipments, products, suppliers, rfq vs)
- `app/actions/...`: server action mutasyonlari
- `app/api/...`: API route'lari (MSSQL bridge, import/export, RFQ, order-plan, tools)
- `components/...`: UI bilesenleri
- `lib/...`: ortak is kurallari, hesap motorlari, rol kontrolleri, Supabase/MSSQL helper'lari
- `mssql-agent/...`: Electron/Node bridge agent (Supabase queue -> MSSQL query -> response)
- `supabase/migrations/...`: DB migrationlari

### 1.2 Kimlik/Yetki

- Roller: `Admin`, `Yonetim`, `Satis`.
- Kritik helper: `lib/roles` (`canEdit`, `canViewFinance`, `canViewModule`).
- Kural: UI'da gizleme + server action/API tarafinda da rol check.

### 1.3 MSSQL entegrasyon modu

- `direct`: web app MSSQL'e direkt baglanir.
- `agent`: web app `mssql_bridge_requests` tablosuna is yazar, agent sonucu geri doldurur.
- `auto`: direct deneyip hata olursa bridge fallback.

Kritik dosyalar:
- `lib/live-mssql.ts`
- `mssql-agent/agent-core.js`

---

## 2) MODUL BAZLI HARITA

## 2.1 Dashboard (`/`)

Dosya:
- `app/(app)/page.tsx`

Yaptigi isler:
- Shipment canli durum seridi
- Siparis canli durum seridi
- Finans ozet (bu ay yapilan odeme, bekleyen odeme, bakiye)
- Kalan odemesi olan siparis listesi (kart ici scroll)
- Evrak eksik siparis operasyon listesi

DB tablolari:
- `shipments`
- `orders`
- `order_payments`
- `documents`
- `order_documents`
- `document_types`
- `shipment_orders`

---

## 2.2 Siparisler (`/orders` + `/orders/[id]`)

Dosyalar:
- Liste: `app/(app)/orders/page.tsx`
- Detay: `app/(app)/orders/[id]/page.tsx`
- Duzenle: `app/(app)/orders/[id]/edit/page.tsx`
- Yeni: `app/(app)/orders/new/page.tsx`
- Kalem tekil duzenleme: `app/(app)/orders/[id]/items/[itemId]/edit/page.tsx`
- Packing import: `app/(app)/orders/[id]/packing-import/page.tsx`
- Beyanname / Beyanname Lab: `app/(app)/orders/[id]/beyanname/page.tsx`, `.../beyanname-lab-q9m2/page.tsx`
- Sigorta mail: `app/(app)/orders/[id]/insurance-mail/page.tsx`

Action dosyalari:
- `app/actions/orders.ts`
- `app/actions/order-items.ts`
- `app/actions/order-payments.ts`
- `app/actions/order-documents.ts`
- `app/actions/order-packing-list.ts`

Son eklenen kritik ozellik:
- Siparis detayda toplu kalem duzenleme (`OrderItemsQuickEdit`):
  - adet
  - birim fiyat
  - toplam net kg
  - toplam brut kg
- Server action: `bulkUpdateOrderItems`

DB tablolari:
- `orders`
- `order_items`
- `order_payments`
- `order_documents`
- `document_types`
- `order_packing_list_items`
- `order_packing_list_summary`
- `packing_lists`
- `packing_list_lines`

Ilgili baglar:
- `orders.supplier_id -> suppliers.id`
- `order_items.order_id -> orders.id`
- `order_items.product_id -> products.id`

---

## 2.3 Shipmentlar (`/shipments`)

Dosyalar:
- `app/(app)/shipments/page.tsx`
- `app/(app)/shipments/[id]/page.tsx`
- `app/(app)/shipments/new/page.tsx`
- `app/(app)/shipments/[id]/edit/page.tsx`

DB tablolari:
- `shipments`
- `shipment_orders` (N:N bag)
- `documents` (shipment evraklari)
- `eta_history` (kullanim mevcut)

Not:
- shipment status'lari dashboard canli serit ve siparis status sync akislariyla bagli.

---

## 2.4 Tedarikciler (`/suppliers`)

Dosyalar:
- Liste: `app/(app)/suppliers/page.tsx`
- Detay: `app/(app)/suppliers/[id]/page.tsx`
- Yeni: `app/(app)/suppliers/new/page.tsx`
- Proforma rapor: `app/(app)/suppliers/[id]/proforma-rapor/page.tsx`

Son durum:
- Liste tablosunda bakiye gorunur:
  - Kalan odeme: kirmizi
  - Fazla odeme: yesil
- Detayda finans ozet tek bakiye mantiginda:
  - `bakiye = toplam fatura - odenen`
  - isarete gore `Kalan odeme` veya `Fazla odeme`
- Detayda bagli RFQ listesi var.

DB tablolari:
- `suppliers`
- `orders`
- `order_payments`
- `proformas`
- `proforma_items`
- `rfq_suppliers`
- `rfqs`

---

## 2.5 Urunler (`/products`)

Dosyalar:
- Liste: `app/(app)/products/page.tsx`
- Detay: `app/(app)/products/[id]/page.tsx`
- Duzenle: `app/(app)/products/[id]/edit/page.tsx`
- Yeni: `app/(app)/products/new/page.tsx`
- Costs: `app/(app)/products/[id]/costs/page.tsx`
- Netsis import: `app/(app)/products/netsis-import/page.tsx`
- Import update: `app/(app)/products/import-update/page.tsx`
- Attributes export: `app/(app)/products/attributes-export/page.tsx`

Detay sayfasi:
- bagli siparisler
- bagli RFQ'lar
- nitelik kartlari
- canli stok karti

DB tablolari:
- `products`
- `product_groups`
- `product_attributes`
- `product_attribute_values`
- `product_extra_attributes`
- `product_types`
- `product_type_compliance`
- `supplier_product_aliases`
- `order_items`
- `rfq_items`

---

## 2.6 RFQ / Teklif Talepleri (`/rfqs`)

Dosyalar:
- Liste: `app/(app)/rfqs/page.tsx`
- Detay: `app/(app)/rfqs/[id]/page.tsx`
- Yeni: `app/(app)/rfqs/new/page.tsx`

Ilgili API:
- `app/api/rfq/*`
  - create/update
  - quote item
  - supplier add
  - export
  - import
  - convert-to-order

DB tablolari:
- `rfqs`
- `rfq_items`
- `rfq_suppliers`
- `rfq_quotes`
- `rfq_quote_items`

Not:
- RFQ -> order donusum akisi var.
- RFQ satirlarinda masraf/kar override mantigi mevcut.

---

## 2.7 Siparis Plani (`/siparis-plani`)

Dosyalar:
- `app/(app)/siparis-plani/page.tsx`
- `components/OrderPlanLiveTable.tsx`
- `components/OrderPlanExportJobButton.tsx`

API:
- `app/api/order-plan/live-metrics/route.ts`
- `app/api/order-plan-export/route.ts`
- `app/api/order-plan-export/jobs/...`

Core logic:
- `lib/live-mssql.ts`

Ana metrikler:
- `stock`
- `sales120` (etiket: 10 aylik)
- `sales60`
- `salesPrev60`
- `sales10y`

Tarih penceresi:
- 10 aylik pencere = 310 gun
- UI'da tarih araligi gosterilir

Buyuk veri dayanikliligi:
- chunk + dusuk concurrency + retry
- export job tabanli asenkron hazirlama

DB tablolari:
- `order_plan_entries`
- `order_plan_defaults`
- `order_plan_export_jobs`
- `order_plan_export_job_rows`
- `order_plan_export_job_codes`
- `product_sales_10y_totals`

---

## 2.8 Konteyner Planlama (`/konteyner-planlama`)

Dosya:
- `app/(app)/konteyner-planlama/page.tsx`
- `components/ContainerPlannerBoard.tsx`

Mevcut mantik:
- siparis bazli havuz
- drag-drop konteyner atama
- sayfaya ozel manuel agirlik override (DB'ye yazmaz)
- filtreler (arama, tedarikci, sadece 0 kg)

Not:
- agirlik override'lar oturum bazli UI state.

---

## 2.9 Beyanname Lab / Gumruk hesaplari

Dosyalar:
- `app/(app)/orders/[id]/beyanname/page.tsx`
- `app/(app)/orders/[id]/beyanname-lab-q9m2/page.tsx`
- `lib/gtipCost.ts`
- `lib/order-weight.ts`

Mantik:
- GTIP + ulke bazli oran secimi (`gtip_country_rates`)
- KDV/GV/ilave vergi/anti-damping/gozetim hesaplari
- Gozetim tabani vs gumruk matrahi ayrimi
- agirlik dagitimi engine ve packing kaynaklariyla hesap

DB tablolari:
- `gtips`
- `gtip_country_rates`
- `orders`, `order_items`
- `order_packing_list_summary`, `packing_list_lines`

---

## 2.10 Proformalar

Dosyalar:
- `app/(app)/proformalar/page.tsx`
- `app/(app)/proformalar/new/page.tsx`
- `app/(app)/proformalar/[id]/page.tsx`

DB tablolari:
- `proformas`
- `proforma_items`

Not:
- siparis plani hesaplarinda faturaya donusmemis proforma acik miktari kullanilir.

---

## 2.11 Forwarder / Port / Route modulleri

Dosyalar:
- Forwarders:
  - `app/(app)/forwarders/page.tsx`
  - `app/(app)/forwarders/[id]/page.tsx`
- Ports:
  - `app/(app)/ports/page.tsx`
  - `app/(app)/ports/[id]/page.tsx`
  - `app/(app)/ports/[id]/edit/page.tsx`
- Routes:
  - `app/(app)/routes/page.tsx`

DB tablolari:
- `forwarders`
- `forwarder_quotes`
- `ports`
- `routes` (kullanim var, query'de geciyor)

Forwarder detayinda son yapilanlar:
- mevcut teklifler tablosu modern badge tasarimi
- kalkis/varis limani
- shipment tıklanabilir link
- silinmis shipment icin badge/engelli aksiyon

---

## 2.12 Diger moduller

- Document center: `app/(app)/documents/*`
- Packing lists: `app/(app)/packing-lists/*`
- GTIP yonetimi: `app/(app)/gtips/*`
- Product groups/types/document types: ilgili sayfalar
- Device approval/account:
  - `app/(app)/device-requests/page.tsx`
  - `app/(app)/account/page.tsx`
- AI invoice import: `app/(app)/ai-invoice-import/page.tsx`

---

## 3) VERITABANI YAPISI (PRAKTIK OZET)

Asagidaki tablo listesi koddan ve migration'lardan dogrulanmis aktif kullanim setidir:

### 3.1 Ana is tablolari
- `orders`
- `order_items`
- `shipments`
- `shipment_orders`
- `suppliers`
- `products`
- `documents`
- `document_types`
- `order_documents`
- `order_payments`

### 3.2 Urun nitelik modeli
- `product_groups`
- `product_attributes`
- `product_attribute_values`
- `product_extra_attributes`
- `product_types`
- `product_type_compliance`
- `supplier_product_aliases`

### 3.3 Planlama / analiz
- `order_plan_entries`
- `order_plan_defaults`
- `order_plan_export_jobs`
- `order_plan_export_job_rows`
- `order_plan_export_job_codes`
- `product_sales_10y_totals`

### 3.4 RFQ modeli
- `rfqs`
- `rfq_items`
- `rfq_suppliers`
- `rfq_quotes`
- `rfq_quote_items`

### 3.5 Proforma modeli
- `proformas`
- `proforma_items`

### 3.6 Gumruk/GTIP
- `gtips`
- `gtip_country_rates`

### 3.7 Packing modeli
- `packing_lists`
- `packing_list_lines`
- `order_packing_list_items`
- `order_packing_list_summary`

### 3.8 Bridge/agent
- `mssql_bridge_agents`
- `mssql_bridge_requests`

### 3.9 Guvenlik/yonetim
- `user_roles`
- `trusted_devices`
- `device_verifications`
- `alerts`
- `tasks`

---

## 4) MIGRATION REFERANSI (TABLO KOKENI)

Asagidaki migrationlar kritik:

- `009_products.sql` -> urun ana modeli
- `021_gtips.sql`, `023_gtip_country_rates.sql` -> GTIP modeli
- `045_rfqs.sql` -> RFQ modeli
- `048_proformas.sql` -> proforma modeli
- `029_order_plan_entries.sql`, `050_order_plan_lead_safety.sql` -> plan defaults/entries
- `031_product_sales_10y_totals.sql` -> 10y totals
- `20260307110000_mssql_bridge.sql` -> bridge tablolari
- `20260421113000_order_plan_export_jobs.sql` -> export job modeli
- `20260403100000_trusted_devices.sql` -> cihaz onay modeli

Not: `orders`, `shipments`, `suppliers`, `documents` gibi cekirdek tablolarin olusturulmasi bu repo migration setinden once mevcut olabilir; uygulama bunlari aktif kullaniyor.

---

## 5) ENV / KONFIGURASYON MANTIGI

MSSQL tarafi:
- baglanti env'leri (server/db/user/pass/port)
- `MSSQL_BRIDGE_MODE` = `direct | agent | auto`
- `MSSQL_STOCK_SOURCE` (stok kaynagi)
- `MSSQL_SALES_SOURCE` (satis kaynagi)
- `MSSQL_SALES_RECENT_DAYS` (10 aylik pencere gunu; su an 310)

Supabase tarafi:
- service role ve anon key
- storage bucket/dokuman akislari

---

## 6) GELISTIRME PRENSIPLERI (BU PROJEDE FIILI OLARAK KULLANILAN)

1. Buyuk data setlerinde her zaman chunk + retry dusun.
2. UI ve export metrik tutarliligini birlikte test et.
3. Direct ve agent mod davranisini ayri ayri kontrol et.
4. Rol bazli gorunurlukte sadece UI degil action/API da kilitle.
5. Finansal hesaplarda formulu degistirince detay aciklama alanlarini da guncelle.
6. Changelog'u her anlamli degisiklikte guncelle.

---

## 7) HIZLI DEVIR CHECKLIST

Yeni agent proje devraldiktan sonra sirasiyla:

1. `CHANGELOG.md` son 20 kaydi oku.
2. `lib/live-mssql.ts` + `mssql-agent/agent-core.js` tarih penceresi/source uyumunu kontrol et.
3. Dashboard + order plan + export + supplier finance ekranlarini smoke test et.
4. Bir rol (`Satis`) ve bir yetkili rol (`Admin`/`Yonetim`) ile permission farklarini kontrol et.
5. RFQ -> order ve proforma -> plan etkisini dogrula.

---

## 8) DOSYA HARITASI (KISA)

- Dashboard: `app/(app)/page.tsx`
- Orders detay: `app/(app)/orders/[id]/page.tsx`
- Order item actions: `app/actions/order-items.ts`
- Suppliers:
  - liste: `app/(app)/suppliers/page.tsx`
  - detay: `app/(app)/suppliers/[id]/page.tsx`
- Products detay: `app/(app)/products/[id]/page.tsx`
- RFQ:
  - `app/(app)/rfqs/page.tsx`
  - `app/(app)/rfqs/[id]/page.tsx`
  - `app/api/rfq/*`
- Order plan:
  - `app/(app)/siparis-plani/page.tsx`
  - `components/OrderPlanLiveTable.tsx`
  - `app/api/order-plan/*`
- MSSQL logic:
  - `lib/live-mssql.ts`
  - `mssql-agent/agent-core.js`
- Migrationlar: `supabase/migrations/*`

---

Bu dosya "canli" handover dokumani olarak tutulmali.
Yeni bir ana mod degisikligi yapildiginda bu dosyada ilgili bolum mutlaka guncellenmeli.

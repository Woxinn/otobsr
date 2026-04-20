# Yonetici (Admin) Yetki Dokumani

Son guncelleme: 2026-04-20  
Kaynaklar: `lib/roles.ts`, `app/(app)/layout.tsx`, `app/(app)/**`, `app/actions/**`, `app/api/**`

## 1) Rol modeli (sistemin temel kurali)

- Roller: `Admin`, `Yonetim`, `Satis` (`lib/roles.ts`).
- Kritik yardimci kurallar:
  - `canEdit(role) => role === "Admin"` (tam duzenleme yetkisi sadece Admin).
  - `canViewFinance(role) => role === "Admin" || role === "Yonetim"`.
  - `canViewModule(role, moduleKey)`:
    - `Satis` sadece `orders` ve `products` gorebilir.
    - `Admin` ve `Yonetim` tum modulleri gorebilir.
- `requireAdminRole()` gecen server action'lar explicit olarak sadece Admin'e aciktir.

---

## 2) Admin'in menude gordugu tum sayfalar / butonlar

`app/(app)/layout.tsx` nav tanimina gore Admin tum modulleri gorur:

- Gosterge Paneli (`/`)
- Sevkiyatlar (`/shipments`)
- Siparisler (`/orders`)
- Urunler (`/products`)
- Siparis Plani (`/siparis-plani`)
- Konteyner Planlama (`/konteyner-planlama`)
- Teklif Talepleri (`/rfqs`)
- Proformalar (`/proformalar`)
- Urun Kategorileri (`/product-groups`)
- GTIP'ler (`/gtips`)
- TSE Bilgileri (`/product-types`)
- Belgeler (`/documents`)
- Tedarikciler (`/suppliers`)
- Lojistik Firmalari (`/forwarders`)
- Limanlar (`/ports`)
- Evrak Tipleri (`/document-types`)
- Kullanicilar (`/users`)

Admin'e ozel ek menu:
- `Cihaz Onaylari` (`/device-requests`) — sadece `role === "Admin"` iken gorunur.

Her rolde ortak:
- `Hesap Ayarlari` (`/account`)

Ek olarak (layout seviyesi):
- `TaskSyncBoot` ve `TaskPanel` Admin'de gorunur (`role !== "Satis"` kontrolu).

---

## 3) Sadece Admin'e acik sayfalar (route guard seviyesinde)

Bu sayfalar non-admin rolde `redirect("/")` ile engellenir:

- `app/(app)/users/page.tsx`
  - Kullanici listesi
  - Rol degistirme (`Kaydet`)
  - Kullanici silme (`Sil`)
  - `Yeni kullanici ekle` linki
- `app/(app)/admin/new-user/page.tsx`
  - Yeni kullanici olusturma formu
- `app/(app)/device-requests/page.tsx`
  - Bekleyen cihaz taleplerinde:
    - `Onayla`
    - `Reddet`
  - Onayli cihazlarda:
    - `Cihazi kaldir`

---

## 4) Admin'in duzenleme/yazma yaptigi ana is alanlari

`canEdit(role)` kontrollerine gore pratikte Admin'e acik duzenleme alanlari:

- Siparisler:
  - Yeni siparis (`/orders/new`)
  - Siparis duzenleme (`/orders/[id]/edit`)
  - Siparis kalemi duzenleme (`/orders/[id]/items/[itemId]/edit`)
  - Liste ve detayda edit/sil/arsivleme ile ilgili aksiyon butonlari (`canEditPage`)
- Urunler:
  - Yeni urun (`/products/new`)
  - Urun duzenleme (`/products/[id]/edit`)
- Sevkiyatlar:
  - Yeni sevkiyat (`/shipments/new`)
  - Sevkiyat duzenleme (`/shipments/[id]/edit`)
  - Liste/detay aksiyonlari (`canEditPage`)
- Proformalar:
  - Silme islemleri (`allowDelete = canEdit(role)`)

Not: `Yonetim` rolu goruntuleyebilir ama `canEdit=false` oldugu yerlerde bu aksiyonlari goremez.

---

## 5) Explicit Admin zorunlu server action'lar

Asagidaki action dosyalarinda `requireAdminRole()` geciyor; bu islemler yalnizca Admin tarafinda calisir:

- `app/actions/device-requests.ts`
  - cihaz talebi onay/red, onayli cihazi geri alma
- `app/actions/order-documents.ts`
  - siparis evrak silme
- `app/actions/order-items.ts`
  - siparis kalemi create/update/delete/import ve eksik urun tamamlama akislari
- `app/actions/order-packing-list.ts`
  - packing list import/ozet/satir create-delete islemleri
- `app/actions/order-payments.ts`
  - odeme ekleme/silme
- `app/actions/orders.ts`
  - siparis create/update/delete, durum guncelleme, arsiv/islem toplu guncelleme
- `app/actions/products.ts`
  - urun, urun grubu, ozellik, import ve bulk islemleri

Bu alanlar Admin tarafinda "duzenleyebildigi" en kritik backend guvenceli bolgelerdir.

---

## 6) API seviyesinde Admin'in fiilen yetkili oldugu (Satis'in engellendigi) alanlar

Asagidaki endpointlerde `role === "Satis"` engeli veya role-check var; dolayisiyla Admin bu endpointleri kullanabilir:

- `app/api/order-plan/route.ts`
- `app/api/order-plan/bulk/route.ts`
- `app/api/sales-10y-sync/route.ts`
- `app/api/tasks/sync/route.ts`
- `app/api/discrepancy-runs/route.ts`
- `app/api/export-gumruk/route.ts`
- `app/api/netsis-import/route.ts`
- `app/api/products-code-update/route.ts`
- `app/api/products-import-update/route.ts`
- `app/api/proformas/route.ts`
- `app/api/rfq/*` (route, supplier, status, import vb. role kontrolu olanlar)
- `app/api/orders/[id]/insurance-form/route.ts`

Ek rol-kontrolu:
- Finans bazli endpointler (`canViewFinance`) Admin ve Yonetim'e acik:
  - `app/api/orders/[id]/insurance-mail/send/route.ts`
  - `app/api/products/cost-data/route.ts`
- Modul bazli endpointler (`canViewModule`) Admin'e acik:
  - `app/api/products/live-stock/route.ts`
  - `app/api/products/search/route.ts`
  - `app/api/products/availability/route.ts`
  - `app/api/rfq/*` icindeki modul kontrollu endpointler

---

## 7) Finans gorunurlugu (Admin + Yonetim)

`canViewFinance` kullanan sayfa/bolumler:

- Dashboard finans kartlari: `app/(app)/page.tsx`
- Siparis liste/detay finans kolonlari: `app/(app)/orders/page.tsx`, `app/(app)/orders/[id]/page.tsx`
- Urun liste/detay maliyet/finans kolonlari: `app/(app)/products/page.tsx`, `app/(app)/products/[id]/page.tsx`
- Tedarikci detay finans alani: `app/(app)/suppliers/[id]/page.tsx`
- Sigorta e-posta sayfasi: `app/(app)/orders/[id]/insurance-mail/page.tsx`
- Beyanname lab: `app/(app)/orders/[id]/beyanname-lab-q9m2/page.tsx`

Admin bu alanlarin tamamini gorur; Satis gormez.

---

## 8) Sayfa bazli ozet (Admin acisindan)

- Admin tum modulleri gorur (menu kisiti yok).
- Admin tum "canEdit" kapilarindan gecer (create/edit/delete UI acilir).
- Admin'e ozel operasyon ekranlari:
  - Kullanici-rol yonetimi
  - Yeni kullanici olusturma
  - Cihaz onaylari
- Admin, `requireAdminRole` ile korunan tum server action'lari calistirabilir.

---

## 9) Teknik risk / notlar (onemli)

Asagidaki action dosyalarinda explicit `requireAdminRole()` yok; yetki daha cok UI/route gorunurlugune dayaniyor:

- `app/actions/users.ts` (service role ile calisiyor)
- `app/actions/shipments.ts`
- `app/actions/order-plan.ts`
- `app/actions/master-data.ts`, `app/actions/gtips.ts`, `app/actions/product-types.ts`, vb. bazi dosyalar

Bu dosyalarda backend tarafinda ek rol kontrolu isteniyorsa ayrıca sertlestirme yapilmasi onerilir.

---

## 10) Hizli referans (Admin buton ornekleri)

- Layout: `Cihaz Onaylari`, `Hesap Ayarlari`, tum moduller
- Users:
  - `Yeni kullanici ekle`
  - `Kaydet` (rol degistir)
  - `Sil` (kullanici sil)
- Device Requests:
  - `Onayla`, `Reddet`, `Cihazi kaldir`
- Orders:
  - `+ Yeni Siparis`
  - Detayda edit/arsiv/kalem aksiyonlari (`canEditPage` bloklari)
- Shipments:
  - `Yeni Sevkiyat`, `Duzenle`, durum/iliski aksiyonlari (`canEditPage`)
- Products:
  - `Yeni Urun`, `Duzenle` (canEdit kapilari)
- Proformas:
  - `Sil` aksiyonlari (`allowDelete`)


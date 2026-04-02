# Changelog

Bu dosya uygulama değişikliklerini sürüm bazında takip eder.

## v0.3.454 - 2026-04-02

- Görünen metinlerdeki Türkçe karakter ve bozuk encoding sorunları temizlendi
- Loading ekranı, sipariş/ürün ekranları ve changelog metinleri UTF-8 Türkçe ile düzeltildi

## v0.3.453 - 2026-04-02

- Satış rolünün erişimleri daha sıkılaştırıldı:
  - orders/products dışı sayfalara route seviyesinde erişim kapatıldı
  - orders/products mutasyonları server tarafında engellendi
  - tedarikçi filtresi, ödeme filtresi, incoterm filtresi ve görev paneli satış rolünden kaldırıldı
  - sipariş detayında gümrük export, fatura import, packing import, shipment, navlun sigortası, ağırlık ve çeşitli export/import yüzeyleri gizlendi
- RFQ import akışı güçlendirildi:
  - eksik katalog ürünleri için taslak ürün oluşturup importa devam etme eklendi
  - eksik ürün/eksik katalog ürünleri için daha net hata ve aksiyon akışı eklendi
  - hedef fiyat ve adet birlikte importta güncellenir hale getirildi
- RFQ fiyat karşılaştırma tablosu geliştirildi:
  - ürün sütunu sticky hale getirildi
  - satır bazlı masraf % override eklendi
  - satır bazlı kâr % override eklendi
  - KDV'siz maliyet ve satış fiyatı anlık hesaplanır hale getirildi
- MSSQL stok performansı iyileştirildi:
  - stok sorguları batch hale getirildi
  - kısa süreli stock cache eklendi
  - products listesi içindeki veri toplama daha paralel hale getirildi
- Loading sistemi toparlandı:
  - route overlay loader yeniden düzenlendi
  - upload/import işleri için ortak branded loading altyapısı eklendi
  - download/template linkleri route loader dışına alındı
- Versiyon sistemi merkezileştirildi:
  - uygulama içinde görünen version badge merkezi hale getirildi
  - favicon kaynağı `public/favicon.png` üzerine sabitlendi
- Build altyapısı düzeltildi:
  - Next 16 uyumsuz `middleware` yapısı `proxy.ts` olarak taşındı
  - build için daha stabil webpack yolu ve worker kısıtları tanımlandı
  - TypeScript / route param / searchParams uyumsuzlukları temizlendi

## Not

- Bundan sonra ben yaptığım her anlamlı değişiklikte:
  - `CHANGELOG.md` içine yeni madde ekleyeceğim
  - sürüm numarasını güncelleyeceğim
- Aksi bir format istemezsen mevcut düzende devam ederim.

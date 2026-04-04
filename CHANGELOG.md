# Changelog

Bu dosya uygulama değişikliklerini sürüm bazında takip eder.

## v0.3.474 - 2026-04-03

- `stokhar` kaynaklı canlı stok sorgusu programdaki akışa yaklaştırıldı
- `TBLSTOKHAR.TARIH` filtresi yıl başı ile bugünün sonu arasına sınırlandı
- Canlı stok hesabı hem web uygulamasında hem agent tarafında aynı tarih aralığı mantığıyla çalışacak hale getirildi

## v0.3.473 - 2026-04-03

- `stokhar` kaynaklı canlı stok hesabında `GCKOD` yorumlaması netleştirildi
- Stok bakiyesi artık yalnız `G` giriş ve `C` çıkış hareketlerini dikkate alacak şekilde hesaplanıyor

## v0.3.472 - 2026-04-03

- Webpack `watchOptions.ignored` yapılandırması sadeleştirildi
- Geliştirme açılışında oluşan geçersiz webpack config hatası giderildi

## v0.3.471 - 2026-04-03

- Geliştirme ortamında `mssql-agent/dist` klasörü webpack watcher kapsamından çıkarıldı
- Agent heartbeat/status dosyası güncellendiğinde ürün detay gibi ekranlarda oluşan sürekli yenilenme sorunu azaltıldı

## v0.3.470 - 2026-04-03

- Canlı stok için alternatif `TBLSTOKSB + TBLSTOKHAR` bakiye sorgusu eklendi
- Stok kaynağı `MSSQL_STOCK_SOURCE=stokhar` ile açılabilecek şekilde feature flag yapısına alındı
- Web uygulaması agent modda stok kaynağını payload ile iletecek hale getirildi; sonraki kaynak değişimlerinde agent env bağımlılığı azaltıldı

## v0.3.469 - 2026-04-03

- Login ekranı açık renk temaya çevrildi
- Form kartı ve animasyonlu arka plan daha aydınlık, daha yumuşak bir görünüm aldı

## v0.3.468 - 2026-04-03

- Giriş ekranı sadeleştirildi; form dışındaki pazarlama blokları kaldırıldı
- Login sayfasına düşük dikkat dağıtan, sürekli dönen animasyonlu arka plan eklendi
- Giriş ekranındaki bozuk Türkçe karakterler temizlendi

## v0.3.467 - 2026-04-03

- Geliştirme scripti `next dev --webpack` olarak değiştirildi
- Turbopack kaynaklı `ChunkLoadError` ve parça önbelleği tutarsızlıklarını azaltmak için geliştirme ortamı webpack tabanına alındı

## v0.3.466 - 2026-04-03

- Admin onayı geldikten sonra `device-check` ekranına yönlendirme öncesi kısa bir geçiş/yükleniyor durumu eklendi
- Güvenilir cihaz kaydı tamamlanırken kullanıcıya görsel bekleme geri bildirimi gösterilmeye başlandı

## v0.3.465 - 2026-04-03

- `device-check` ekranındaki otomatik cihaz talebi isteği tek seferlik hale getirildi; hata durumunda sonsuz yeniden deneme döngüsü kesildi
- Cihaz talebi ve durum sorgularında en güncel kaydı almak için sorgular `limit(1)` ile sertleştirildi
- Cihaz talebi oluşturma hataları geliştirme ortamında daha açıklayıcı `detail` mesajıyla dönmeye başladı

## v0.3.464 - 2026-04-03

- `device-check` ekranında geliştirme ortamı için cihaz talebi hataları daha görünür hale getirildi
- API `detail` alanı varsa kullanıcı ekranında ve tarayıcı konsolunda gösterilmeye başlandı

## v0.3.463 - 2026-04-03

- Admin cihaz onayı mail akışı güçlendirildi
- Admin alıcıları artık sadece `user_roles.email` alanına bağlı kalmadan auth kullanıcıları üzerinden de çözümleniyor
- Bir admin alıcısındaki hata tüm bildirimi düşürmeyecek şekilde kısmi gönderim desteği eklendi
- Geliştirme ortamında cihaz talebi hataları daha açıklayıcı `detail` alanıyla dönmeye başladı

## v0.3.462 - 2026-04-03

- Cihaz onayı akışı kullanıcı e-postası yerine admin onayı modeline çevrildi
- Onaysız cihaz ekranına 2 dakikalık geri sayım, polling ve `Yeni onay iste` akışı eklendi
- Admin için merkezi `Cihaz Onayları` ekranı eklendi; bekleyen talepler onaylanabilir, reddedilebilir ve onaylı cihazlar kaldırılabilir
- Hesap Ayarları ekranından kullanıcı cihaz listesi kaldırıldı, sayfa yalnızca parola değişimine indirildi
- Admin bildirim e-postaları Resend üzerinden gönderilir hale getirildi

## v0.3.461 - 2026-04-03

- Cihaz onay e-postaları Supabase OTP yerine Resend üzerinden gönderilecek şekilde değiştirildi
- Resend için sıfır ek paketle çalışan ortak e-posta yardımcıları eklendi
- Cihaz onay maili hatalarında sunucu logları daha açıklayıcı hale getirildi

## v0.3.460 - 2026-04-03

- `device-check` ekranına çıkış yap butonu eklendi
- Cihaz doğrulama ekranındaki görünen bozuk Türkçe karakterler düzeltildi

## v0.3.459 - 2026-04-03

- Hesap için onaylı cihaz akışı eklendi
- Giriş sonrası onaysız cihazlar `device-check` ekranına yönlendirilir hale geldi
- E-posta onay bağlantısı ile cihazı güvenilir cihazlara ekleyen akış eklendi
- Hesap Ayarları sayfası eklendi; kullanıcılar onaylı cihazlarını görebilir, adlandırabilir, kaldırabilir ve şifrelerini değiştirebilir
- Satış rolü için de `Hesap Ayarları` erişimi açıldı

## v0.3.458 - 2026-04-02

- Beyanname lab ekranında `KDV matrahı` daha görünür hale getirildi
- Damga vergisi ayrı bir kalem olarak tabloya ve toplam kartlarına eklendi
- Ödenecek vergi toplamı hesabına damga vergisi de doğrudan dahil edildi

## v0.3.457 - 2026-04-02

- Beyanname lab ekranına manuel `damga vergisi`, `depo masrafı`, `banka masrafı` ve `diğer` alanları eklendi
- Bu ek giderler KDV matrahına ve nihai vergili maliyet hesabına dahil edildi
- Gözetim, gümrük vergisi, ilave gümrük vergisi, anti-damping ve KDV toplamları ayrı kartlarda görünür hale getirildi

## v0.3.456 - 2026-04-02

- Görünen İngilizce arayüz terimleri yerelleştirildi
- Menüde Dashboard, Shipments ve Forwarders gibi başlıklar yaygın Türkçe karşılıklarına çevrildi
- RFQ ve yapay zeka fatura aktarımı ekranlarındaki başlıklar ve yardımcı metinler Türkçeleştirildi

## v0.3.455 - 2026-04-02

- Kalan sayfalardaki mojibake ve yazım hataları temizlendi
- Tedarikçi, GTİP, ürün tipi ve sipariş planı ekranlarında görünen metinler düzeltildi
- Bazı normalize ve packing akışlarındaki bozuk Türkçe karakter eşleştirmeleri doğru karakterlerle güncellendi

## v0.3.454 - 2026-04-02

- Görünen metinlerdeki Türkçe karakter ve bozuk encoding sorunları temizlendi
- Loading ekranı, sipariş/ürün ekranları ve changelog metinleri UTF-8 Türkçe ile düzeltildi

## v0.3.453 - 2026-04-02

- Satış rolünün erişimleri sıkılaştırıldı
- Orders ve products dışı sayfalara route seviyesinde erişim kapatıldı
- Orders ve products mutasyonları server tarafında engellendi
- Tedarikçi, ödeme ve incoterm filtreleri ile görev paneli satış rolünden kaldırıldı
- Sipariş detayında gümrük export, fatura import, packing import, shipment, navlun sigortası, ağırlık ve çeşitli export/import yüzeyleri gizlendi
- RFQ import akışı eksik katalog ürünleri için taslak ürün oluşturup devam edecek şekilde güçlendirildi
- RFQ fiyat karşılaştırma tablosuna satır bazlı masraf ve kâr override alanları eklendi
- MSSQL stok sorguları batch hale getirildi ve kısa süreli cache eklendi
- Loading sistemi toparlandı, download/template linkleri route loader dışına alındı
- Versiyon sistemi merkezileştirildi ve favicon kaynağı `public/favicon.png` üstüne sabitlendi
- Build altyapısındaki Next 16 ve TypeScript uyumsuzlukları temizlendi

## Not

- Bundan sonra yaptığım her anlamlı değişiklikte `CHANGELOG.md` güncellenecek
- Sürüm numarası da aynı turda artırılacak

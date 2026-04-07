# Changelog

Bu dosya uygulama değişikliklerini sürüm bazında takip eder.

## v0.3.500 - 2026-04-07

- Inbound siparis eslestirme algoritmasi query zinciri yerine tek havuzda normalize+skor modeline gecirildi
- `ETKT-30`, `ETKT 30`, `etkt30` varyasyonlari ayni kod kabul edilerek exact eslesme agirligi ciddi artirildi
- Subject taramasinda 5000 siparise kadar aday alinip konu icindeki kod/ad ve token parcalariyla puanlanarak en isabetli siparis seciliyor

## v0.3.499 - 2026-04-07

- Inbound siparis eslestirmesine kod parcali arama eklendi (`ETKT-30` -> `ETKT` + `30`)
- Tire/ayrac farklarinda (`-`, bosluk, farkli unicode ayrac) konu-siparis eslesmesi daha toleransli hale getirildi

## v0.3.498 - 2026-04-07

- Inbound subjectten siparis bulma akisi genisletildi: konu kuyrugu, son `-` parcasi ve alfanumerik kod adaylariyla ek arama yapiliyor
- Siparis aday havuzu buyutulerek (1200 kayit) gecmis siparislerde eslesme kacirma riski azaltildi
- Eslesme olmazsa donen sebep metnine parse edilen subject eklenerek debug kolaylastirildi

## v0.3.497 - 2026-04-06

- Inbound sigorta police importunda ek filtresi `Poliçe_TR` yerine `Police_` prefix'ine genislatildi
- Tek ek yerine `Police_` ile baslayan tum ekler ayni siparise navlun sigortasi belgesi olarak yuklenir hale getirildi
- Ayni dosya adina sahip mevcut kayitlar duplicate kabul edilip atlanacak sekilde idempotentlestirildi

## v0.3.496 - 2026-04-06

- Sigorta mail subject eslestirmesi `RE:/FW:` on-eklerini temizleyecek sekilde sertlestirildi
- Siparis bulma sorgusu exact yerine `%...%` ilike ile genisletildi; `RE: Navlun Sigortasi Talebi - ETKT-30` gibi konularda eslesme duzeltildi

## v0.3.495 - 2026-04-06

- Resend inbound webhook'u `proxy` auth redirectine takilmasin diye `/api/resend/inbound` ve `/api/insurance-mail/ingest` route'lari auth kontrolunden muaf tutuldu
- Resend'de gorunen `307 Temporary Redirect` sorununun nedeni olan login yonlendirmesi giderildi

## v0.3.494 - 2026-04-06

- Resend inbound webhook endpointi eklendi: `POST /api/resend/inbound`
- `email.received` eventinden `Poliçe_TR` eki cekilip mevcut otomatik navlun sigorta import akisina baglandi
- Sigorta policy import mantigi ortak helper'a alinip (`lib/insurance-policy-import.ts`) hem manuel ingest hem webhook tarafinda tekrar kullanildi

## v0.3.493 - 2026-04-06

- Sigorta police maili icin kolay kaldirilabilir otomatik import endpointi eklendi: `POST /api/insurance-mail/ingest`
- Ozellik env flag ile kontrol ediliyor (`INSURANCE_POLICY_AUTO_IMPORT_ENABLED=true`) ve secret header ile korunuyor (`x-insurance-ingest-secret`)
- Konudan siparis eslestirme + `Poliçe_TR` eki filtreleme + mevcut navlun sigorta belgesi varsa tekrar yuklememe kurali eklendi

## v0.3.492 - 2026-04-06

- Sigorta maili gonderiminde konu satiri shipment/flotan yerine siparis adini kullanacak sekilde guncellendi
- Mail composer, API'ye `orderLabel` gonderecek sekilde genisletildi
- Konu olusturmada siparis adi yoksa mevcut flotan fallback'i korunarak geriye donuk uyumluluk saglandi

## v0.3.491 - 2026-04-06

- GTIP kaydina `insurance_emtea_cinsi` alani eklendi (migration + create/update formlari)
- Sigorta formu uretiminde emtea cinsi artik siparisteki urunlerin GTIP emtea cinsi alanlarindan otomatik derleniyor
- GTIP emtea cinsi bossa mevcut urun adi bazli fallback korunarak akisin bozulmasi engellendi

## v0.3.490 - 2026-04-06

- Alt sabit ulke bazli KDVsiz maliyet seridine ulke bazli birim fiyat girisi eklendi
- Her ulke karti kendi birim fiyatiyla anlik KDVsiz maliyet sonucu verecek sekilde guncellendi
- Genel birim fiyati tek tikla tum ulke kartlarina kopyalama aksiyonu eklendi

## v0.3.489 - 2026-04-06

- Maliyet ekranı ürün araması, ürünler modülündeki token bazlı filtre davranışıyla hizalandı
- Çoklu kelime aramada her kelime için ayrı `or` filtresi uygulanarak isabet artırıldı
- Hızlı arama önerilerinde aday ürün limiti yükseltilerek geniş veri setinde kaçırma azaltıldı

## v0.3.488 - 2026-04-06

- Ürün maliyet ekranı hızlı aramasında token bazlı eşleştirme geliştirildi
- Arama artık çoklu parça sorguda (ör. `17 2100`) kod ve isimde tüm parçaları birlikte arıyor
- Sonuçlar kod eşleşmesini öne çıkaracak şekilde skorlanıp daha doğru sıralanıyor

## v0.3.487 - 2026-04-06

- Ürün maliyet ekranına route değiştirmeden çalışan hızlı ürün geçişi eklendi
- Ürün arama, son kullanılan ürünler ve favori ürünler aynı sayfada erişilebilir hale getirildi
- Yeni `/api/products/cost-data` endpoint'i ile seçilen ürünün maliyet verisi dinamik yüklenmeye alındı

## v0.3.486 - 2026-04-06

- Sigorta e-posta hazirlama ekranina `Hazir alicilar` bolumu eklendi
- Preset alicilar env'den (`INSURANCE_MAIL_PRESETS`) okunup tek tikla alici alanina ekleniyor
- Alici birlestirme akisi duplicate adresleri otomatik temizleyecek sekilde guncellendi

## v0.3.485 - 2026-04-06

- Sigorta e-postası metni Türkçe karakterlerle güncellendi
- İçerik "Merhabalar, ekteki sigorta bilgi formu doğrultusunda navlun sigortasını oluşturmanızı rica ederim." çerçevesine alındı
- Konu ve bilgi kartı etiketlerinde Türkçe karakter kullanımı düzeltildi

## v0.3.484 - 2026-04-06

- Sigorta e-postasi gonderiminden sonra SweetAlert benzeri basari popup'i eklendi
- Popup icinde gonderilen alici e-posta adresleri liste halinde gosteriliyor

## v0.3.483 - 2026-04-06

- Navlun sigortasi mail tasarimina marka logosu eklendi
- Logo URL'i env ile yonetilebilir hale getirildi (`INSURANCE_MAIL_LOGO_URL` / `MAIL_BRAND_LOGO_URL`)
- Env verilmezse uygulama domainindeki `/logo.gif` fallback olarak kullaniliyor

## v0.3.482 - 2026-04-06

- Navlun sigortasi e-postasi cihaz onay mailine benzer kartli bir HTML tasarima alindi
- E-posta icerigi ortak helper ile uretilecek sekilde merkezilestirildi
- Duzenlenebilir formdan gelen metinler HTML escape edilerek guvenli hale getirildi

## v0.3.481 - 2026-04-06

- Navlun sigortasi icin duzenlenebilir e-posta hazirlama sayfasi eklendi
- Siparisten cekilen form alanlari bu ekranda degistirilebilir hale getirildi
- Girilen alicilara Excel ekli Resend gonderimi eklendi
- Siparis detayina `Sigorta e-postasi hazirla` aksiyonu eklendi

## v0.3.480 - 2026-04-06

- Navlun sigortası formundaki shipment verisi dolaylı join yerine doğrudan `shipments` sorgusuyla okunacak şekilde sertleştirildi
- Gemi adı, IMO ve bayrak bilgilerinin shipment kaydından daha tutarlı çekilmesi sağlandı

## v0.3.479 - 2026-04-06

- Shipment oluşturma ve düzenleme ekranlarından konşimento alanı kaldırıldı
- Shipment detayında konşimento bilgisi artık bağlı siparişlerden çekilip gösteriliyor
- Navlun sigortası formu konşimento bilgisini shipment yerine doğrudan siparişten alacak şekilde netleştirildi

## v0.3.478 - 2026-04-06

- Shipment kayıtlarına `gemi adı`, `IMO` ve `gemi bayrağı` alanları eklendi
- Yeni shipment ve shipment düzenleme ekranları bu alanları kaydedecek şekilde genişletildi
- Navlun sigortası formu artık bu gemi bilgilerini shipment kaydından otomatik çekiyor

## v0.3.477 - 2026-04-06

- Beyanname Lab'daki manuel masraf alanlarına para birimi seçimi eklendi
- Navlun, sigorta, damga, depo, banka ve diğer tutarları `TRY` veya sipariş para birimiyle girilebiliyor
- Girilen tutarlar seçilen kura göre arka planda normalize edilip tabloda TL karşılığına yansıtılıyor

## v0.3.476 - 2026-04-06

- Sipariş detayı için navlun sigortası bilgi formu Excel exportu eklendi
- Form, sipariş, bağlı shipment, packing özeti ve ürün kalemlerinden otomatik dolduruluyor
- Sipariş ekranına tek tıkla indirme butonu eklendi ve download akışı route loader dışında tutuldu

## v0.3.475 - 2026-04-06

- RFQ oluşturma ekranındaki ürün importu Excel dosyalarında daha toleranslı hale getirildi
- `.xlsx`, `.xls`, `.xlsm`, `.xlsb` ve `.csv` dosyaları aynı yükleme alanından kabul ediliyor
- Başlıksız dosyalarda ilk sütun ürün kodu, ikinci sütun adet olarak okunacak şekilde esneklik eklendi

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

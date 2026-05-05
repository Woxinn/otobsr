# Changelog

Bu dosya uygulama değişikliklerini sürüm bazında takip eder.

## v0.3.604 - 2026-05-05

- Siparis plani satis metriklerinde stok kodu eslesme modu varsayilan olarak `exact` yapildi
- Boylece `LIKE prefix` kaynakli fazla satis toplami riski azaltildi
- Web (`lib/live-mssql.ts`) ve agent (`mssql-agent/agent-core.js`) tarafina `MSSQL_SALES_MATCH_MODE` env destegi eklendi (`exact|prefix`)

## v0.3.603 - 2026-05-05

- Siparis plani `2026 YTD` satis sorgularinda ust tarih siniri bugune sabitlendi (`< endDate`)
- Boylece ileri tarihli hareketlerin YTD toplamina yanlislikla dahil olmasi engellendi
- Duzeltme hem web MSSQL katmanina (`lib/live-mssql.ts`) hem agent katmanina (`mssql-agent/agent-core.js`) uygulandi

## v0.3.602 - 2026-05-05

- Siparis plani satis referansi rolling pencere yerine sadece `2026 YTD` olacak sekilde guncellendi (2025 ve onceki veriler dislandi)
- Web (`lib/live-mssql.ts`) ve MSSQL agent (`mssql-agent/agent-core.js`) satis sorgulari yil basi (`01.01.2026`) baslangicina hizalandi
- Siparis plani tablo ve export kolon etiketleri `2026 YTD` olacak sekilde guncellendi
- Plan hesap ciktilarina `multiplier`, `use_core_quantity`, `final_order_quantity` alanlari eklendi; varsayilan final miktar trend bazli oneridir

## v0.3.601 - 2026-05-05

- RFQ detay urun satirlarinda miktar (`quantity`) alanina inline duzenleme eklendi
- `/api/rfq/item` PATCH endpoint'i genisletildi; artik hedef fiyat disinda miktar/kod/ad guncellemesini de destekler
- Boylece RFQ'ya eklenen urun kalemleri ekrandan hizli duzenlenebilir hale geldi

## v0.3.600 - 2026-05-04

- `Tip & Uyumluluk` ekraninda P3 kapsaminda satir-ici hizli duzenleme eklendi
- Uyumluluk kayitlarinda ulke/TSE/analiz/TAREKS/rapor/valid_from/valid_to alanlari satirdan kaydedilebilir hale getirildi
- `valid_to` icin hizli uzatma aksiyonlari eklendi (`+30 gun`, `+90 gun`)

## v0.3.599 - 2026-05-04

- RFQ importta `Varolanla eslestir / Yeni olustur` secim listesinin uzun kayitlarda tasmasi engellendi
- Eksik urun secim alani ve arama sonuc listesi scrollable hale getirildi

## v0.3.598 - 2026-05-04

- `Tip & Uyumluluk` ekranina P2 iyilestirmesi olarak hizli filtre chipleri eklendi
- Durum bazli filtreler: tum, aktif, 30 gunde bitecek, suresi gecmis, tarihsiz, kayitsiz tipler
- Tip/ulke/TSE/TAREKS alanlarini kapsayan serbest arama kutusu eklendi

## v0.3.597 - 2026-05-04

- `Tip & Uyumluluk` ekrani bilgi mimarisi iyilestirildi (ust ozet kartlari eklendi)
- Uyumluluk kayitlarina durum etiketi eklendi: `Aktif`, `Yakinda bitecek`, `Suresi gecmis`, `Tarihsiz`
- Tip icindeki uyumluluk satirlari risk onceligine gore siralanir (suresi gecmis/en yakin bitecek once)

## v0.3.596 - 2026-05-04

- Gumrukcu Excel olusturma akisinda (`/api/export-gumruk`) TSE/uyumluluk secimi guncellendi
- `valid_to` tarihi gecmis uyumluluk kayitlari artik secime dahil edilmez
- Uygun kayit seciminde sadece tarih araliginda aktif (`valid_from <= bugun <= valid_to`) satirlar kullanilir

## v0.3.595 - 2026-04-30

- Siparis detayina urun kalemleri icin `Hizli duzenleme` alani eklendi
- Kalem bazinda adet, birim fiyat, toplam net kg ve toplam brut kg alanlari toplu ve tek seferde guncellenebilir hale getirildi
- Yeni server action: `bulkUpdateOrderItems` (toplu kayit + order toplamlarini yeniden hesaplama)

## v0.3.594 - 2026-04-30

- Tedarikciler listesi tablosuna `Bakiye` sutunu eklendi
- Bakiye, siparis toplam tutari ile `Odendi` durumundaki odemeler farkindan hesaplanir
- `Kalan odeme` kirmizi, `Fazla odeme` yesil renk badge ile gosterilir

## v0.3.593 - 2026-04-30

- Tedarikci detay finans ozetinde `Kalan` ve `Fazla odeme` ayri kartlari tek bir `Bakiye` gostergesinde birlestirildi
- Bakiye karti, `Toplam - Odenen` isaretine gore otomatik olarak `Kalan odeme` veya `Fazla odeme` olarak etiketlenir

## v0.3.592 - 2026-04-30

- Tedarikci detay `Finans ozeti` bolumune `Fazla odeme` gostergesi eklendi
- `Toplam odenen > Toplam fatura` durumunda fark tutari artik ayri kartta gorunur

## v0.3.591 - 2026-04-30

- Gosterge paneli finans alanina `Kalan Odemesi Olan Siparisler` bolumu eklendi
- Her siparis icin kalan odeme tutari, para birimi ve siparis detaya hizli gecis linki gosterilir
- Liste kalan tutara gore buyukten kucuge siralanir

## v0.3.590 - 2026-04-28

- Tedarikci detay sayfasina `Bagli RFQ'lar` bolumu eklendi (`rfq_suppliers` uzerinden)
- Urun detay sayfasina `Bagli RFQ'lar` bolumu eklendi (`rfq_items` uzerinden)
- Urun detayinda her RFQ icin ilgili urunun toplam RFQ adedi gosterilir ve RFQ detaya tek tikla gidilebilir

## v0.3.589 - 2026-04-28

- MSSQL bridge agent tarafindaki `sales.aggregate` penceresi 120 gunden 310 gune guncellendi
- Boylece `MSSQL_BRIDGE_MODE=agent` kullaniminda da siparis plani 10 aylik satis 2025 verisini kapsar
- Agent icin opsiyonel `MSSQL_SALES_RECENT_DAYS` env destegi eklendi (varsayilan: 310)

## v0.3.588 - 2026-04-28

- Siparis plani canli metrik fetch akisi buyuk listelerde eksik satir riskini azaltacak sekilde sertlestirildi
- Chunk boyutu ve paralellik dusuruldu (`180` kod, `2` worker) ve her chunk icin otomatik tekrar deneme eklendi
- Tek chunk hatasinda tum metrik haritasi sifirlanmaz; gelen parcali veriler korunur

## v0.3.587 - 2026-04-28

- Siparis plani canli satis penceresi 300 gunden 310 gune cikarildi
- Tarih araligi gostergesi bu yeni pencereye gore otomatik guncellenir

## v0.3.586 - 2026-04-27

- Siparis plani canli metrik API'sine tarih penceresi bilgisi eklendi (`recent`, `last60`, `prev60`)
- Siparis plani tablosunda hangi satis tarih araliklarindan veri cekildigi gorunur bilgi satiri olarak gosterilmeye baslandi
- Boylece 10 aylik pencereye gecis sonrasi ekranda dogrudan baslangic/bitis tarihleri teyit edilebilir

## v0.3.585 - 2026-04-27

- Siparis plani canli satis penceresi 4 ay (120 gun) yerine 10 ay (300 gun) olacak sekilde guncellendi
- Bu degisiklik `sales120` alaninin dolduruldugu MSSQL sorgu penceresine uygulandi (geriye donuk alan adi korunarak)
- Siparis plani ve export kolon etiketleri `10 aylik satis` / `10A` olarak guncellendi

## v0.3.584 - 2026-04-27

- Tedarikci detay `Finans ozeti` alanina `Kalan` karti eklendi
- Kalan tutar, `Toplam - Odenen` formulune gore hesaplanip gosterilir

## v0.3.583 - 2026-04-23

- 10 yillik satis manuel import akisi buyuk dosyalar icin chunk tabanli hale getirildi (`/api/sales-10y-import/chunk`)
- Import UI tarafina ilerleme cubugu eklendi (chunk bazli yuzde ve adim bilgisi)
- `Cannot read properties of null (reading 'reset')` hatasi form referansi sabitlenerek giderildi
- Veritabanimda olmayan stok kodlari import sirasinda atlanir; islem devam eder ve eslesmeyen sayisi raporlanir

## v0.3.582 - 2026-04-23

- Siparis plani 10 yillik satis alanina manuel import akisi eklendi (`POST /api/sales-10y-import`)
- CSV/XLSX dosyasindan `stok_kodu` + `adet/total_10y` okunup `product_sales_10y_totals` tablosuna upsert edilir
- `Sales10ySyncButton` uzerine dosya secimli tek seferlik import formu eklendi

## v0.3.581 - 2026-04-23

- Siparis plani export job akisinda `proforma acik` ve `yolda` toplamlari buyuk urun setleri icin chunk'landi
- `product_id in (...)` filtreleri 6000+ kalemde limitlere takilmasin diye daha kucuk parcalarla (120) calisacak sekilde sertlestirildi
- Proforma/yolda sorgularinda sessizce sifira dusmek yerine hata durumunda export olusturma adimi fail-fast olacak sekilde guncellendi

## v0.3.580 - 2026-04-22

- Forwarder detay teklif tablosunda aktif olmayan/silinmis shipment referanslari `Shipment silindi` badge'i ile gosterilir
- Bu satirlarda shipment linki kapatildi ve `Sec` aksiyonu devre disi birakildi
- Forwarder detaydaki shipment secim/veri listesi arsivlenmis (`archived_at` dolu) shipmentleri dislayacak sekilde daraltildi

## v0.3.579 - 2026-04-22

- Forwarder teklif tablosundaki badge stilleri duzenlendi; yarim/kesik gorunum sorunu giderildi
- Tum badge'lerde `inline-flex + whitespace-nowrap + line-height` standardi ile sabit okunurluk saglandi
- Tablo min-genisligi artirilarak hucre iceriklerinin dar alanda kirpilmasi azaltildi

## v0.3.578 - 2026-04-22

- Forwarder detay `Mevcut teklifler` tablosu daha modern/okunur tasarimla yenilendi
- Badge tabanli renkli gosterimler eklendi (tutar, konteyner, free time, rota, gecerlilik)
- Shipment hucresi belirgin tiklanabilir chip tasarimina alindi; satirlar hover ve secili durumda daha net ayrisir

## v0.3.577 - 2026-04-22

- Forwarder detaydaki `Mevcut teklifler` tablosuna shipment icin `Kalkis limani` ve `Varis limani` sutunlari eklendi
- `Mevcut teklifler` tablosundaki shipment hucresi tiklanabilir hale getirildi; artik ilgili shipment detayina gider

## v0.3.576 - 2026-04-22

- Siparis kalemi duzenleme ekrani yeniden tasarlandi
- Duzenleme ekraninda mevcut urun kodu/ad artik acikca gosterilir ve varsayilan olarak korunur
- Urun degistirme akisi opsiyonel hale getirildi (`Urunu degistir` secimi); secilmezse mevcut bagli urun korunur
- Sayisal alanlarda `type=number` + uygun `step` degerleriyle veri girisi daha hizli ve tutarli hale getirildi

## v0.3.574 - 2026-04-21

- Siparis plani Excel cikti akisina job tabanli hazirlama modeli eklendi (`/api/order-plan-export/jobs`)
- Kategori gibi genis filtrelerde once tum satirlar DB snapshotina alinir, sonra MSSQL metrikleri chunk (300 kod) halinde islenir
- UI'ya `Excel Hazirla` + durum/progress + `Excel Indir` akisi eklendi; export artik MSSQL gecikmesinde anlik 0'li dosya uretmek yerine hazir olunca indirilir
- Yeni tablolar eklendi: `order_plan_export_jobs`, `order_plan_export_job_rows`, `order_plan_export_job_codes`

## v0.3.573 - 2026-04-21

- Siparis plani hesaplarina `faturaya donusmemis proforma acik` miktari eklendi
- `Ihtiyac` ve `tavsiye` hesaplarindaki kullanilabilir stok tabani artik `stok + yolda + proforma acik` formuluyle calisir
- Siparis plani tablosu ve export dosyasina `Proforma acik` sutunu eklendi; `Toplam` degeri bu alanla birlikte hesaplanir

## v0.3.572 - 2026-04-21

- Siparis plani exportunda MSSQL bridge timeout durumunda 500 yerine sifirli fallback akisi eklendi
- `fetchLiveSalesAgg`/`fetchLiveStockMap` hatalarinda export devam eder; canli metrikler `0` ile doldurulur
- `sales!.sales120` non-null assertion kaldirilarak `undefined` kaynakli runtime patlamasi engellendi

## v0.3.571 - 2026-04-20

- Beyanname Lab GTIP toplu satirinda gumruk/gozetim degerleri line-toplam modele geri alindi
- GTIP satir degerleri artik tekrar kalem bazli hesaplanan degerlerin dogrudan toplami olarak gosterilir (ekstra yeniden hesap yok)

## v0.3.570 - 2026-04-20

- Beyanname Lab GTIP toplu hesapta gumruk matrahi birikimi hatasi duzeltildi
- Bu duzeltme ile GTIP satirlarindaki GV/ilave vergi/KDV degerlerinin yanlis sifira dusmesi engellendi

## v0.3.569 - 2026-04-20

- Beyanname Lab GTIP toplu tablonun `Toplam` satiri guncellendi
- Toplamlar artik satir gorunumunde hesaplanan GTIP degerlerinin toplami uzerinden uretilir
- Boylece ozellikle `Toplam KDV` ve `Toplam vergi` alanlari GTIP satirlarinin toplami ile birebir uyumlu gosterilir

## v0.3.568 - 2026-04-20

- Beyanname Lab GTIP toplu tabloda gosterilen `Gumruk matrahi` degeri hesaplamalara da baglandi
- `GV`, `ilave vergi`, `KDV matrahi`, `KDV`, `toplam vergi` ve `vergili toplam` artik bu GTIP gumruk matrahi uzerinden yeniden uretilir

## v0.3.567 - 2026-04-20

- Beyanname Lab ek gider dagitimi guncellendi
- `Ek gider` tutari artik FOB yerine `gumruk matrahi` payina gore GTIP satirlarina dagitilir
- Damga dagitimi mevcut FOB payi davranisiyla korunur

## v0.3.566 - 2026-04-20

- Beyanname Lab GTIP toplu tabloda `KDV matrahi` hesaplama akisi gumruk matrahiyla hizalandi
- GTIP satirinda KDV matrahi artik `gumruk matrahi + GV + ilave vergi + anti-damping + ek gider + damga` formuluyle yeniden uretilir
- Boylece `GV/ek gider = 0` durumunda KDV matrahi de gumruk matrahiyla birebir ayni gorunur

## v0.3.565 - 2026-04-20

- Beyanname Lab GTIP toplu tabloda `Gumruk matrahi` hesabi revize edildi
- GTIP satirinda gumruk matrahi artik `max(toplam CIF, toplam gozetim)` olarak gosterilir
- Boylece hucrede yazan `Kural: max(CIF, Gozetim)` ifadesiyle birebir ayni hesap gorunur

## v0.3.564 - 2026-04-20

- Beyanname Lab GTIP tablosunda `KDV matrahi` sutunu detaylandirildi
- KDV matrahini olusturan tum bilesenler ayni hucrede alt kirilim olarak gosterilir:
  `gumruk matrahi + GV + ilave vergi + anti-damping + ek gider + damga`
- `CIF / Gumruk matrahi` sutunu da detaylandirildi:
  `CIF`, `gozetim tabani` ve secilen `max(CIF, Gozetim)` degeri ayni hucrede gosterilir

## v0.3.563 - 2026-04-20

- Beyanname Lab agirlik cozumlemesinde kaynak onceligi guncellendi: once packing list import (`packing_list_lines`), yoksa `order_packing_list_items`
- Gumruk Excel exportta `WEIGHT_ENGINE_V2=1` iken de ayni oncelik uygulandi; packing import varsa agirliklar buradan alinir
- Boylece packing import yapilan siparislerde hem Beyanname Lab hem Gumruk export ayni agirlik kaynagini kullanir

## v0.3.562 - 2026-04-20

- Beyanname Lab gozetim brut agirligi fallback kurali sertlestirildi
- Artik brut kg mevcutsa (packing importtan gelse bile) ozetten yeniden paylastirma yapilmaz
- Boylece gereksiz `Gozetim brut agirligi ozetten paylastirildi` uyarisi ve olasi hatali override engellendi

## v0.3.561 - 2026-04-20

- Beyanname Lab ve gumruk export agirlik cozumlemesinde kaynak onceligi guncellendi
- Artik packing import (gumrukcu excel) verisi varsa satir agirliklari once buradan dagitilir
- Packing verisi yoksa once satirdaki direkt agirlik, sonra summary fallback akisi calisir

## v0.3.560 - 2026-04-20

- Beyanname Lab alt tablo urun/kalem bazli gorunumden GTIP bazli toplamlara cevrildi
- GTIP satirlarinda adet, kilo, FOB, masraf paylari, matrah, vergi ve vergili maliyet toplamlari gosterilir
- Karisik oranli GTIP satirlarinda oran etiketi `karma` olarak gosterilir

## v0.3.559 - 2026-04-20

- Beyanname Lab vergi oranlari tedarikci ulkesine gore `gtip_country_rates` tablosundan okunacak sekilde guncellendi
- Ulkeye ozel oran kaydi yoksa mevcut GTIP temel oranlarina otomatik fallback korunur
- Ulke override satirinda bos gelen alanlarin vergileri sifirlamamasi icin alan bazli fallback guclendirildi
- Beyanname Lab ustunde oranlarin hangi ulkeye gore cekildigini gosteren bilgi etiketi eklendi
- Ulke eslesmesinde normalize + yakin eslesme (`icerir`) desteklenerek `Cin` / `Çin Halk Cumhuriyeti` gibi varyasyonlarda oran kacirma riski azaltildi
- Kalem uyarilarina `Oran kaynagi` bilgisi eklendi (`GTIP ulke` veya `GTIP genel`)
- Tedarikci ulkesiyle eslesme bulunamazsa ve GTIP icin tek bir ulke satiri varsa bu satira otomatik fallback eklenerek vergi hesaplarinin sifira dusmesi engellendi

## v0.3.558 - 2026-04-20

- Dashboarda yapilan odemelerin aylara gore dagilimini gosteren yeni finans grafigi eklendi
- Finans bolumu iki parcaya ayrildi: ozet kartlar + son 6 ay odeme trend grafigi

## v0.3.557 - 2026-04-20

- Dashboard orta alana finans ozet kartlari eklendi
- Kartlar: `Bu ay yapilan odeme`, `Bekleyen odeme`, `Kalan odeme`
- Finans verisi `order_payments` + `orders` kaynaklarindan toplanarak gosterilir

## v0.3.556 - 2026-04-20

- Dashboarddaki `Toplam acik shipment`, `Bu hafta ETA`, `Evrak eksik`, `Evrak sorunlu` ozet kartlari kaldirildi
- Dashboard ana paneli operasyon notlari odagina sadeleştirildi

## v0.3.555 - 2026-04-20

- Dashboarddaki shipment ozet kartlari altindaki odeme kartlari kaldirildi
- `Bu ay yapilan odeme`, `Bekleyen odeme`, `Kalan odeme` metrikleri ana panelden cikarildi

## v0.3.554 - 2026-04-20

- RFQ teklif karsilastirma tablosuna alt satirda toplam adet alani eklendi
- `RFQ adet` sutununun toplam degeri artik footer satirinda gosteriliyor

## v0.3.553 - 2026-04-20

- RFQ detayinda yonetim rolunde de `Masraf %` ve `Kar %` inputlari tekrar gorunur hale getirildi
- Yonetimde teklif duzenleme/silme kapali kalirken maliyet simulasyonu icin bu iki alan kullanilabilir oldu

## v0.3.552 - 2026-04-20

- Teklif Talepleri modulunde yonetim rolunden duzenleme/ekleme/silme aksiyonlari gizlendi
- RFQ listesinde `Yeni RFQ` ve satir bazli silme aksiyonu artik sadece adminde gorunur
- RFQ detayinda import, donusturme, teklif girisi, hedef fiyat duzenleme, satir silme, durum degistirme, tedarikci ekleme, teklif silme/kazanan secme ve belge yukleme/silme aksiyonlari admin rolune alindi
- `rfqs/new` sayfasi da admin duzenleme yetkisine kapatildi

## v0.3.551 - 2026-04-20

- Siparis detayinda yonetim rolunden su aksiyonlar gizlendi: `Gumruk Excel'i indir`, `Navlun sigortasi formu`, `Sigorta e-postasi hazirla`
- Bu uc aksiyon artik yalnizca admin duzenleme yetkisi (`canEdit`) olan kullanicilara gosterilir

## v0.3.550 - 2026-04-18

- Siparis plani satir yuksekligini buyuten ic elementler kompaktlandi (stok/miktar metinleri ve input alani daraltildi)
- Satir ici ikincil bilgiler tek satira toplanarak gereksiz dikey uzama azaltildi
- Kayit durumu metni sadece aktifken gosterilecek sekilde duzenlendi (idle durumda ekstra satir yuksekligi kaldirildi)

## v0.3.549 - 2026-04-18

- Siparis plani tablo satirlari daha kompakt hale getirildi (hucre dikey bosluklari daraltildi)
- Satirlarin birbirine yapisik gorunumu azaltildi (dikey satir araligi hafif acildi)

## v0.3.548 - 2026-04-18

- Siparis plani urun listesi tip bazli siralamaya alindi
- Liste artik once `product_type_id` (tip), sonra secili ikincil siralama alanina gore akar

## v0.3.547 - 2026-04-18

- Siparis plani tablosundaki scrolla bagli sanallastirma akisi kaldirildi
- Tablo, sayfa bazli (server pagination) modelle native liste renderina alindi; scroll titreme/takilma riski azaltildi
- Satirlar kompakt ve sabit akista kalacak sekilde tablo yerlesimi sadeleştirildi

## v0.3.546 - 2026-04-18

- Siparis plani sayfasindan `Urun istatistikleri` blogu kaldirildi
- Filtre paneline yeni `Tip` filtresi eklendi (`Hepsi` / `Tip yok` / kayitli tipler)
- Tip filtresi sorgu katmanina baglandi (`products.product_type_id`)

## v0.3.545 - 2026-04-18

- Siparis plani filtre bolumu, urunler sayfasindaki form diliyle hizalandi (kart yapisi, input/select gorunumu, buton stili)
- Kategori secimi coklu select yerine acilir `Kategori filtresi` chip/checkbox yapisina tasindi
- Filtre deneyimi urunler modulundeki kullanim desenleriyle ayni akisa getirildi

## v0.3.544 - 2026-04-18

- Siparis plani tablosuna yerel hizli filtreler eklendi (`Sadece 0 stok`, `Sadece degisenler`, `Sadece secili`) ve secimler localStorage ile korunur hale getirildi
- Tablo ustune operasyonel KPI ozet kartlari eklendi (ihtiyacli urun, toplam ihtiyac, toplam tavsiye, 0 stok urun)
- Secili satirlara toplu aksiyon akisi eklendi (`Seciliye tavsiye uygula`, `Seciliyi sifirla`) ve yeni endpoint tanimlandi: `POST /api/order-plan/bulk`
- Siparis plani satir inputu debounce kayit modeline gecirildi; hizli veri girisinde istek yogunlugu azaltilip kayit durumu gorunur yapildi
- Gorunen tablo sonucunu anlik CSV olarak disari alma aksiyonu eklendi

## v0.3.543 - 2026-04-18

- Siparis plani listesine server-side siralama parametreleri eklendi (`sortBy`, `sortDir`)
- Filtre paneline `Siralama` ve `Yon` secimleri eklendi (olusturma tarihi / urun kodu / urun adi)
- Canli metrik istemci yuklemesi chunk + sinirli paralellik (400 kod/chunk, 3 worker) modeline alindi
- Buyuk veri setlerinde tek istekte buyuk payload gonderimi azaltilarak ilk metrik dolumu daha dayanikli hale getirildi

## v0.3.542 - 2026-04-18

- Siparis plani server sorgularinda veri yukleri sayfaya ozel urun ID listesine daraltildi
- `product_sales_10y_totals`, `rfq_items` ve `order_plan_entries` okumalarinda tum tablo taramasi yerine chunk'li `in(product_id, ...)` yaklasimi eklendi
- Boyuk veri setlerinde ilk yukte gereksiz satir cekimi azaltilarak 1000+ satir senaryosunda backend gecikmesi dusuruldu

## v0.3.541 - 2026-04-18

- Siparis plani tablosunda 1000+ satir gorunumu icin ilk performans adimi olarak satir sanallastirma (virtualized windowing) eklendi
- Tabloda sadece gorunen satirlar ve yakin cevresi render edilir; ust/alt spacer yaklasimi ile kaydirma akici hale getirildi
- Tablo basligi kaydirma alaninda sticky yapildi, uzun listede kolon basliklari gorunur kalir

## v0.3.540 - 2026-04-18

- Siparis plani ekraninin 1000+ satirda olceklendirilmesi icin teknik yol haritasi dokumani eklendi
- Yeni dokuman: `docs/siparis-plani-1000-satir-roadmap.md` (P0/P1/P2/P3 backlog + kabul kriterleri + uygulama sirasi)

## v0.3.539 - 2026-04-18

- `MSSQL_SALES_SOURCE=stokhar` modunda siparis plani canli satis hesaplarinda kalan `TBLSTHAR` bagimliligi kaldirildi
- Boylece `Invalid object name 'TBLSTHAR'` hatasi veren ortamlarda `son 60 / onceki 60 / son 120` satis metrikleri yalnizca `TBLSTOKSB + TBLSTOKHAR` ile calisir
- 10 yillik satis icin MSSQL ek sorgusu kapatildi; sayfadaki mevcut Supabase toplam degeri korunur

## v0.3.538 - 2026-04-18

- Siparis plani canli satis metrikleri icin geri alinabilir kaynak secimi eklendi (`MSSQL_SALES_SOURCE=sthar|stokhar`)
- `MSSQL_SALES_SOURCE=stokhar` iken `son 60`, `onceki 60` ve `son 120` satislar `TBLSTOKSB + TBLSTOKHAR` uzerinden hesaplanir
- `10 yillik satis` davranisi degistirilmedi; mevcut `TBLSTHAR` tabanli hesap oldugu gibi korunur
- Ayni kaynak secimi bridge agent tarafina da tasinarak direct/agent sonuclari uyumlu hale getirildi

## v0.3.537 - 2026-04-17

- Konteyner planlama havuzuna hizli kullanim filtreleri eklendi: arama, tedarikci ve `sadece 0 kg` filtresi
- Manuel agirlik override kullanimlari daha gorunur hale getirildi (`manuel` / `manuel siparis kg` badge)
- Tum manuel override degerlerini tek tikla sifirlayan `Override temizle` aksiyonu eklendi
- Sayfadaki gorev plani, yeni backlog sirasina gore guncellendi

## v0.3.536 - 2026-04-17

- Konteyner planlama tahtasina sayfaya-ozel manuel agirlik override destegi eklendi
- Kalem kartina cift tiklanarak sadece o kalem icin brut kg girilebilir
- Siparis kartina cift tiklanarak siparis toplam brut kg girilebilir; deger siparis kalemlerine dagitilir
- Bu agirlik override'lari kalici DB yazimi yapmaz, sadece mevcut ekran oturumunda kullanilir

## v0.3.535 - 2026-04-17

- Konteyner planlamada siparis durum filtreleme DB `in(...)` eslesmesinden uygulama katmanindaki normalize filtreye tasindi
- Boylece Turkce karakter/farkli yazim varyasyonlarinda (`Sipariş`, `Üretimde`, `Hazır` vb.) eslesen siparislerin kalemleri eksik kalmaz

## v0.3.534 - 2026-04-17

- Konteyner planlama veri akisi order_items tabanli cekimden order-oncelikli cekime alindi
- Artik once `orders` tablosundan hedef durumdaki siparisler okunuyor, sonra sadece bu siparislerin `order_items` kalemleri getiriliyor
- Kalan `loads.slice(0, 180)` kisiti kaldirildi; havuza tum eslesen kalemler gelir

## v0.3.533 - 2026-04-17

- Konteyner planlama sayfasinda `order_items` fetch limiti kaldirildi
- Havuz verisi artik sabit satir limiti olmadan cekilir

## v0.3.532 - 2026-04-17

- Konteyner planlama havuzuna gelen siparis kalemlerinde durum filtresi daraltildi
- Artik sadece su siparis durumlari dahil ediliyor: `Siparis Verildi`, `Proforma Geldi`, `Uretimde`, `Hazir`
- Bu liste disindaki tum durumlar havuzdan otomatik elenir

## v0.3.531 - 2026-04-17

- Konteyner planlama havuzu siparis bazli collapse yapisina cevrildi
- Her siparis karti tek parca surukle-birak ile konteynere tasinabilir hale getirildi
- Siparis karti acildiginda alt urun kalemleri tek tek suruklenerek siparis bolme destegi eklendi
- Konteyner icinde de siparis gruplu gorunum eklendi; tum siparisi konteynerler arasi tek hamlede tasima akisi acildi

## v0.3.530 - 2026-04-17

- Yeni sayfa eklendi: `Konteyner Planlama` (`/konteyner-planlama`)
- İlk MVP konteyner planlayıcı devreye alındı:
  - Yük havuzu
  - Konteyner oluşturma (`20GP`, `40HC`, `LCL`)
  - Sürükle-bırak yerleştirme
  - Brüt kg / CBM limit kontrolü
  - Otomatik yerleşim önerisi (first-fit)
- Üst navigasyona `Konteyner Planlama` bağlantısı eklendi
- Beyanname lab tarafında gözetim tabanı brüt ağırlık odaklı hesap akışı güncellendi

## v0.3.529 - 2026-04-16

- App layout icindeki bloklayici `syncTasks` calismasi request yolundan cikarildi
- Gorev senkronizasyonu yeni `POST /api/tasks/sync` endpoint'i ile arka planda tetiklenir hale getirildi
- Yeni `TaskSyncBoot` client komponenti eklendi (5 dk local throttle)
- `TaskPanel` layout icinde `Suspense` altina alinarak ilk HTML render yolundan ayrildi

## v0.3.528 - 2026-04-15

- Urunler listesi ve urun detayinda ayni request icindeki auth/rol tekrar sorgulari azaltildi
- Urun detay sayfasinda bagimsiz Supabase sorgulari paralel hale getirildi; ilk HTML gecikmesi azaltildi
- Urunler listesinde son siparis ulkesi icin ek `orders` sorgusu kaldirildi; veri ayni kalirken server yukunde dusus saglandi

## v0.3.527 - 2026-04-15

- Siparis Plani ekraninda MSSQL stok/satis cekimi server renderdan ayrildi
- Yeni endpoint eklendi: `POST /api/order-plan/live-metrics` (stok + 60/120 gun satis metrikleri toplu cekim)
- Yeni client tablo komponenti eklendi: `components/OrderPlanLiveTable.tsx`
- Sayfa acilisi artik MSSQL beklemez; stok/satis/miktar kolonlari arka planda dolarak guncellenir

## v0.3.526 - 2026-04-15

- Urunler listesinde canli stok yuklemesi server renderdan ayrildi
- Liste acilisinda MSSQL stok beklemesi kaldirildi; stok hucreleri client tarafta arka planda tekil/dedup fetch ile dolar
- Yeni komponent: `components/ProductLiveStockInline.tsx`

## v0.3.525 - 2026-04-15

- Urun detay canli stok karti yuklenme gostergesi gorsel olarak iyilestirildi
- Bekleme durumunda sabit `...` yerine breathing etkili 3 nokta animasyonu eklendi

## v0.3.524 - 2026-04-15

- Urun detay canli stok kartindaki istemci timeout siniri kaldirildi
- `Canli stok gecikiyor` ve `yenile` uyari/metinleri kaldirildi
- Stok alani artik sessiz sekilde arka planda yuklenir; sayfa beklemeden acik kalir

## v0.3.523 - 2026-04-15

- Urun detay sayfasinda canli stok alani async hale getirildi; sayfa stok beklemeden acilir
- Yeni endpoint eklendi: `GET /api/products/live-stock?code=...`
- Yeni client komponent eklendi: `components/ProductLiveStockCard.tsx` (loading + hata + manuel yenile)

## v0.3.522 - 2026-04-14

- Proforma detay fiyat karsilastirmasina fallback eklendi
- Tedarikcinin son siparisinde ilgili urun yoksa, referans olarak urun kartindaki birim fiyat kullanilir
- Kaynak etiketi bu durumda `Urun karti` olarak gosterilir

## v0.3.521 - 2026-04-14

- Proforma detayindaki fiyat karsilastirma referansi guncellendi
- Artik referans fiyat global son siparis degil, proformanin tedarikcisine ait son siparis satiri uzerinden hesaplanir
- Sutun adi `Tedarikcinin son sip. birim fiyat` olarak netlestirildi

## v0.3.520 - 2026-04-14

- Proforma detay urun tablosuna `Son sip. birim fiyat` sutunu eklendi
- Karsilastirma kaynagi, urunun sistemdeki en guncel siparis satiri olacak sekilde baglandi
- Son siparis fiyati kirmizi badge ile gosterildi; ayni satirda proforma birim fiyatina gore fark yuzdesi eklendi

## v0.3.519 - 2026-04-10

- GTIP listesi tablosuna `Dumping` ve `Gozetim` sutunlari eklendi
- Liste sorgusu `anti_dumping_applicable`, `anti_dumping_rate`, `surveillance_applicable`, `surveillance_unit_value` alanlarini da cekecek sekilde guncellendi
- Sutunlarda aktifse `/kg` degeri, pasifse `Yok` gosterimi eklendi

## v0.3.518 - 2026-04-08

- Siparis detay sayfasi metadata title fallback'i duzeltildi
- Baslik sirasi: `orders.name` -> `orders.reference_name` -> `#<orderId-kisa>`
- Boylece sekme basligi `Siparis | Siparis` olarak sabit kalma sorunu giderildi

## v0.3.517 - 2026-04-08

- Siparis listesinde agirlik gorunumu iyilestirildi
- Gosterim fallback sirasi: `packing summary net` -> `orders.weight_kg` -> `order_items` uzerinden anlik hesaplanan referans agirlik
- Boylece urun referans agirligindan gelen satirlarda da toplam kg listede bos kalmaz

## v0.3.516 - 2026-04-08

- Shipment detay ekraninda `Durum` karti guncellendi
- Artik ana satirda `Guncel durum` (shipment.status) gosteriliyor; `Sistem onerisi` alt bilgi satirina alindi

## v0.3.515 - 2026-04-08

- Siparis durumu guncelleme akisina shipment durum senkronu eklendi (`app/actions/orders.ts`)
- Yeni kural: siparis durumundan shipmente sadece ileri yonlu gecis yapilir (geri dusurme engellendi)
- `Depoya Teslim Edildi` ve `Gumrukte` siparisleri shipment tarafinda `Gemiden Indi` asamasina esitlenir; shipment `Varis Limaninda`ya geri donmez

## v0.3.514 - 2026-04-08

- Dashboard `Canli Durum Seridi - Shipment` kartlarinin yonlendirmesi `orders` yerine `shipments` listesine alindi
- Shipment listesine `shipmentStatus` filtre parametresi eklendi
- `shipmentStatus=geciken` secenegi dogrudan geciken shipmentleri filtreleyecek sekilde baglandi

## v0.3.513 - 2026-04-08

- Beyanname Lab kur/masraf girisleri yanyana yatay ust bara tasindi
- Sag sabit panel yapisi kaldirilarak ozet kartlarin hemen ustunden yonetilen yeni akis uygulandi

## v0.3.512 - 2026-04-08

- Beyanname Lab sag kur/masraf paneline masaustu icin daralt/genislet (collapse) kontrolu eklendi
- Panel daraldiginda ozet ve tablo offsetleri otomatik kuculerek gorunur alan geri kazanildi

## v0.3.511 - 2026-04-08

- Beyanname Lab tablo bloguna sag panel offseti eklendi (`lg:mr-[312px]`)
- Sag masraf panelinin tablo ustune binmesi engellendi

## v0.3.510 - 2026-04-08

- Beyanname Lab sag masraf paneli normal akistan ayrildi (absolute sag kolon), panel yuksekliginin olusturdugu bosluk sorunu kaldirildi
- Sol ozet alanina sag panel genisligi kadar `padding-right` verilip bloklarin daha dengeli akmasi saglandi

## v0.3.509 - 2026-04-08

- Beyanname Lab ust blok yerlesimi yeniden kuruldu; sagdaki kur/masraf paneli yuksekligi nedeniyle olusan buyuk bosluk kaldirildi
- Vergi kirilim kartlari ust ozetle ayni sol kolonda toplanarak daha dogal akista ve modern blok yapisinda gosterildi

## v0.3.508 - 2026-04-08

- Beyanname Lab ozet tasarimi kompakt hale getirildi; kartlar ve panel bosluklari azaltildi
- Ozet kartlarinda desktop/mobile grid dagilimi iyilestirildi (`sm:2`, `xl:4`)
- Sagdaki kur/masraf paneli sabit ve daha dar/okunur yapida guncellendi (`sticky`, daha kisa kartlar)
- Vergi kirilim kartlarinda da benzer kompakt modern gorunum uygulandi

## v0.3.507 - 2026-04-08

- Siparis kalemi olusturma/guncelleme ve import akislari net-brut agirlik cozumunu ortak kuralla guncelledi (`net`/`brut` tekil girildiginde digeri otomatik tamamlanir)
- Eksik urun tamamlama akisinda varolan urunle eslestirme yapildiginda, agirlik bos ise urun agirlik referansindan satir agirligi otomatik doldurulur
- Siparis kalem importu `.xls` dosyalarini da destekler hale getirildi
- Packing list importu sadece CSV degil, `.xlsx/.xls` dosya importunu da destekler hale getirildi

## v0.3.506 - 2026-04-08

- Agirlik hesaplari icin ortak cozumleyici eklendi: `lib/order-weight.ts`
- Beyanname Lab agirlik dagitimi (direkt satir -> packing payi -> summary fallback) ortak motorla calisacak sekilde birlestirildi
- Gumruk Excel exportunda yeni agirlik motoru opsiyonel flag ile eklendi (`WEIGHT_ENGINE_V2=1`)
- Rollback kolayligi icin flag kapaliyken export eski packing satiri agirlik davranisina geri doner

## v0.3.505 - 2026-04-07

- Urun duzenleme/olusturma formunda sayisal nitelik inputlarinin step degeri `any` yapildi
- Boylece agirlik gibi kucuk ondalikli degerler (`0,002332` vb.) tarayici dogrulamasina takilmadan girilebilir hale geldi

## v0.3.504 - 2026-04-07

- Siparis importunda eksik urun cozum ekranina `Varolan urunle eslestir` secenegi eklendi
- Eksik urun satirinda sistemden urun arayip secme akisi eklendi; secilen urun yeni urun olusturmadan dogrudan siparis kalemine baglanir
- Eslestirme secilip urun secilmezse akis hata toast ile durdurularak yanlis import engellendi

## v0.3.503 - 2026-04-07

- Sigorta mailinden gelen dosya yakalama/import akisi tamamen kaldirildi
- Kaldirilanlar: Resend inbound webhook route'u, insurance ingest/inbox API'leri, yarı-otomatik import paneli ve ilgili helper/migration dosyalari
- Sigorta ekrani tekrar sadece manuel e-posta hazirlama/gonderme akisina donduruldu

## v0.3.502 - 2026-04-07

- Yari-otomatik sigorta policy akisi eklendi: inbound mailler DB'ye yakalanip siparis bazli manuel import edilebilir hale getirildi
- Yeni tablolar: `insurance_inbound_mails`, `insurance_inbound_attachments`
- Yeni API'ler: `GET /api/insurance-mail/inbox`, `POST /api/insurance-mail/inbox/import`
- Sigorta mail hazirlama sayfasina gelen maillerden secip mevcut siparise tek tikla `NAVLUN_SIGORTA` belge yukleme paneli eklendi
- Resend inbound route'u auto-import kapali olsa bile inbox yakalama yapacak sekilde ayrildi (`INSURANCE_POLICY_INBOX_CAPTURE_ENABLED`)

## v0.3.501 - 2026-04-07

- Inbound siparis eslestirmesine global DB taramasi geri eklendi; 5000 kayit sinirina takilan eski siparisler icin eslesme geri kazanildi
- Subjectten uretilen adaylar artik once `orders.name/code ilike` ile dogrudan sorgulanip, sonra skor fallback'i calistirilir

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

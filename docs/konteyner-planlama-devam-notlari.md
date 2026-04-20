# Konteyner Planlama - Devam Notlari ve Yol Haritasi

Bu dosya, `/konteyner-planlama` modulu icin kalan isleri, siralamayi ve karar notlarini tutar.
Sonraki oturumda "bu dosyayi oku ve buradan devam et" denildiginde bu belge baz alinacak.

## 1) Mevcut Durum (Tamamlananlar)

- Siparis bazli collapse havuz
- Kalem/siparis drag-drop
- Konteyner limit kontrolu (kg/cbm)
- Otomatik plan (first-fit)
- Durum bazli siparis filtreleme (Siparis Verildi, Proforma Geldi, Uretimde, Hazir)
- Orders -> order_items veri akisi
- Manuel agirlik override (kalem ve siparis, sadece bu sayfa oturumu)
- Havuz filtreleri (arama, tedarikci, sadece 0 kg)

## 2) Kalan Isler - Oncelik Sirasi

### P0 - Operasyonel kritik

1. **Otomatik Plan Modlari (3 mod)**
   - Hizli (first-fit, mevcut)
   - Dengeli (konteynerler arasi kg dagilimini optimize et)
   - Tedarikci Bazli (ayni tedarikciyi minimum bol)

2. **Plan Kaydetme (Taslak)**
   - DB tablolari:
     - `container_plans`
     - `container_plan_containers`
     - `container_plan_items`
   - Alanlar:
     - plan adi, durum (draft/final), olusturan, olusturma tarihi
     - konteyner tipi, limit, doluluk
     - kalem -> konteyner eslesmesi

3. **Revizyonlama**
   - `v1, v2, v3...` mantigi
   - "Clone as new revision" aksiyonu
   - revizyon notu

### P1 - Kullanilabilirlik

4. **Toplu Aksiyonlar**
   - Secili kalemleri toplu tasi
   - Secili kalemlere toplu agirlik override
   - Secili siparisi kilitle (otomatik plan dokunmasin)

5. **Eksik Agirliklar Paneli**
   - 0 kg olanlari ayri panelde listele
   - hizli duzenleme gridi (tek ekranda seri giris)

6. **Gorsel Iyilestirme**
   - Override badge detaylari
   - Uyari seviyeleri (85%, 95%, 100%+)
   - "Kalan kapasite" daha gorunur kart

### P2 - Cikti ve entegrasyon

7. **Export**
   - Konteyner bazli Excel
   - Operasyon ozet PDF

8. **Siparis/Shipment Entegrasyonu**
   - Final plani shipment hazirlik akisina baglama
   - Plan final oldugunda log/iz kaydi

## 3) Teknik Tasarim Notlari

### A) Otomatik plan - Dengeli mod (onerilen)

- Hedef: konteynerlerin doluluk varyansini dusurmek
- Yaklasim:
  1. Kalemleri kg buyukten kucuge sirala
  2. Her adimda "en az dolu uygun konteyner"e at
  3. Limit asarsa sonraki konteyner adayi

### B) Otomatik plan - Tedarikci bazli mod (onerilen)

- Hedef: ayni tedarikciyi minimum sayida konteynere bolmek
- Yaklasim:
  1. Kalemleri tedarikciye gore grupla
  2. Gruplari toplam kg buyukten kucuge isle
  3. Grup tek konteynere sigarsa tekte ata
  4. Sigmazsa alt kalem split et

### C) Kaydetme modeli

- `container_plans`:
  - `id`, `name`, `status`, `revision_no`, `parent_plan_id`, `notes`, `created_by`, `created_at`
- `container_plan_containers`:
  - `id`, `plan_id`, `container_code`, `container_type`, `max_gross_kg`, `max_cbm`
- `container_plan_items`:
  - `id`, `plan_id`, `container_id`, `order_item_id`, `manual_weight_kg`, `created_at`

## 4) Kabul Kriterleri (Done tanimi)

Bir gorev tamamlandi sayilmasi icin:

1. UI davranisi net ve test edilebilir olacak
2. Limit kontrolleri bozulmayacak
3. Lint hatasi olmayacak
4. `CHANGELOG.md` surum artisiyla guncellenecek

## 5) Sonraki Oturumda Baslama Komutu

Kullanici su sekilde baslatabilir:

- "Bu dosyayi oku ve P0-1'den devam et"
- "docs/konteyner-planlama-devam-notlari.md uzerinden kaldigimiz yerden ilerle"

Asistanin ilk isi:
- Dosyayi okuyup secilen gorev adimini uygulamaya gecmek.

# Siparis Plani - 1000+ Satir Yol Haritasi

Bu dokuman, `/siparis-plani` ekraninin 1000+ urun satiri ile akici ve kullanisli calismasi icin uygulama planini tutar.

## P0 - Performans (kritik)

1. Sanal satir renderi (virtualization)
   - `@tanstack/react-virtual` ile sadece gorunen satirlari render et.
   - Hedef: 1000+ satirda takilmasiz scroll.

2. Server-side filtre / siralama / sayfalama
   - Sorgulari backend tarafinda calistir.
   - Ilk acilista sadece gerekli satirlari getir.

3. Kolon yukunu azaltma
   - Ilk yukte temel kolonlar.
   - Agir kolonlar (detay/ikincil) ihtiyac halinde yuklensin.

4. Hesaplama maliyetini dusurme
   - Satir bazli agir hesaplari API katmaninda hazirla.
   - Client tarafinda tekrar eden hesaplari azalt.

5. Bilesen optimizasyonu
   - Satir/hucresel bilesenlerde memoizasyon.
   - Gereksiz re-render zincirlerini kes.

## P1 - Kullanilabilirlik (hiz)

1. Sticky kolonlar
   - `kod` ve `urun` solda sabit.
   - Metrik kolonlar yatay kaydirma ile gorulebilir.

2. Sabit hizli filtre cubugu
   - `0 stok`, `yuksek ihtiyac`, `tedarikci`, `kategori`, serbest arama.

3. Toplu secim + toplu aksiyon
   - Secili satirlara toplu lead/safety/override/not islemleri.

4. Inline edit + debounce kayit
   - Hucresel duzenleme, 300-500ms debounce ile API yazimi.

## P2 - Operasyon ergonomisi

1. Kaydedilmis gorunumler
   - Kullaniciya ozel filtre/sutun dizilimi presetleri.

2. Sutun yonetimi
   - Goster/gizle ve sutun sira kontrolu.

3. "Sadece degisenler" modu
   - Son calismadan farkli satirlari one cikar.

## P3 - Raporlama

1. Gorunum bazli Excel export
   - O anki filtre/siralama ile birebir export.

2. Ozet KPI kartlari
   - Toplam ihtiyac, kritik urun sayisi, kategori kirilimi.

## Kabul Kriterleri

1. 1000 satirda scroll ve secim islemleri akici olmali.
2. Filtre/siralama sonrasi veri tutarliligi korunmali.
3. Kayit akislari idempotent olmali (tekrar denemede bozulmama).
4. `CHANGELOG.md` her anlamli adimda guncellenmeli.

## Uygulama Sirasi (onerilen)

1. P0-1 (virtualization)
2. P0-2 (server-side filtre/siralama)
3. P1-1 + P1-2 (sticky + hizli filtre)
4. P1-3 + P1-4 (toplu aksiyon + inline edit)
5. P2/P3 iyilestirmeleri


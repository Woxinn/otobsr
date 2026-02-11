## Ithalat Takip Sistemi

Web tabanli ithalat takip uygulamasi. Supabase ile kullanici girisi, kalici veri ve belge saklama destekler.

## Kurulum

1) Supabase projesi olusturun.
2) `supabase/schema.sql` dosyasini Supabase SQL editorunde calistirin.
3) `documents` storage bucketinin olustugunu dogrulayin.
4) `.env.example` dosyasini `.env.local` olarak kopyalayin ve Supabase bilgilerini girin:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

5) Supabase Auth icin en az bir admin kullanici olusturun.

## Gelistirme

Once gelistirme sunucusunu calistirin:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Tarayicida [http://localhost:3000](http://localhost:3000) acin ve admin girisi yapin.

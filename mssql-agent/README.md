Otobsr MSSQL Agent

Kullanim

1. `mssql-agent/.env.example` dosyasini exe ile ayni klasorde `.env` olarak bulundur.
2. Alanlari doldur:
   - `APP_BASE_URL`
   - `AGENT_TOKEN`
   - MSSQL baglanti bilgileri
3. Gelistirme icin:
   - `npm install`
   - `npm start`
4. Sadece CLI test icin:
   - `npm run start:cli`
5. Tek exe paket icin:
   - `npm run build:exe`

Davranis

- Agent artik Electron GUI olarak calisir.
- Acildiginda tek pencere gelir.
- Kucultulunce tray'e iner.
- Tray ikonundan geri acilir.
- Canli durum ve log ayni pencerede gorulur.

Teknik notlar

- HTTP tarafinda built-in `fetch` kullanilmaz.
- Bu degisiklik paketlenmis runtime icindeki Vercel header parse hatasini asmak icin yapildi.
- Portable build'de `.env` dosyasi, `Otobsr MSSQL Agent 2.0.0.exe` ile ayni klasorde olmalidir.
- Uygulama portable calisirken `PORTABLE_EXECUTABLE_DIR` klasorunu oncelikli okur.

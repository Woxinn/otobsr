import { NextResponse } from "next/server";

// Basit CSV (noktalÄ± virgÃ¼l) ÅŸablonu dÃ¶ner.
const CONTENT = [
  "urun_kodu;ad;fiyat;netsis_kodu;agirlik;tip;gtip",
  "RXB-BCVB-2RXPB-2280-Lw-m;Ürün adÄ±;12,50;STK-001;0,85;18RHB;8414",
  "RXB-WVB-12.5-600-La-m;BaÅŸka Ã¼rÃ¼n;9,99;STK-002;0,72;SPZ;4010",
].join("\n");

export async function GET() {
  return new NextResponse(CONTENT, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="urun-import-sablon.csv"',
    },
  });
}

// BazÄ± istemciler HEAD atabilir; aynÄ± iÃ§eriÄŸi dÃ¶ner.
export async function HEAD() {
  return GET();
}


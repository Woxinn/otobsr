import { NextResponse } from "next/server";

// Basit CSV (noktalı virgül) şablonu döner.
const CONTENT = [
  "urun_kodu;ad;fiyat;netsis_kodu;agirlik;tip;gtip",
  "RXB-BCVB-2RXPB-2280-Lw-m;Ürün adı;12,50;STK-001;0,85;18RHB;8414",
  "RXB-WVB-12.5-600-La-m;Başka ürün;9,99;STK-002;0,72;SPZ;4010",
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

// Bazı istemciler HEAD atabilir; aynı içeriği döner.
export async function HEAD() {
  return GET();
}

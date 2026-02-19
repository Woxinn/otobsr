import { NextResponse } from "next/server";

const CONTENT = [
  "old_code;new_code",
  "RXB-OLD-001;RXB-NEW-001",
  "RXB-OLD-002;RXB-NEW-002",
].join("\n");

export async function GET() {
  return new NextResponse(CONTENT, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="urun-kod-guncelleme-sablon.csv"',
    },
  });
}

export async function HEAD() {
  return GET();
}


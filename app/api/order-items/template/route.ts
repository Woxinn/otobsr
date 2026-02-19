import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const baseHeaders = [
  "product_code",
  "quantity",
  "unit_price",
  "total_amount",
  "net_weight_kg",
  "gross_weight_kg",
  "notes",
];

const attributeSlots = 5;
const attributeHeaders = Array.from({ length: attributeSlots }, (_, index) => [
  `attr_name_${index + 1}`,
  `attr_value_${index + 1}`,
  `attr_unit_${index + 1}`,
  `attr_type_${index + 1}`,
]).flat();

const headers = [...baseHeaders, ...attributeHeaders];

const sampleRow = new Array(headers.length).fill("");
sampleRow[0] = "PRD-001";
sampleRow[1] = "10";
sampleRow[2] = "12.5";
sampleRow[6] = "Toplu siparis";

const attrBase = baseHeaders.length;
sampleRow[attrBase] = "Agirlik";
sampleRow[attrBase + 1] = "2.5";
sampleRow[attrBase + 2] = "kg";
sampleRow[attrBase + 3] = "number";

export async function GET() {
  const sheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Template");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const filename = "order-items-template.xlsx";

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}

// Bazı istemciler HEAD isteği atabiliyor; 405 almamak için aynı içeriği dönelim.
export async function HEAD() {
  return GET();
}

export async function POST() {
  return GET();
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET,HEAD,POST,OPTIONS",
    },
  });
}

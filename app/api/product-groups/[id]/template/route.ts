import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 60);

export async function GET(
  _request: Request,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: group } = await supabase
    .from("product_groups")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!group) {
    return new NextResponse("Kategori bulunamadi.", { status: 404 });
  }

  const { data: attributes } = await supabase
    .from("product_attributes")
    .select("name, unit, value_type")
    .eq("group_id", group.id)
    .order("sort_order", { ascending: true })
    .order("name");

  const baseHeaders = [
    "code",
    "name",
    "category",
    "unit_price",
    "description",
    "notes",
  ];

  const attributeHeaders = (attributes ?? []).flatMap((_, index) => [
    `attr_name_${index + 1}`,
    `attr_value_${index + 1}`,
    `attr_unit_${index + 1}`,
    `attr_type_${index + 1}`,
  ]);

  const headers = [...baseHeaders, ...attributeHeaders];
  const sampleRow = new Array(headers.length).fill("");
  sampleRow[0] = "PRD-0001";
  sampleRow[1] = "Sample Product";
  sampleRow[2] = group.name ?? "";

  (attributes ?? []).forEach((attr, index) => {
    const baseIndex = baseHeaders.length + index * 4;
    sampleRow[baseIndex] = attr.name ?? "";
    sampleRow[baseIndex + 2] = attr.unit ?? "";
    sampleRow[baseIndex + 3] = attr.value_type ?? "text";
  });

  const sheet = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Template");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const filename = `product-group-${slugify(group.name ?? group.id)}-template.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}

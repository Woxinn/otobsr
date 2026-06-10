import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { canViewFinance, getCurrentUserRole } from "@/lib/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EXPORT_ROWS = 1000;

type ProductRow = {
  id: string;
  code: string | null;
  name: string | null;
  brand: string | null;
  group_id: string | null;
  description: string | null;
  notes: string | null;
  created_at: string | null;
  unit_price: number | null;
  gtip_id: string | null;
  domestic_cost_percent: number | null;
  netsis_stok_kodu: string | null;
};

const parseIds = (value: string | null) =>
  Array.from(
    new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_EXPORT_ROWS);

const chunk = <T,>(items: T[], size = 300) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("tr-TR");
};

const formatValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return Number(value).toLocaleString("tr-TR");
  return String(value);
};

const takeRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get("ids"));

  if (!ids.length) {
    return NextResponse.json({ error: "Export icin en az bir urun secilmeli" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }

  const { role } = await getCurrentUserRole(supabase, user);
  const canSeeFinance = canViewFinance(role);

  const { data: productsRaw, error: productsError } = await supabase
    .from("products")
    .select(
      "id, code, name, brand, group_id, description, notes, created_at, unit_price, gtip_id, domestic_cost_percent, netsis_stok_kodu"
    )
    .in("id", ids);

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const products = (productsRaw ?? []) as ProductRow[];
  const orderIndex = new Map(ids.map((id, index) => [id, index]));
  products.sort((left, right) => {
    const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });

  const productIds = products.map((product) => product.id);
  const groupIds = Array.from(
    new Set(products.map((product) => product.group_id).filter((id): id is string => Boolean(id)))
  );
  const gtipIds = Array.from(
    new Set(products.map((product) => product.gtip_id).filter((id): id is string => Boolean(id)))
  );

  const [{ data: groupsRaw }, { data: gtipsRaw }] = await Promise.all([
    groupIds.length
      ? supabase.from("product_groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] as any[] }),
    gtipIds.length
      ? supabase.from("gtips").select("id, code, description").in("id", gtipIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const groupById = new Map<string, string>(
    (groupsRaw ?? []).map((group: any) => [String(group.id), String(group.name ?? "")])
  );
  const gtipById = new Map<string, { code: string; description: string }>(
    (gtipsRaw ?? []).map((gtip: any) => [
      String(gtip.id),
      {
        code: String(gtip.code ?? ""),
        description: String(gtip.description ?? ""),
      },
    ])
  );

  const attributesByProduct = new Map<string, string[]>();
  const extraAttributesByProduct = new Map<string, string[]>();

  for (const part of chunk(productIds)) {
    const [{ data: attrRows, error: attrError }, { data: extraRows, error: extraError }] =
      await Promise.all([
        supabase
          .from("product_attribute_values")
          .select("product_id, value_text, value_number, product_attributes(name, unit, value_type)")
          .in("product_id", part),
        supabase
          .from("product_extra_attributes")
          .select("product_id, name, unit, value_type, value_text, value_number")
          .in("product_id", part),
      ]);

    if (attrError) {
      return NextResponse.json({ error: attrError.message }, { status: 500 });
    }
    if (extraError) {
      return NextResponse.json({ error: extraError.message }, { status: 500 });
    }

    (attrRows ?? []).forEach((row: any) => {
      const attribute = takeRelation(row.product_attributes);
      const name = attribute?.name ? String(attribute.name) : "";
      if (!row.product_id || !name) return;

      const rawValue =
        attribute?.value_type === "number" ? row.value_number : row.value_text;
      const value = formatValue(rawValue);
      if (!value) return;

      const unit = attribute?.unit ? ` ${attribute.unit}` : "";
      const current = attributesByProduct.get(String(row.product_id)) ?? [];
      current.push(`${name}: ${value}${unit}`);
      attributesByProduct.set(String(row.product_id), current);
    });

    (extraRows ?? []).forEach((row: any) => {
      const name = row.name ? String(row.name) : "";
      if (!row.product_id || !name) return;

      const rawValue = row.value_type === "number" ? row.value_number : row.value_text;
      const value = formatValue(rawValue);
      if (!value) return;

      const unit = row.unit ? ` ${row.unit}` : "";
      const current = extraAttributesByProduct.get(String(row.product_id)) ?? [];
      current.push(`${name}: ${value}${unit}`);
      extraAttributesByProduct.set(String(row.product_id), current);
    });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Otobsr Import";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Urunler", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "Urun Kodu", key: "code", width: 22 },
    { header: "Urun Adi", key: "name", width: 34 },
    { header: "Marka", key: "brand", width: 18 },
    { header: "Stok Kodu / Netsis", key: "netsis", width: 20 },
    { header: "Kategori", key: "group", width: 24 },
    { header: "GTIP", key: "gtip", width: 18 },
    { header: "GTIP Aciklama", key: "gtipDescription", width: 32 },
    ...(canSeeFinance
      ? [
          { header: "Birim Fiyat", key: "unitPrice", width: 14 },
          { header: "Yurt Ici Masraf %", key: "domesticCostPercent", width: 16 },
        ]
      : []),
    { header: "Nitelikler", key: "attributes", width: 44 },
    { header: "Ek Nitelikler", key: "extraAttributes", width: 44 },
    { header: "Aciklama", key: "description", width: 36 },
    { header: "Notlar", key: "notes", width: 36 },
    { header: "Olusturma Tarihi", key: "createdAt", width: 16 },
  ];

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF101817" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  products.forEach((product) => {
    const gtip = product.gtip_id ? gtipById.get(product.gtip_id) : null;

    worksheet.addRow({
      code: product.code ?? "",
      name: product.name ?? "",
      brand: product.brand ?? "",
      netsis: product.netsis_stok_kodu ?? "",
      group: product.group_id ? groupById.get(product.group_id) ?? "" : "",
      gtip: gtip?.code ?? "",
      gtipDescription: gtip?.description ?? "",
      unitPrice: product.unit_price ?? "",
      domesticCostPercent: product.domestic_cost_percent ?? "",
      attributes: (attributesByProduct.get(product.id) ?? []).join(" | "),
      extraAttributes: (extraAttributesByProduct.get(product.id) ?? []).join(" | "),
      description: product.description ?? "",
      notes: product.notes ?? "",
      createdAt: formatDate(product.created_at),
    });
  });

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        left: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
        right: { style: "thin", color: { argb: "FFE5E7EB" } },
      };
      cell.alignment = {
        vertical: "top",
        wrapText: rowNumber !== 1,
      };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `urunler-export-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "x-row-count": String(products.length),
    },
  });
}

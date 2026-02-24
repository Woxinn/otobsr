// FEATURE: customs-export with type-based grouping and compliance lookup
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AttrRow = {
  product_id: string;
  value_text: string | null;
  value_number: number | null;
  attribute?: { name?: string | null } | null;
};

type ExtraAttrRow = {
  product_id: string | null;
  name: string | null;
  value_text: string | null;
  value_number: number | null;
};

type ComplianceRow = {
  id: string;
  product_type_id: string | null;
  country: string | null;
  tse_status: string | null;
  analiz_gecerlilik: string | null;
  tareks_no: string | null;
  rapor_no: string | null;
  valid_from: string | null;
  valid_to: string | null;
  product_types?: { name?: string | null } | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId zorunlu" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  // Helpers
  const parseNumber = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(",", ".");
    if (!text) return null;
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  };

  // Güvenli normalize: diakritik temizleyemese bile düşmesin
  const normalizeName = (name?: string | null) => {
    if (!name) return "";
    try {
      return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    } catch {
      return name.toLowerCase();
    }
  };

  const isWeightName = (name?: string | null) => {
    const lower = normalizeName(name);
    return (
      lower.includes("weight") ||
      lower.includes("agirlik") || // ağırlık diacritics stripped
      lower.includes("kg")
    );
  };

  const normalizeCode = (value: unknown) =>
    String(value ?? "")
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  // Generic pagination helper to bypass PostgREST default limits
  const fetchAll = async <T,>(
    fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
  ) => {
    const pageSize = 1000;
    let from = 0;
    let acc: T[] = [];
    while (true) {
      const { data, error } = await fetchPage(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data ?? [];
      acc = acc.concat(rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return acc;
  };

  // Order header for supplier country
  const { data: orderHeader } = await supabase
    .from("orders")
    .select("id, supplier_id")
    .eq("id", orderId)
    .maybeSingle();

  let supplierCountry: string | null = null;
  if (orderHeader?.supplier_id) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("country")
      .eq("id", orderHeader.supplier_id)
      .maybeSingle();
    supplierCountry = (supplier as any)?.country ?? null;
  }

  // Order items + products
  const { data: orderItems, error: oiError } = await supabase
    .from("order_items")
    .select(
      "id, order_id, product_id, quantity, unit_price, orders(name), products(id, code, name, gtip_id, domestic_cost_percent, product_type_id, gtip:gtips(code), product_type:product_types(name))"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (oiError) {
    return NextResponse.json({ error: oiError.message }, { status: 500 });
  }

  // Packing lines
  const { data: packingLists } = await supabase
    .from("packing_lists")
    .select("id")
    .eq("order_id", orderId);
  const packingListIds = packingLists?.map((p) => p.id) ?? [];
  let packingLines: any[] = [];
  if (packingListIds.length) {
    const { data: lines } = await supabase
      .from("packing_list_lines")
      .select(
        "product_id, product_name_raw, quantity, net_weight, gross_weight, packages_count"
      )
      .in("packing_list_id", packingListIds);
    packingLines = lines ?? [];
  }

  // Attributes and extra attributes
  const productIds = Array.from(
    new Set(
      (orderItems ?? [])
        .map((oi: any) =>
          Array.isArray(oi.products) ? oi.products[0]?.id : oi.products?.id
        )
        .filter(Boolean) as string[]
    )
  );

  // Tip attributelerini belirlemek için TUM attribute'ları çekip normalize ederek filtrele (ilike eksikleri kaçırmasın diye)
  const allAttributes = await fetchAll<any>(async (from, to) => {
    return await supabase
      .from("product_attributes")
      .select("id, name")
      .range(from, to);
  });
  const tipAttributeIds = new Set<string>(
    (allAttributes ?? [])
      .filter((a: any) => normalizeName(a.name).includes("tip"))
      .map((a: any) => a.id as string)
      .filter(Boolean)
  );

  // DEBUG: tip attribute id'lerini logla (server console)
  console.log(
    "[customs-export] tip attribute ids",
    Array.from(tipAttributeIds),
    "all attrs:",
    (allAttributes ?? []).length
  );

  // Büyük IN listeleri HeadersOverflow hatasına yol açmasın diye product id'leri parçalıyoruz
  const chunkIds = (arr: string[], size = 100) => {
    const res: string[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      res.push(arr.slice(i, i + size));
    }
    return res;
  };

  const attrValues: any[] = [];
  if (productIds.length) {
    for (const chunk of chunkIds(productIds, 100)) {
      const { data, error } = await supabase
        .from("product_attribute_values")
        .select(
          "product_id, attribute_id, value_text, value_number, attribute:product_attributes(name)"
        )
        .in("product_id", chunk);
      if (error) throw error;
      if (data) attrValues.push(...data);
    }
  }

  const extraAttrValues: ExtraAttrRow[] = [];
  if (productIds.length) {
    for (const chunk of chunkIds(productIds, 100)) {
      const { data, error } = await supabase
        .from("product_extra_attributes")
        .select("product_id, name, value_text, value_number")
        .in("product_id", chunk);
      if (error) throw error;
      if (data) extraAttrValues.push(...data);
    }
  }

  // Compliance rows (tip uyumluluk) - tamamını çekiyoruz ki tip adıyla da eşleşsin
  const { data: typeComplianceRows } = await supabase
    .from("product_type_compliance")
    .select("*, product_types(name)");

  const lengthByProduct = new Map<string, string | number>();
  const typeByProduct = new Map<string, string>();
  const weightByProduct = new Map<string, number>();

  (attrValues ?? []).forEach((row: any) => {
    const attrName = normalizeName(row.attribute?.name);
    const attrId = (row as any).attribute_id as string | undefined;
    const val =
      row.value_number !== null && row.value_number !== undefined
        ? row.value_number
        : row.value_text ?? "";

    if (attrName.startsWith("uzunluk")) {
      lengthByProduct.set(row.product_id, val);
    }

    const isTipAttr =
      (attrId && tipAttributeIds.has(attrId)) || attrName.includes("tip");
    if (isTipAttr) {
      if (val !== "") {
        typeByProduct.set(row.product_id, String(val));
      }
    }

    if (isWeightName(attrName)) {
      const num = row.value_number ?? parseNumber(row.value_text ?? "");
      if (num !== null) weightByProduct.set(row.product_id, Number(num));
    }
  });

  (extraAttrValues ?? ([] as ExtraAttrRow[])).forEach((row) => {
    if (!row.product_id) return;

    // Tip bilgisi extra attr'dan geldiyse al (boşsa alma, boş olanı da override et)
    const nameLower = normalizeName(row.name);
    if (nameLower.includes("tip")) {
      const val =
        row.value_text ?? (row.value_number !== null ? String(row.value_number) : "");
      if (
        val &&
        (!typeByProduct.has(row.product_id) || typeByProduct.get(row.product_id) === "")
      ) {
        typeByProduct.set(row.product_id, val);
      }
    }

    // Ağırlık bilgisi
    if (isWeightName(row.name)) {
      const num = row.value_number ?? parseNumber(row.value_text ?? "");
      if (num !== null) {
        weightByProduct.set(row.product_id, Number(num));
      }
    }
  });

  // Compliance map by type_id
  const complianceByType = new Map<string, ComplianceRow[]>();
  (typeComplianceRows ?? ([] as ComplianceRow[])).forEach((row) => {
    if (!row.product_type_id) return;
    const arr = complianceByType.get(row.product_type_id) ?? [];
    arr.push(row);
    complianceByType.set(row.product_type_id, arr);
  });

  const pickCompliance = (typeId?: string | null, typeName?: string | null) => {
    const today = new Date();
    const fitsDate = (r: ComplianceRow) => {
      const fromOk = !r.valid_from || new Date(r.valid_from) <= today;
      const toOk = !r.valid_to || new Date(r.valid_to) >= today;
      return fromOk && toOk;
    };

    const pickFrom = (rows: ComplianceRow[]) => {
      if (!rows.length) return null;
      const countryMatchDated = rows.find(
        (r) =>
          supplierCountry &&
          r.country?.toLowerCase() === supplierCountry.toLowerCase() &&
          fitsDate(r)
      );
      if (countryMatchDated) return countryMatchDated;
      const genericDated = rows.find((r) => !r.country && fitsDate(r));
      if (genericDated) return genericDated;
      const countryAnyDate = rows.find(
        (r) =>
          supplierCountry &&
          r.country?.toLowerCase() === supplierCountry.toLowerCase()
      );
      if (countryAnyDate) return countryAnyDate;
      return rows[0];
    };

    if (typeId) {
      const rows = complianceByType.get(typeId) ?? [];
      const picked = pickFrom(rows);
      if (picked) return picked;
    }

    if (typeName) {
      const rows = (typeComplianceRows as ComplianceRow[]).filter(
        (r) => r.product_types?.name?.toLowerCase?.() === typeName.toLowerCase()
      );
      const picked = pickFrom(rows);
      if (picked) return picked;
    }

    return null;
  };

  // Packing lines grouped (tek kayıt, alias desteği)
  type PackEntry = { qty: number; net: number; gross: number; boxes: number };
  const packingMain = new Map<string, PackEntry>(); // primary key -> entry
  const codeAlias = new Map<string, string>(); // code key -> primary key

  for (const line of packingLines) {
    const normalizedCode = normalizeCode(line.product_name_raw);
    const hasPid = Boolean(line.product_id);
    if (!hasPid && !normalizedCode) continue;

    const key = hasPid ? `pid:${line.product_id}` : `code:${normalizedCode}`;
    const qty = Number(line.quantity ?? 0) || 0;
    const boxes = Number(line.packages_count ?? 0) || 0;
    const netVal = Number(line.net_weight ?? 0) || 0;
    const grossVal = Number(line.gross_weight ?? 0) || 0;

    const entry = packingMain.get(key) ?? { qty: 0, net: 0, gross: 0, boxes: 0 };
    entry.qty += qty;
    entry.net += netVal;
    entry.gross += grossVal;
    entry.boxes += boxes;
    packingMain.set(key, entry);

    if (normalizedCode) codeAlias.set(normalizedCode, key);
  }

  const resolvePackKey = (pid: string | null | undefined, codeKey: string) => {
    const pidKey = pid ? `pid:${pid}` : null;
    if (pidKey && packingMain.has(pidKey)) return pidKey;
    const aliasKey = codeAlias.get(codeKey);
    if (aliasKey && packingMain.has(aliasKey)) return aliasKey;
    const codeOnlyKey = `code:${codeKey}`;
    if (packingMain.has(codeOnlyKey)) return codeOnlyKey;
    return null;
  };

  const consumePacking = (
    pid: string | null | undefined,
    codeKey: string,
    needQty: number
  ): PackEntry | null => {
    const key = resolvePackKey(pid, codeKey);
    if (!key) return null;
    const entry = packingMain.get(key)!;
    if (!entry.qty || entry.qty <= 0) return null;

    const useQty = needQty > 0 ? Math.min(entry.qty, needQty) : entry.qty;
    const ratio = entry.qty > 0 ? useQty / entry.qty : 0;
    const used: PackEntry = {
      qty: useQty,
      net: entry.net * ratio,
      gross: entry.gross * ratio,
      boxes: entry.boxes * ratio,
    };

    entry.qty -= useQty;
    entry.net -= used.net;
    entry.gross -= used.gross;
    entry.boxes -= used.boxes;

    if (entry.qty <= 0.0001) {
      packingMain.delete(key);
      // ilgili aliasları da sil
      for (const [aliasCode, target] of Array.from(codeAlias.entries())) {
        if (target === key) codeAlias.delete(aliasCode);
      }
    } else {
      packingMain.set(key, entry);
    }

    return used;
  };

  // Excel hazırlığı
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Gumruk");

  const fmt2 = (value: any) => {
    if (value === null || value === undefined || value === "") return value;
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return Number(n.toFixed(2));
  };
  ws.columns = [
    { header: "Sira No", key: "sira", width: 8 },
    { header: "Fatura Sira No", key: "fatura_sira", width: 14 },
    { header: "Ürün Kodu", key: "urun_kodu", width: 18 },
    { header: "Ürün Adi", key: "urun_adi", width: 28 },
    { header: "Uzunluk", key: "uzunluk", width: 12 },
    { header: "Adet", key: "adet", width: 10 },
    { header: "Birim Fiyat", key: "birim_fiyat", width: 14 },
    { header: "Net Agirlik", key: "net", width: 12 },
    { header: "Brut Agirlik", key: "brut", width: 12 },
    { header: "Koli Adedi", key: "koli", width: 12 },
    { header: "GTIP", key: "gtip", width: 14 },
    { header: "Tip", key: "tip", width: 14 },
    { header: "TSE Durumu", key: "tse", width: 14 },
    { header: "Analiz Gecerlilik", key: "analiz", width: 16 },
    { header: "TAREKS No", key: "tareks", width: 14 },
    { header: "RAPOR No", key: "rapor", width: 14 },
  ];
  const rowMap = new Map<
    string,
    {
      urun_kodu: string;
      urun_adi: string;
      uzunluk: string | number | null;
      adet: number;
      birim_fiyat: number | string | null;
      net: number;
      brut: number;
      koli: number;
      gtip: string;
      tip: string;
      tse: string;
      analiz: string;
      tareks: string;
      rapor: string;
      _gtipKey: string;
    }
  >();
  const gtipSummary = new Map<
    string,
    Map<string, { qty: number; amount: number; net: number; gross: number; koli: number }>
  >();
  (orderItems ?? []).forEach((oi, idx) => {
    const product = Array.isArray((oi as any).products)
      ? (oi as any).products[0]
      : (oi as any).products;
    if (!product) return;
    const code = product.code ?? "";
    const codeKey = normalizeCode(code);
    const orderQty = Number(oi.quantity ?? 0) || 0;
    const packing = consumePacking(product.id, codeKey, orderQty);
    const qty = packing ? packing.qty : orderQty;
    const netExport = packing ? packing.net : "";
    const grossExport = packing ? packing.gross : "";
    const boxesExport = packing ? packing.boxes : 0;
    const tipKey = typeByProduct.get(product.id) ?? product.product_type?.name ?? "Belirtilecek";
    const comp = pickCompliance(product.product_type_id, product.product_type?.name ?? tipKey);

    const amount = qty * (Number(oi.unit_price ?? 0) || 0);
    const gtipCode = (product as any).gtip?.code ?? "Belirlenmedi";
    const key = `${product.id ?? code}::${tipKey}::${lengthByProduct.get(product.id) ?? ""}::${gtipCode}`;
    const existing = rowMap.get(key) ?? {
      urun_kodu: code,
      urun_adi: product.name ?? "",
      uzunluk: lengthByProduct.get(product.id) ?? "",
      adet: 0,
      birim_fiyat: oi.unit_price ?? "",
      net: 0,
      brut: 0,
      koli: 0,
      gtip: gtipCode,
      tip: tipKey,
      tse: comp?.tse_status ?? "",
      analiz: comp?.analiz_gecerlilik ?? "",
      tareks: comp?.tareks_no ?? "",
      rapor: comp?.rapor_no ?? "",
      _gtipKey: gtipCode,
    };
    existing.adet += qty;
    existing.net += Number(netExport || 0);
    existing.brut += Number(grossExport || 0);
    existing.koli += Number(boxesExport || 0);
    rowMap.set(key, existing);

    const typeKey = tipKey ?? "Belirtilmedi";
    if (!gtipSummary.has(gtipCode)) gtipSummary.set(gtipCode, new Map());
    const typeMap = gtipSummary.get(gtipCode)!;
    if (!typeMap.has(typeKey))
      typeMap.set(typeKey, { qty: 0, amount: 0, net: 0, gross: 0, koli: 0 });
    const agg = typeMap.get(typeKey)!;
    agg.qty += qty;
    agg.amount += amount;
    agg.net += Number(netExport || 0);
    agg.gross += Number(grossExport || 0);
    agg.koli += Number(boxesExport || 0);
  });

  const rows = Array.from(rowMap.values()).map((row) => ({
    ...row,
    adet: fmt2(row.adet),
    birim_fiyat: fmt2(row.birim_fiyat),
    net: fmt2(row.net),
    brut: fmt2(row.brut),
    koli: fmt2(row.koli),
  }));

  // GTIP alanına göre gruplayıp sırala; her GTIP içinde önce tip, sonra uzunluk
  const sorted = rows.sort((a, b) => {
    const ga = (a._gtipKey ?? "").toString();
    const gb = (b._gtipKey ?? "").toString();
    if (ga === gb) {
      const ta = (a.tip ?? "").toString();
      const tb = (b.tip ?? "").toString();
      if (ta !== tb) return ta.localeCompare(tb, "tr");
      const la = parseNumber(a.uzunluk ?? "") ?? Number.POSITIVE_INFINITY;
      const lb = parseNumber(b.uzunluk ?? "") ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return (a.urun_kodu ?? "").localeCompare(b.urun_kodu ?? "");
    }
    return ga.localeCompare(gb);
  });

  // GTIP gruplari icin daha zıt renk paleti
  const palette = [
    "FFFFC107", // amber
    "FF00BCD4", // cyan
    "FF8BC34A", // light green
    "FF9C27B0", // purple
    "FFFF5722", // deep orange
    "FF03A9F4", // light blue
    "FFE91E63", // pink
    "FF4CAF50", // green
  ];
  const colorByGtip = new Map<string, string>();

  let rowIndex = 1;
  sorted.forEach((r) => {
    const gtipKey = r._gtipKey ?? "Belirlenmedi";
    if (!colorByGtip.has(gtipKey)) {
      const nextColor = palette[colorByGtip.size % palette.length];
      colorByGtip.set(gtipKey, nextColor);
    }
    const { _gtipKey, ...rest } = r as any;
    const out = {
      ...rest,
      sira: rowIndex,
      fatura_sira: rowIndex,
    };
    rowIndex += 1;
    const row = ws.addRow(out);
    row.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorByGtip.get(gtipKey)! },
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
    });
  });

  ws.getRow(1).font = { bold: true };
  // Baslik satiri kenarliklari (tumu)
  ws.getRow(1).eachCell((cell) => {
    cell.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
      left: { style: "medium", color: { argb: "FF000000" } },
      bottom: { style: "medium", color: { argb: "FF000000" } },
      right: { style: "medium", color: { argb: "FF000000" } },
    };
  });

  // 4 satır boşluk
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);

  // GTIP bazlı tip özet tabloları
  const headerFill: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB3B" } };
  const typeFill: any = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0E7FF" } };

  const gtipCodesSorted = Array.from(gtipSummary.keys()).sort((a, b) => a.localeCompare(b, "tr"));
  let grandQty = 0;
  let grandAmount = 0;
  let grandNet = 0;
  let grandGross = 0;
  let grandKoli = 0;
  gtipCodesSorted.forEach((gtipCode) => {
    const typeMap = gtipSummary.get(gtipCode)!;
    const header = ws.addRow([
      "",
      "",
      "",
      "",
      gtipCode,
      "ADET",
      "TUTAR",
      "NET",
      "BRÜT",
      "KOLİ",
    ]);
    header.eachCell((c, colNumber) => {
      if (colNumber < 5) return;
      c.fill = headerFill;
      c.font = { bold: true };
      c.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
    });

    let sumQty = 0;
    let sumAmount = 0;
    let sumNet = 0;
    let sumGross = 0;
    let sumKoli = 0;

    const typeKeys = Array.from(typeMap.keys()).sort((a, b) => a.localeCompare(b, "tr"));
    typeKeys.forEach((t) => {
      const agg = typeMap.get(t)!;
      const row = ws.addRow([
        "",
        "",
        "",
        "",
        t,
        fmt2(agg.qty),
        fmt2(agg.amount),
        fmt2(agg.net),
        fmt2(agg.gross),
        fmt2(agg.koli),
      ]);
      row.eachCell((c, colNumber) => {
        if (colNumber < 5) return;
        c.fill = typeFill;
        c.border = {
          top: { style: "medium", color: { argb: "FF000000" } },
          left: { style: "medium", color: { argb: "FF000000" } },
          bottom: { style: "medium", color: { argb: "FF000000" } },
          right: { style: "medium", color: { argb: "FF000000" } },
        };
      });
      sumQty += agg.qty;
      sumAmount += agg.amount;
      sumNet += agg.net;
      sumGross += agg.gross;
      sumKoli += agg.koli;
    });

    grandQty += sumQty;
    grandAmount += sumAmount;
    grandNet += sumNet;
    grandGross += sumGross;
    grandKoli += sumKoli;

    const totalRow = ws.addRow([
      "",
      "",
      "",
      "",
      "TOPLAM",
      fmt2(sumQty),
      fmt2(sumAmount),
      fmt2(sumNet),
      fmt2(sumGross),
      fmt2(sumKoli),
    ]);
    totalRow.eachCell((c, colNumber) => {
      if (colNumber < 5) return;
      c.fill = headerFill;
      c.font = { bold: true };
      c.border = {
        top: { style: "medium", color: { argb: "FF000000" } },
        left: { style: "medium", color: { argb: "FF000000" } },
        bottom: { style: "medium", color: { argb: "FF000000" } },
        right: { style: "medium", color: { argb: "FF000000" } },
      };
    });

    // araya bir boş satır
    ws.addRow([]);
  });

  // Genel toplam (tüm tabloların en altından 1 satır sonra)
  ws.addRow([]);
  const grandHeader = ws.addRow([
    "",
    "",
    "",
    "",
    "GENEL TOPLAM",
    "ADET",
    "TUTAR",
    "NET",
    "BRÜT",
    "KOLİ",
  ]);
  grandHeader.eachCell((c, colNumber) => {
    if (colNumber < 5) return;
    c.fill = headerFill;
    c.font = { bold: true };
    c.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
      left: { style: "medium", color: { argb: "FF000000" } },
      bottom: { style: "medium", color: { argb: "FF000000" } },
      right: { style: "medium", color: { argb: "FF000000" } },
    };
  });

  const grandRow = ws.addRow([
    "",
    "",
    "",
    "",
    "",
    fmt2(grandQty),
    fmt2(grandAmount),
    fmt2(grandNet),
    fmt2(grandGross),
    fmt2(grandKoli),
  ]);
  grandRow.eachCell((c, colNumber) => {
    if (colNumber < 5) return;
    c.fill = headerFill;
    c.font = { bold: true };
    c.border = {
      top: { style: "medium", color: { argb: "FF000000" } },
      left: { style: "medium", color: { argb: "FF000000" } },
      bottom: { style: "medium", color: { argb: "FF000000" } },
      right: { style: "medium", color: { argb: "FF000000" } },
    };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="gumruk-${orderId}.xlsx"`,
    },
  });
}






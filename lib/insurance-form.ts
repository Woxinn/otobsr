import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type InsuranceFormPayload = {
  requestDate: string;
  insuredCompanyName: string;
  insuredAddress: string;
  taxNo: string;
  mortgagee: string;
  consignmentNo: string;
  flotanNo: string;
  goodsValue: string;
  lcNo: string;
  goodsDescription: string;
  goodsQtyTonnage: string;
  startLocation: string;
  vehicleDetail: string;
  endLocation: string;
  departureDate: string;
  arrivalDate: string;
  insurancePrice: string;
};

export type InsuranceFormData = {
  orderId: string;
  orderLabel: string;
  payload: InsuranceFormPayload;
};

const COMPANY_NAME = "OTO BASAR SAN. VE TIC. LTD STI";
const COMPANY_ADDRESS =
  "F. CAKMAK MAH. SILA CAD. ELIT SANAYI SITESI B BLOK NO:48/K, KARATAY/KONYA";
const COMPANY_TAX_NO = "6490017744";

const formatDate = (value: string | null | undefined) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("tr-TR").format(date);
};

const formatNumber = (value: number | null | undefined, digits = 0) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "";
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(num);
};

const formatMoney = (value: number | null | undefined, currency: string | null | undefined) => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "";
  const code = (currency ?? "USD").toUpperCase();
  const symbols: Record<string, string> = { USD: "$", EUR: "EUR", TRY: "TL" };
  const prefix = symbols[code] ?? code;
  return `${prefix}${formatNumber(num, 2)}`;
};

const textOrDash = (value: string | null | undefined) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

export const sanitizeFileName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "siparis";

export const normalizeInsuranceFormPayload = (input: Partial<InsuranceFormPayload>): InsuranceFormPayload => ({
  requestDate: textOrDash(input.requestDate),
  insuredCompanyName: textOrDash(input.insuredCompanyName),
  insuredAddress: textOrDash(input.insuredAddress),
  taxNo: textOrDash(input.taxNo),
  mortgagee: textOrDash(input.mortgagee),
  consignmentNo: textOrDash(input.consignmentNo),
  flotanNo: textOrDash(input.flotanNo),
  goodsValue: textOrDash(input.goodsValue),
  lcNo: textOrDash(input.lcNo),
  goodsDescription: textOrDash(input.goodsDescription),
  goodsQtyTonnage: textOrDash(input.goodsQtyTonnage),
  startLocation: textOrDash(input.startLocation),
  vehicleDetail: textOrDash(input.vehicleDetail),
  endLocation: textOrDash(input.endLocation),
  departureDate: textOrDash(input.departureDate),
  arrivalDate: textOrDash(input.arrivalDate),
  insurancePrice: textOrDash(input.insurancePrice),
});

export const getInsuranceFormRows = (payload: InsuranceFormPayload): Array<[string, string]> => [
  ["TALEP TARIHI", payload.requestDate],
  ["SIGORTALI ADI / UNVANI", payload.insuredCompanyName],
  ["ADRESI", payload.insuredAddress],
  ["VERGI NO", payload.taxNo],
  ["DAIMI MURTEHIN", payload.mortgagee],
  ["KONSIMENTO NO", payload.consignmentNo],
  ["FLOTAN NO", payload.flotanNo],
  ["EMTEA BEDELI (USD)", payload.goodsValue],
  ["AKREDITIF NO", payload.lcNo],
  ["EMTEA CINSI", payload.goodsDescription],
  ["EMTEA ADET/TONAJI", payload.goodsQtyTonnage],
  ["S.BASLANGIC YERI", payload.startLocation],
  ["VASITA CINSI / DETAYI", payload.vehicleDetail],
  ["S.BITIS YERI", payload.endLocation],
  ["CIKIS TARIHI", payload.departureDate],
  ["VARIS TARIHI (TAHMINI)", payload.arrivalDate],
  ["SIGORTA BEDELI", payload.insurancePrice],
];

export async function buildInsuranceWorkbook(payload: InsuranceFormPayload) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Navlun Sigortasi");
  const rows = getInsuranceFormRows(payload);

  sheet.columns = [
    { key: "label", width: 28 },
    { key: "value", width: 95 },
  ];

  sheet.mergeCells("A1:B1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "NAVLUN SIGORTASI BILGI FORMU";
  titleCell.font = { bold: true, size: 18 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  rows.forEach(([label, value], index) => {
    const rowIndex = index + 2;
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.height = 22;
  });

  for (let rowIndex = 2; rowIndex <= rows.length + 1; rowIndex += 1) {
    for (let col = 1; col <= 2; col += 1) {
      const cell = sheet.getRow(rowIndex).getCell(col);
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (col === 1) {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF6F6F6" },
        };
      }
    }
  }

  return workbook.xlsx.writeBuffer();
}

export async function getInsuranceFormData(orderId: string): Promise<InsuranceFormData | null> {
  const supabase = await createSupabaseServerClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;

  const [{ data: shipmentLinks }, { data: packingSummary }, { data: orderItems }] =
    await Promise.all([
      supabase.from("shipment_orders").select("shipment_id").eq("order_id", order.id),
      supabase
        .from("order_packing_list_summary")
        .select("total_packages, total_gross_weight_kg")
        .eq("order_id", order.id)
        .maybeSingle(),
      supabase
        .from("order_items")
        .select("name, products(name, gtip_id, gtips(insurance_emtea_cinsi))")
        .eq("order_id", order.id)
        .order("line_no", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);

  const shipmentIds = Array.from(
    new Set((shipmentLinks ?? []).map((row: any) => row?.shipment_id).filter(Boolean))
  );

  const { data: linkedShipmentsRaw } = shipmentIds.length
    ? await supabase
        .from("shipments")
        .select(
          "id, file_no, vessel_name, vessel_imo, vessel_flag, etd_planned, atd_actual, eta_current, notes, container_type, container_no, seal_no, origin_port:ports!origin_port_id(name), destination_port:ports!destination_port_id(name), forwarders(name)"
        )
        .in("id", shipmentIds)
    : { data: [] as any[] };

  const linkedShipments = linkedShipmentsRaw ?? [];
  const primaryShipment =
    linkedShipments
      .slice()
      .sort((a: any, b: any) => {
        const left = a?.eta_current ? new Date(a.eta_current).getTime() : Number.MAX_SAFE_INTEGER;
        const right = b?.eta_current ? new Date(b.eta_current).getTime() : Number.MAX_SAFE_INTEGER;
        return left - right;
      })[0] ?? null;

  const packageCount = Number(packingSummary?.total_packages ?? order.packages ?? 0);
  const grossWeightKg = Number(packingSummary?.total_gross_weight_kg ?? order.weight_kg ?? 0);

  const gtipGoodsDescriptions = Array.from(
    new Set(
      (orderItems ?? [])
        .map((item: any) => {
          const productRaw = item?.products;
          const product = Array.isArray(productRaw) ? productRaw[0] : productRaw;
          const gtipRaw = product?.gtips;
          const gtip = Array.isArray(gtipRaw) ? gtipRaw[0] : gtipRaw;
          return String(gtip?.insurance_emtea_cinsi ?? "").trim();
        })
        .filter(Boolean)
    )
  );

  const goodsNames = Array.from(
    new Set(
      (orderItems ?? [])
        .map((item: any) => String(item?.name ?? item?.products?.name ?? "").trim())
        .filter(Boolean)
    )
  );
  const goodsDescription =
    gtipGoodsDescriptions.length > 0
      ? gtipGoodsDescriptions.join(" / ")
      : goodsNames.length > 0
      ? goodsNames.slice(0, 4).join(" / ")
      : order.name ?? "-";

  const voyageParts = [
    primaryShipment?.vessel_name ? `GEMI: ${primaryShipment.vessel_name}` : "",
    primaryShipment?.vessel_imo ? `IMO: ${primaryShipment.vessel_imo}` : "",
    primaryShipment?.vessel_flag ? `BAYRAK: ${primaryShipment.vessel_flag}` : "",
    primaryShipment?.forwarders?.name ? `FORWARDER: ${primaryShipment.forwarders.name}` : "",
    primaryShipment?.container_type ? `TIP: ${primaryShipment.container_type}` : "",
    primaryShipment?.container_no ? `KONTEYNER: ${primaryShipment.container_no}` : "",
    primaryShipment?.seal_no ? `SEAL: ${primaryShipment.seal_no}` : "",
    primaryShipment?.notes ? `NOT: ${primaryShipment.notes}` : "",
  ].filter(Boolean);

  const payload = normalizeInsuranceFormPayload({
    requestDate: formatDate(new Date().toISOString()),
    insuredCompanyName: COMPANY_NAME,
    insuredAddress: COMPANY_ADDRESS,
    taxNo: COMPANY_TAX_NO,
    mortgagee: COMPANY_NAME,
    consignmentNo: textOrDash(order.consignment_no),
    flotanNo: textOrDash(primaryShipment?.file_no),
    goodsValue: formatMoney(order.total_amount, order.currency),
    lcNo: order.payment_method === "LC" ? "LC" : "-",
    goodsDescription: textOrDash(goodsDescription),
    goodsQtyTonnage: `${packageCount > 0 ? `${formatNumber(packageCount, 0)} Kasa` : "-"} / ${
      grossWeightKg > 0 ? `${formatNumber(grossWeightKg, 2)} KG` : "-"
    }`,
    startLocation: textOrDash(primaryShipment?.origin_port?.name),
    vehicleDetail: textOrDash(voyageParts.join(" / ")),
    endLocation: textOrDash(primaryShipment?.destination_port?.name),
    departureDate: formatDate(primaryShipment?.atd_actual ?? primaryShipment?.etd_planned),
    arrivalDate: formatDate(primaryShipment?.eta_current),
    insurancePrice: "+ % 0",
  });

  return {
    orderId: String(order.id),
    orderLabel: String(order.name ?? order.code ?? order.id),
    payload,
  };
}

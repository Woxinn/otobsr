type NumberLike = string | number | null | undefined;

export type WeightResolutionSource =
  | "direct"
  | "packing_item_share"
  | "summary_fob_share"
  | "summary_qty_share"
  | "missing";

export type WeightResolution = {
  itemId: string;
  netKg: number;
  grossKg: number;
  netSource: WeightResolutionSource;
  grossSource: WeightResolutionSource;
  warnings: string[];
};

export type WeightTotals = {
  knownNetKg: number;
  knownGrossKg: number;
  summaryNetKg: number;
  summaryGrossKg: number;
  fallbackNetKg: number;
  fallbackGrossKg: number;
};

type OrderItemInput = {
  id: string;
  quantity: NumberLike;
  totalAmount: NumberLike;
  unitPrice: NumberLike;
  netWeightKg?: NumberLike;
  grossWeightKg?: NumberLike;
  productId?: string | null;
  productCode?: string | null;
};

type PackingItemInput = {
  product_id?: string | null;
  product_code?: string | null;
  quantity?: NumberLike;
  net_weight_kg?: NumberLike;
  gross_weight_kg?: NumberLike;
  weight_kg?: NumberLike;
};

type SummaryInput = {
  total_net_weight_kg?: NumberLike;
  total_gross_weight_kg?: NumberLike;
} | null;

const toNumber = (value: NumberLike) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const round = (value: number, digits = 6) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeCode = (value: string | null | undefined) =>
  (value ?? "").trim().toUpperCase();

export function resolveOrderItemWeights(params: {
  orderItems: OrderItemInput[];
  packingItems: PackingItemInput[];
  summary: SummaryInput;
}): {
  items: Map<string, WeightResolution>;
  totals: WeightTotals;
} {
  const packingByProductId = new Map<string, { qty: number; net: number; gross: number }>();
  const packingByProductCode = new Map<string, { qty: number; net: number; gross: number }>();

  for (const row of params.packingItems) {
    const qty = toNumber(row.quantity);
    const net = toNumber(row.net_weight_kg ?? row.weight_kg);
    const gross = toNumber(row.gross_weight_kg ?? row.weight_kg);
    const productId = row.product_id ? String(row.product_id) : null;
    const productCode = normalizeCode(row.product_code);

    if (productId) {
      const prev = packingByProductId.get(productId) ?? { qty: 0, net: 0, gross: 0 };
      prev.qty += qty;
      prev.net += net;
      prev.gross += gross;
      packingByProductId.set(productId, prev);
    }

    if (productCode) {
      const prev = packingByProductCode.get(productCode) ?? { qty: 0, net: 0, gross: 0 };
      prev.qty += qty;
      prev.net += net;
      prev.gross += gross;
      packingByProductCode.set(productCode, prev);
    }
  }

  const qtyByProductId = new Map<string, number>();
  const qtyByProductCode = new Map<string, number>();

  for (const item of params.orderItems) {
    const qty = toNumber(item.quantity);
    const productId = item.productId ? String(item.productId) : null;
    const productCode = normalizeCode(item.productCode);
    if (productId) qtyByProductId.set(productId, (qtyByProductId.get(productId) ?? 0) + qty);
    if (productCode) qtyByProductCode.set(productCode, (qtyByProductCode.get(productCode) ?? 0) + qty);
  }

  const rows = params.orderItems.map((item) => {
    const quantity = toNumber(item.quantity);
    const fob = toNumber(item.totalAmount || quantity * toNumber(item.unitPrice));
    const productId = item.productId ? String(item.productId) : null;
    const productCode = normalizeCode(item.productCode);
    const directNet = toNumber(item.netWeightKg);
    const directGross = toNumber(item.grossWeightKg);

    const packingAgg =
      (productId ? packingByProductId.get(productId) : null) ??
      (productCode ? packingByProductCode.get(productCode) : null) ??
      null;
    const sameProductQty =
      (productId ? qtyByProductId.get(productId) : null) ??
      (productCode ? qtyByProductCode.get(productCode) : null) ??
      0;
    const qtyShare = sameProductQty > 0 ? quantity / sameProductQty : 0;

    let netKg = 0;
    let grossKg = 0;
    let netSource: WeightResolutionSource = "missing";
    let grossSource: WeightResolutionSource = "missing";
    const warnings: string[] = [];

    if (directNet > 0) {
      netKg = directNet;
      netSource = "direct";
    } else if (packingAgg && packingAgg.net > 0) {
      netKg = round(packingAgg.net * qtyShare, 4);
      netSource = "packing_item_share";
      warnings.push("Net agirlik packing payindan dagitildi");
    }

    if (directGross > 0) {
      grossKg = directGross;
      grossSource = "direct";
    } else if (packingAgg && packingAgg.gross > 0) {
      grossKg = round(packingAgg.gross * qtyShare, 4);
      grossSource = "packing_item_share";
      warnings.push("Brut agirlik packing payindan dagitildi");
    }

    return {
      id: String(item.id),
      quantity,
      fob,
      netKg,
      grossKg,
      netSource,
      grossSource,
      warnings,
    };
  });

  const totalFob = rows.reduce((sum, row) => sum + row.fob, 0);
  const totalQty = rows.reduce((sum, row) => sum + row.quantity, 0);
  const knownNetKg = rows.reduce((sum, row) => sum + row.netKg, 0);
  const knownGrossKg = rows.reduce((sum, row) => sum + row.grossKg, 0);
  const summaryNetKg = toNumber(params.summary?.total_net_weight_kg);
  const summaryGrossKg = toNumber(params.summary?.total_gross_weight_kg);
  const fallbackNetKg = knownNetKg > 0 ? knownNetKg : summaryNetKg;
  const fallbackGrossKg = knownGrossKg > 0 ? knownGrossKg : summaryGrossKg;

  const items = new Map<string, WeightResolution>();
  for (const row of rows) {
    let netKg = row.netKg;
    let grossKg = row.grossKg;
    let netSource: WeightResolutionSource = row.netSource;
    let grossSource: WeightResolutionSource = row.grossSource;
    const warnings = [...row.warnings];

    if (netKg <= 0 && fallbackNetKg > 0) {
      if (totalFob > 0) {
        netKg = round((row.fob / totalFob) * fallbackNetKg, 4);
        netSource = "summary_fob_share";
        warnings.push("Net agirlik FOB payi ile dagitildi");
      } else if (totalQty > 0) {
        netKg = round((row.quantity / totalQty) * fallbackNetKg, 4);
        netSource = "summary_qty_share";
        warnings.push("Net agirlik adet payi ile dagitildi");
      }
    }

    if (grossKg <= 0 && fallbackGrossKg > 0) {
      if (totalFob > 0) {
        grossKg = round((row.fob / totalFob) * fallbackGrossKg, 4);
        grossSource = "summary_fob_share";
        warnings.push("Brut agirlik FOB payi ile dagitildi");
      } else if (totalQty > 0) {
        grossKg = round((row.quantity / totalQty) * fallbackGrossKg, 4);
        grossSource = "summary_qty_share";
        warnings.push("Brut agirlik adet payi ile dagitildi");
      }
    }

    items.set(row.id, {
      itemId: row.id,
      netKg,
      grossKg,
      netSource,
      grossSource,
      warnings,
    });
  }

  return {
    items,
    totals: {
      knownNetKg,
      knownGrossKg,
      summaryNetKg,
      summaryGrossKg,
      fallbackNetKg,
      fallbackGrossKg,
    },
  };
}

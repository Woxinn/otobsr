import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit, canViewFinance } from "@/lib/roles";
import OrderItemsToast from "@/components/OrderItemsToast";
import {
  createOrderItem,
  bulkUpdateOrderItems,
  deleteOrderItem,
  importOrderItems,
  deleteAllOrderItems,
  completeSingleMissingProduct,
} from "@/app/actions/order-items";
import {
  saveOrderPackingListSummary,
} from "@/app/actions/order-packing-list";
import { deletePackingList } from "@/app/actions/packing-lists";
import { deleteOrder, updateOrderStatus } from "@/app/actions/orders";
import { createOrderPayment, deleteOrderPayment } from "@/app/actions/order-payments";
import { deleteOrderDocument } from "@/app/actions/order-documents";
import OrderDocumentUploader from "@/components/OrderDocumentUploader";
import PaymentDocLink from "@/components/PaymentDocLink";
import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  Download,
  Edit3,
  FileArchive,
  FileText,
  PackageCheck,
  PackageSearch,
  ReceiptText,
  Ship,
  WalletCards,
  ChevronDown,
  ClipboardList,
  AlertCircle,
  Plus,
  Anchor,
  Scale,
  Warehouse,
  Compass
} from "lucide-react";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("name, reference_name")
    .eq("id", id)
    .maybeSingle();
  const title =
    order?.name?.trim() ||
    order?.reference_name?.trim() ||
    `#${id.slice(0, 8).toUpperCase()}`;
  return { title: `Sipariş | ${title}` };
}
import ConfirmActionForm from "@/components/ConfirmActionForm";
import SubmitButton from "@/components/SubmitButton";
import MissingProductRow from "@/components/MissingProductRow";
import OrderItemCreateForm from "@/components/OrderItemCreateForm";
import OrderItemsQuickEdit from "@/components/OrderItemsQuickEdit";
import DocumentInlineViewer from "@/components/DocumentInlineViewer";

type PackingSummaryInput = {
  total_packages?: number | null;
  total_net_weight_kg?: number | null;
  total_gross_weight_kg?: number | null;
  total_cbm?: number | null;
  notes?: string | null;
  updated_at?: string | null;
};

const sumPackingLines = (
  lines: { packages_count?: number | null; net_weight?: number | null; gross_weight?: number | null }[]
) =>
  lines.reduce(
    (acc, line) => {
      acc.packages += Number(line.packages_count ?? 0);
      acc.netWeight += Number(line.net_weight ?? 0);
      acc.grossWeight += Number(line.gross_weight ?? 0);
      return acc;
    },
    { packages: 0, netWeight: 0, grossWeight: 0 }
  );

const sumOrderItemsForPacking = (
  items: { net_weight_kg?: number | null; gross_weight_kg?: number | null }[]
) =>
  items.reduce(
    (acc, item) => {
      acc.netWeight += Number(item.net_weight_kg ?? 0);
      acc.grossWeight += Number(item.gross_weight_kg ?? 0);
      return acc;
    },
    { netWeight: 0, grossWeight: 0 }
  );

const ensurePackingSummary = async ({
  supabase,
  orderId,
  packingLines,
  existingSummary,
  orderItems,
  packingListItems,
}: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  orderId: string;
  packingLines: { packages_count?: number | null; net_weight?: number | null; gross_weight?: number | null }[];
  existingSummary: PackingSummaryInput | null;
  orderItems: { net_weight_kg?: number | null; gross_weight_kg?: number | null }[];
  packingListItems: {
    packages?: number | null;
    net_weight_kg?: number | null;
    gross_weight_kg?: number | null;
    weight_kg?: number | null;
    cbm?: number | null;
  }[];
}) => {
  const hasExisting =
    existingSummary &&
    (existingSummary.total_packages ??
      existingSummary.total_net_weight_kg ??
      existingSummary.total_gross_weight_kg ??
      existingSummary.total_cbm);
  if (hasExisting) return existingSummary;

  const fromPacking = packingLines.length ? sumPackingLines(packingLines) : null;
  const fromPackingItems = packingListItems.length
    ? packingListItems.reduce<{
        packages: number;
        netWeight: number;
        grossWeight: number;
        cbm: number;
      }>(
        (acc, item) => {
          acc.packages += Number(item.packages ?? 0);
          acc.netWeight += Number(item.net_weight_kg ?? item.weight_kg ?? 0);
          acc.grossWeight += Number(item.gross_weight_kg ?? item.weight_kg ?? 0);
          acc.cbm += Number(item.cbm ?? 0);
          return acc;
        },
        { packages: 0, netWeight: 0, grossWeight: 0, cbm: 0 }
      )
    : null;
  const fromItems = sumOrderItemsForPacking(orderItems);

  const payload = {
    order_id: orderId,
    total_packages: fromPacking?.packages ?? fromPackingItems?.packages ?? 0,
    total_net_weight_kg:
      fromPacking?.netWeight ?? fromPackingItems?.netWeight ?? fromItems.netWeight ?? 0,
    total_gross_weight_kg:
      fromPacking?.grossWeight ?? fromPackingItems?.grossWeight ?? fromItems.grossWeight ?? 0,
    total_cbm: Number(existingSummary?.total_cbm ?? fromPackingItems?.cbm ?? 0),
    notes: existingSummary?.notes ?? null,
  };

  const { data: upserted } = await supabase
    .from("order_packing_list_summary")
    .upsert([payload], { onConflict: "order_id" })
    .select()
    .maybeSingle();

  return upserted ?? payload;
};

type SearchParams = {
  tab?: string;
  itemsQ?: string;
};

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  const canSeeFinance = canViewFinance(role);
  const isSales = role === "Satis";

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!order) {
    notFound();
  }

  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  const itemsQuery = resolvedSearchParams.itemsQ?.trim();

    let orderItemsQuery = supabase
      .from("order_items")
      .select("*, products(id, code, name, unit_price)")
      .eq("order_id", order.id)
      .order("line_no", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

  if (itemsQuery) {
    orderItemsQuery = orderItemsQuery.ilike("name", `%${itemsQuery}%`);
  }

  const { data: orderItems } = await orderItemsQuery;

  // Light query for totals (tÃ¼m kalemler)
  const { data: orderItemsAll } = await supabase
    .from("order_items")
    .select("quantity, total_amount, net_weight_kg, gross_weight_kg, product_id")
    .eq("order_id", order.id);
  const { data: packingListItems } = await supabase
    .from("order_packing_list_items")
    .select("*, products(id, code, name)")
    .eq("order_id", order.id)
    .order("created_at", { ascending: true });

  const { data: packingSummary } = await supabase
    .from("order_packing_list_summary")
    .select("*")
    .eq("order_id", order.id)
    .maybeSingle();
  // Packing list import (sade akış)
  const { data: packingLists } = await supabase
    .from("packing_lists")
    .select("id, file_name, status, version, created_at")
    .eq("order_id", order.id)
    .order("created_at", { ascending: false });

  const packingListIds = packingLists?.map((p) => p.id) ?? [];
  const { data: packingLines } = packingListIds.length
    ? await supabase
        .from("packing_list_lines")
        .select(
          "packing_list_id, product_id, product_name_raw, quantity, net_weight, gross_weight, packages_count"
        )
        .in("packing_list_id", packingListIds)
    : { data: [] as any[] };

  const packingSummaryResolved = await ensurePackingSummary({
    supabase,
    orderId: order.id,
    packingLines: packingLines ?? [],
    existingSummary: packingSummary ?? null,
    orderItems: orderItemsAll ?? [],
    packingListItems: packingListItems ?? [],
  });

  const { data: groupsWithAttrsData } = await supabase
    .from("product_groups")
    .select("id, name, product_attributes(id, name, unit, value_type)")
    .order("name");
  const groupsWithAttrs = groupsWithAttrsData ?? [];

  const productIdsFromOrder = Array.from(
    new Set(
      (orderItems ?? [])
        .map((item) => item.product_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const previousUnitPriceByProduct = new Map<
    string,
    { unitPrice: number; orderName: string | null; orderCreatedAt: string | null }
  >();
  if (productIdsFromOrder.length && order.created_at) {
    const { data: previousOrders } = await supabase
      .from("orders")
      .select("id, name, created_at")
      .lt("created_at", order.created_at)
      .order("created_at", { ascending: false })
      .range(0, 1999);
    const previousOrderRows = previousOrders ?? [];
    const previousOrderIds = previousOrderRows.map((row) => row.id).filter(Boolean);
    if (previousOrderIds.length) {
      const orderRankById = new Map<string, number>();
      const orderMetaById = new Map<string, { name: string | null; created_at: string | null }>();
      previousOrderRows.forEach((row, index) => {
        orderRankById.set(String(row.id), index);
        orderMetaById.set(String(row.id), {
          name: row.name ?? null,
          created_at: row.created_at ?? null,
        });
      });

      const { data: previousOrderItems } = await supabase
        .from("order_items")
        .select("order_id, product_id, unit_price")
        .in("order_id", previousOrderIds)
        .in("product_id", productIdsFromOrder)
        .not("unit_price", "is", null);

      const sortedPreviousItems = (previousOrderItems ?? [])
        .filter((row) => row.order_id && row.product_id)
        .sort((a, b) => {
          const rankA = orderRankById.get(String(a.order_id)) ?? Number.MAX_SAFE_INTEGER;
          const rankB = orderRankById.get(String(b.order_id)) ?? Number.MAX_SAFE_INTEGER;
          return rankA - rankB;
        });

      sortedPreviousItems.forEach((row) => {
        const productId = String(row.product_id);
        if (previousUnitPriceByProduct.has(productId)) return;
        const unitPrice = Number(row.unit_price ?? 0);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
        const orderMeta = orderMetaById.get(String(row.order_id));
        previousUnitPriceByProduct.set(productId, {
          unitPrice,
          orderName: orderMeta?.name ?? null,
          orderCreatedAt: orderMeta?.created_at ?? null,
        });
      });
    }
  }

  const productIdsFromPacking = Array.from(
    new Set(
      (packingLines ?? [])
        .map((line) => line.product_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const productIds = Array.from(new Set([...productIdsFromOrder, ...productIdsFromPacking]));

  const fetchAttributeValues = async (ids: string[]) => {
    if (!ids.length) return [];
    const batchSize = 120;
    const results: {
      product_id: string | null;
      value_text: string | null;
      value_number: number | null;
      product_attributes:
        | { name: string | null; unit: string | null; value_type: string | null }
        | { name: string | null; unit: string | null; value_type: string | null }[];
    }[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("product_attribute_values")
        .select(
          "product_id, value_text, value_number, product_attributes(name, unit, value_type)"
        )
        .in("product_id", batch);
      if (error) {
        console.error("Order attribute values fetch failed", {
          error,
          batchSize: batch.length,
        });
      }
      if (data?.length) {
        results.push(...data);
      }
    }
    return results;
  };

  const fetchExtraAttributeValues = async (ids: string[]) => {
    if (!ids.length) return [];
    const batchSize = 120;
    const results: {
      product_id: string | null;
      name: string | null;
      unit: string | null;
      value_type: string | null;
      value_text: string | null;
      value_number: number | null;
    }[] = [];
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { data, error } = await supabase
        .from("product_extra_attributes")
        .select("product_id, name, unit, value_type, value_text, value_number")
        .in("product_id", batch);
      if (error) {
        console.error("Order extra attributes fetch failed", {
          error,
          batchSize: batch.length,
        });
      }
      if (data?.length) {
        results.push(...data);
      }
    }
    return results;
  };

  const attributeValues = await fetchAttributeValues(productIds);
  const extraAttributeValues = await fetchExtraAttributeValues(productIds);

  const { data: orderPayments } = await supabase
    .from("order_payments")
    .select("*")
    .eq("order_id", order.id)
    .order("payment_date", { ascending: false });

  const { data: supplierOrders } = canSeeFinance
    ? await supabase
        .from("orders")
        .select("id, total_amount, created_at")
        .eq("supplier_id", order.supplier_id)
    : { data: [] as any[] };
  const supplierOrderIds = (supplierOrders ?? []).map((item: any) => item.id).filter(Boolean);
  const { data: supplierPayments } =
    canSeeFinance && supplierOrderIds.length
      ? await supabase
          .from("order_payments")
          .select("order_id, amount, status")
          .in("order_id", supplierOrderIds)
      : { data: [] as any[] };

  const { data: orderDocuments } = await supabase
    .from("order_documents")
    .select(
      "id, file_name, storage_path, notes, uploaded_at, document_type_id, status, received_at, insurance_amount, insurance_currency, freight_amount, freight_currency, document_types(name)"
    )
    .eq("order_id", order.id)
    .order("received_at", { ascending: false, nullsFirst: false })
    .order("uploaded_at", { ascending: false });

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, code, name, is_required, applies_to")
    .order("name");

  // Supabase default limit is 1k; pull a wider window so the product search dropdown
  // can reach the full catalog.
  const { data: products } = await supabase
    .from("products")
    .select("id, code, name, unit_price")
    .order("code")
    .range(0, 49999);

  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );

  const isPackingListType = (
    type:
      | { code?: string | null; name?: string | null }
      | { code?: string | null; name?: string | null }[]
      | null
      | undefined
  ) => {
    const resolved = Array.isArray(type) ? type[0] : type;
    const code = resolved?.code?.toLowerCase();
    if (code === "pl") return true;
    const name = resolved?.name?.toLowerCase();
    return name === "packing list" || name === "packinglist" || name === "pl";
  };
  const hasPackingDocument = (orderDocuments ?? []).some((doc) =>
    isPackingListType(doc.document_types ?? null)
  );
  const packingListCompleted =
    hasPackingDocument ||
    Boolean(packingSummaryResolved) ||
    (packingListItems ?? []).length > 0;

  const missingOrderTypes = orderDocumentTypes
    .filter((type) => type.is_required)
    .filter((type) => {
      const hasReceived = orderDocuments?.some(
        (doc) => doc.document_type_id === type.id && doc.status === "Geldi"
      );
      const satisfiedByPackingList = isPackingListType(type) && packingListCompleted;
      return !hasReceived && !satisfiedByPackingList;
    })
    .map((type) => type.name);

  const packingDocumentTypes = orderDocumentTypes.filter((type) =>
    isPackingListType(type)
  );
  const packingDocuments = (orderDocuments ?? []).filter((doc) =>
    isPackingListType(doc.document_types ?? null)
  );

  const isInsuranceDocument = (name?: string | null) => {
    const lower = name?.toLowerCase() ?? "";
    return lower.includes("navlun") && lower.includes("sigorta");
  };

  const insuranceDocs = (orderDocuments ?? []).filter((doc) => {
    const docType = Array.isArray(doc.document_types)
      ? doc.document_types[0]
      : doc.document_types;
    return isInsuranceDocument(docType?.name) && doc.insurance_amount !== null;
  });
  const insuranceTotal = insuranceDocs.reduce(
    (sum, doc) => sum + Number(doc.insurance_amount ?? 0),
    0
  );
  const insuranceCurrency =
    insuranceDocs.find((doc) => doc.insurance_currency)?.insurance_currency ??
    order.currency ??
    "USD";

  const { data: shipmentLinks } = await supabase
    .from("shipment_orders")
    .select("shipment_id, shipments(id, file_no, eta_current)")
    .eq("order_id", order.id);

  const linkedShipments =
    shipmentLinks?.flatMap((item) => item.shipments ?? []) ?? [];

  const orderEta = (() => {
    const dates = linkedShipments
      .map((item) => item.eta_current)
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()));
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map((date) => date.getTime())));
    return min.toISOString();
  })();

  const activeTab = isSales ? "products" : resolvedSearchParams.tab ?? "products";

  const paidTotal = (orderPayments ?? [])
    .filter((payment) => payment.status === "Odendi")
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  const remainingBySupplierTimeline = (() => {
    if (!canSeeFinance) return null;
    const sortedOrders = [...(supplierOrders ?? [])].sort((a: any, b: any) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.id).localeCompare(String(b.id));
    });
    const totalPaid = (supplierPayments ?? []).reduce((sum: number, payment: any) => {
      if (payment.status !== "Odendi") return sum;
      return sum + Number(payment.amount ?? 0);
    }, 0);
    let supplierCredit = totalPaid;
    const map = new Map<string, number>();
    sortedOrders.forEach((item: any) => {
      const total = Number(item.total_amount ?? 0) || 0;
      const remaining = Math.max(0, total - supplierCredit);
      map.set(String(item.id), remaining);
      supplierCredit = Math.max(0, supplierCredit - total);
    });
    return map.get(String(order.id)) ?? null;
  })();
  const remainingTotal =
    remainingBySupplierTimeline ?? Math.max(0, Number(order.total_amount ?? 0) - paidTotal);

  const totalsAll = (orderItemsAll ?? []).reduce(
    (acc, item) => {
      acc.qty += Number(item.quantity ?? 0);
      acc.amount += Number(item.total_amount ?? 0);
      return acc;
    },
    { qty: 0, amount: 0 }
  );

  const totalsPage = (orderItems ?? []).reduce(
    (acc, item) => {
      acc.qty += Number(item.quantity ?? 0);
      acc.amount += Number(item.total_amount ?? 0);
      return acc;
    },
    { qty: 0, amount: 0 }
  );

  const packingTotals = {
    qty: Number(packingSummaryResolved?.total_qty ?? 0),
    packages: Number(packingSummaryResolved?.total_packages ?? 0),
    netWeight: Number(packingSummaryResolved?.total_net_weight_kg ?? 0),
    grossWeight: Number(packingSummaryResolved?.total_gross_weight_kg ?? 0),
    cbm: Number(packingSummaryResolved?.total_cbm ?? 0),
  };
  const packingItemsTotalQty = (packingListItems ?? []).reduce(
    (sum, item) => sum + Number(item.quantity ?? 0),
    0
  );
  const resolvedTotalQty =
    totalsAll.qty > 0
      ? totalsAll.qty
      : packingItemsTotalQty > 0
      ? packingItemsTotalQty
      : packingTotals.packages > 0
      ? packingTotals.packages
      : Number(order.packages ?? 0);

  const parseNumber = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(",", ".");
    if (!text) return null;
    const parsed = Number(text);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const attributesByProduct = (attributeValues ?? []).reduce<Record<string, string[]>>(
    (acc, item) => {
      if (!item.product_id) return acc;
      const attribute = Array.isArray(item.product_attributes)
        ? item.product_attributes[0]
        : item.product_attributes;
      if (!attribute?.name) return acc;
      const valueType = (attribute.value_type ?? "text").toLowerCase();
      const rawNumber =
        item.value_number ?? parseNumber(item.value_text ?? "");
      const rawText =
        item.value_text ??
        (item.value_number !== null && item.value_number !== undefined
          ? String(item.value_number)
          : "");
      if (valueType === "number" && (rawNumber === null || rawNumber === undefined)) {
        return acc;
      }
      if (valueType !== "number" && !rawText) return acc;
      const valueText =
        valueType === "number"
          ? Number(rawNumber).toLocaleString("tr-TR")
          : String(rawText);
      const unitSuffix = attribute.unit ? ` ${attribute.unit}` : "";
      const entry = `${attribute.name}: ${valueText}${unitSuffix}`;
      acc[item.product_id] = [...(acc[item.product_id] ?? []), entry];
      return acc;
    },
    {}
  );

  const extraAttributesByProduct = (extraAttributeValues ?? []).reduce<
    Record<string, string[]>
  >((acc, item) => {
    if (!item.product_id || !item.name) return acc;
    const valueType = (item.value_type ?? "text").toLowerCase();
    const rawNumber =
      item.value_number ?? parseNumber(item.value_text ?? "");
    const rawText =
      item.value_text ??
      (item.value_number !== null && item.value_number !== undefined
        ? String(item.value_number)
        : "");
    if (valueType === "number" && (rawNumber === null || rawNumber === undefined)) {
      return acc;
    }
    if (valueType !== "number" && !rawText) return acc;
    const valueText =
      valueType === "number"
        ? Number(rawNumber).toLocaleString("tr-TR")
        : String(rawText);
    const unitSuffix = item.unit ? ` ${item.unit}` : "";
    const entry = `${item.name}: ${valueText}${unitSuffix}`;
    acc[item.product_id] = [...(acc[item.product_id] ?? []), entry];
    return acc;
  }, {});

  const mergedAttributesByProduct = Object.entries(extraAttributesByProduct).reduce(
    (acc, [productId, entries]) => {
      acc[productId] = [...(acc[productId] ?? []), ...entries];
      return acc;
    },
    { ...attributesByProduct }
  );

  console.log("Order detail attributes debug", {
    orderId: order.id,
    orderItems: orderItems?.length ?? 0,
    productIds: productIds.length,
    attributeValues: attributeValues?.length ?? 0,
    extraAttributeValues: extraAttributeValues?.length ?? 0,
    mergedAttributes: Object.keys(mergedAttributesByProduct).length,
    missingAttributeProducts: productIds
      .filter((id) => !mergedAttributesByProduct[id])
      .slice(0, 8),
  });

  const isWeightName = (name?: string | null) => {
    const lower = (name ?? "").toLowerCase();
    return (
      lower.includes("weight") ||
      lower.includes("ağırlık") ||
      lower.includes("agirlik") ||
      lower.includes("kg")
    );
  };

  const weightByProductId = new Map<string, number>();

  (attributeValues ?? []).forEach((item) => {
    const attr = Array.isArray(item.product_attributes)
      ? item.product_attributes[0]
      : item.product_attributes;
    if (!item.product_id || !isWeightName(attr?.name ?? "")) return;
    const val = item.value_number ?? parseNumber(item.value_text ?? "");
    if (val !== null && !Number.isNaN(val)) {
      weightByProductId.set(item.product_id, Number(val));
    }
  });

  const packingAgg = new Map<
    string,
    { qty: number; net: number; gross: number; boxes: number }
  >();
  const productAgg = new Map<
    string,
    { qty: number; net: number; gross: number; boxes: number }
  >();

  packingLines?.forEach((line) => {
    const qty = Number(line.quantity ?? 0);
    const boxes = Number(line.packages_count ?? 0);
    const netRaw = Number(line.net_weight ?? 0);
    const grossRaw = Number(line.gross_weight ?? 0);
    const weight = line.product_id ? weightByProductId.get(line.product_id) ?? 0 : 0;
    const netVal = netRaw || (weight ? weight * qty : 0);
    const grossVal = grossRaw || (weight ? weight * qty : 0);

    const agg = packingAgg.get(line.packing_list_id) ?? { qty: 0, net: 0, gross: 0, boxes: 0 };
    agg.qty += qty;
    agg.net += netVal;
    agg.gross += grossVal;
    agg.boxes += boxes;
    packingAgg.set(line.packing_list_id, agg);

    const pKey = (line.product_name_raw ?? "Ürün").trim() || "Ürün";
    const pAgg = productAgg.get(pKey) ?? { qty: 0, net: 0, gross: 0, boxes: 0 };
    pAgg.qty += qty;
    pAgg.net += netVal;
    pAgg.gross += grossVal;
    pAgg.boxes += boxes;
    productAgg.set(pKey, pAgg);
  });

  (extraAttributeValues ?? []).forEach((item) => {
    if (!item.product_id || !isWeightName(item.name ?? "")) return;
    const val = item.value_number ?? parseNumber(item.value_text ?? "");
    if (val !== null && !Number.isNaN(val)) {
      weightByProductId.set(item.product_id, Number(val));
    }
  });

  const insuranceTotals = (orderDocuments ?? []).reduce(
    (acc, doc) => {
      if (doc.insurance_amount !== null && doc.insurance_amount !== undefined) {
        acc.amount += Number(doc.insurance_amount);
        acc.currency =
          (doc.insurance_currency as string | null) ??
          acc.currency ??
          order.currency ??
          "USD";
      }
      return acc;
    },
    { amount: 0, currency: null as string | null }
  );

  const freightTotals = (orderDocuments ?? []).reduce(
    (acc, doc) => {
      if (doc.freight_amount !== null && doc.freight_amount !== undefined) {
        acc.amount += Number(doc.freight_amount);
        acc.currency =
          (doc.freight_currency as string | null) ??
          acc.currency ??
          order.currency ??
          "USD";
      }
      return acc;
    },
    { amount: 0, currency: null as string | null }
  );

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const formatUnitPrice = (value: number | null, currency: string | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })} ${currency ?? "USD"}`;
  };

  const formatNumber = (value: number | null, fractionDigits = 2) => {
    if (value === null || value === undefined) return "-";
    return value.toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: fractionDigits,
    });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("tr-TR");
  };

  const readyDate = order.expected_ready_date
    ? new Date(order.expected_ready_date)
    : null;
  const daysToReady =
    readyDate !== null
      ? Math.floor(
          (readyDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : null;
  const readyCountdown =
    readyDate === null || daysToReady === null
      ? "Tarih yok"
      : daysToReady > 0
        ? `${daysToReady} gun kaldi`
        : daysToReady === 0
          ? "Bugun hazir"
          : `${Math.abs(daysToReady)} gun gecikti`;

  const orderStatusOptions = [
    "Siparis Verildi",
    "Proforma Geldi",
    "Uretimde",
    "Hazir",
    "Kalkis Limaninda",
    "Denizde",
    "Varis Limaninda",
    "Gumrukte",
    "Depoya Teslim Edildi",
  ];
  const orderStatusLabel = order.order_status ?? "Siparis Verildi";

  const docById = new Map((orderDocuments ?? []).map((d) => [d.id, d]));
  const docByPath = new Map((orderDocuments ?? []).map((d) => [d.storage_path, d]));
  const supplierName =
    suppliers?.find((supplier) => supplier.id === order.supplier_id)?.name ?? "-";
  const shipmentLabel = linkedShipments.length
    ? linkedShipments.map((item) => item.file_no ?? "Shipment").join(", ")
    : "-";
  const summaryChips = [
    !isSales
      ? { label: "Tedarikçi", value: supplierName, icon: FileText }
      : null,
    { label: "Adet", value: formatNumber(resolvedTotalQty, 0), icon: Boxes },
    !isSales
      ? { label: "Net kg", value: `${formatNumber(packingTotals.netWeight)} kg`, icon: PackageCheck }
      : null,
    canSeeFinance && !isSales
      ? { label: "Toplam", value: formatMoney(order.total_amount ?? null, order.currency), icon: ReceiptText, tone: "finance" }
      : null,
    canSeeFinance && !isSales
      ? { label: "Ödenen", value: formatMoney(paidTotal, order.currency), icon: WalletCards, tone: "finance" }
      : null,
    canSeeFinance && !isSales
      ? { label: "Kalan", value: formatMoney(remainingTotal, order.currency), icon: WalletCards, tone: "finance" }
      : null,
    !isSales
      ? { label: "Eksik belge", value: `${missingOrderTypes.length}`, icon: FileArchive }
      : null,
    !isSales ? { label: "Shipment", value: shipmentLabel, icon: Ship } : null,
  ].filter(Boolean) as { label: string; value: string; icon: typeof FileText; tone?: "finance" }[];
  const tabItems = isSales
    ? [{ key: "products", label: "Ürünler", icon: PackageSearch }]
    : [
        { key: "products", label: "Ürünler", icon: PackageSearch },
        { key: "packing", label: "Packing Listesi", icon: Boxes },
        { key: "payments", label: "Ödemeler", icon: WalletCards },
        { key: "documents", label: "Belgeler", icon: FileArchive },
      ];

  const currentStatus = (order.order_status ?? "").toLowerCase().trim();
  const orderSteps = [
    {
      label: "Sipariş",
      description: "Sipariş Verildi",
      active: true,
      icon: ClipboardList,
      date: formatDate(order.created_at),
    },
    {
      label: "Proforma",
      description: "Proforma Geldi",
      active: ["proforma geldi", "uretimde", "hazir", "kalkis limaninda", "denizde", "varis limaninda", "gumrukte", "depoya teslim edildi"].includes(currentStatus),
      icon: FileText,
      date: undefined,
    },
    {
      label: "Üretimde",
      description: "Ürünler üretiliyor",
      active: ["uretimde", "hazir", "kalkis limaninda", "denizde", "varis limaninda", "gumrukte", "depoya teslim edildi"].includes(currentStatus),
      icon: Boxes,
      date: order.expected_ready_date ? `Hazır: ${formatDate(order.expected_ready_date)}` : undefined,
    },
    {
      label: "Hazır",
      description: "Ürünler hazırlandı",
      active: ["hazir", "kalkis limaninda", "denizde", "varis limaninda", "gumrukte", "depoya teslim edildi"].includes(currentStatus),
      icon: PackageCheck,
      date: undefined,
    },
    {
      label: "Lojistikte",
      description: "Yola çıktı / Limanda",
      active: ["kalkis limaninda", "denizde", "varis limaninda", "gumrukte", "depoya teslim edildi"].includes(currentStatus),
      icon: Ship,
      date: orderEta ? `ETA: ${formatDate(orderEta)}` : undefined,
    },
    {
      label: "Gümrükte",
      description: "İthalat işlemleri",
      active: ["gumrukte", "depoya teslim edildi"].includes(currentStatus),
      icon: Scale,
      date: undefined,
    },
    {
      label: "Teslim Edildi",
      description: "Depoya ulaştı",
      active: ["depoya teslim edildi"].includes(currentStatus),
      icon: Warehouse,
      date: undefined,
    },
  ];

  return (
    <section className="space-y-6 animate-fade-up">
      <OrderItemsToast orderId={order.id} />

      <div className="rounded-2xl border border-black/8 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-black/45">
              <span className="rounded-lg border border-black/10 bg-[#f7f3ea] px-2.5 py-1 text-black/60">
                Sipariş
              </span>
              <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700">
                #${order.id.slice(0, 8).toUpperCase()}
              </span>
              <span className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-2.5 py-1 text-indigo-700">
                {orderStatusLabel}
              </span>
              {!isSales && (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700">
                  {order.currency ?? "USD"}
                </span>
              )}
              <span className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700">
                <CalendarDays size={13} className="text-slate-400" /> Hazır: {order.expected_ready_date ?? "-"} · {readyCountdown}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700">
                <Ship size={13} className="text-slate-400" /> ETA: {formatDate(orderEta)}
              </span>
            </div>
            <h1 className="mt-3 truncate text-2xl font-bold tracking-tight text-slate-800 [font-family:var(--font-display)]">
              {order.name ?? "Sipariş"}
            </h1>
            <p className="mt-1.5 max-w-4xl text-sm text-slate-500 leading-relaxed">
              {order.reference_name ?? order.notes ?? "Sipariş operasyon kaydı"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-black/70 hover:bg-slate-50 hover:border-black/30 transition shadow-2xs"
            >
              <ArrowLeft size={14} className="text-black/50" /> Liste
            </Link>
            {canEditPage && (
              <Link
                href={`/orders/${order.id}/edit`}
                className="inline-flex items-center gap-1 rounded-xl bg-black px-4 py-2.5 text-white hover:bg-black/90 transition shadow-sm"
              >
                <Edit3 size={14} className="text-white/70" /> Düzenle
              </Link>
            )}
            {canEditPage && (
              <Link
                href={`/api/export-gumruk?orderId=${order.id}`}
                className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-[#f7f3ea] px-4 py-2.5 text-black hover:bg-[#efece3] transition shadow-2xs"
                data-skip-route-loader
              >
                <Download size={14} className="text-black/50" /> Gümrük Excel
              </Link>
            )}
            {canEditPage && (
              <Link
                href={`/api/orders/${order.id}/insurance-form`}
                className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-black/70 hover:bg-slate-50 transition shadow-2xs"
                data-skip-route-loader
              >
                Navlun Formu
              </Link>
            )}
            {canEditPage && (
              <Link
                href={`/orders/${order.id}/insurance-mail`}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sky-900 hover:bg-sky-100/70 hover:border-sky-300 transition shadow-2xs"
              >
                Sigorta Mail
              </Link>
            )}
            {canSeeFinance && (
              <Link
                href={`/orders/${order.id}/beyanname`}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-950 hover:bg-amber-100/70 hover:border-amber-300 transition shadow-2xs"
              >
                Beyanname Lab
              </Link>
            )}
            {canEditPage && (
              <ConfirmActionForm
                action={deleteOrder}
                confirmText="Bu siparişi silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
                buttonText="Sil"
              >
                <input type="hidden" name="order_id" value={order.id} />
              </ConfirmActionForm>
            )}
          </div>
        </div>

        {/* Stepper Timeline */}
        <div className="mt-6 border-t border-black/5 pt-5">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 text-center">
            {orderSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className={`rounded-xl border p-3 flex flex-col items-center justify-between text-center transition-all duration-200 ${
                    step.active
                      ? "bg-indigo-50/30 border-indigo-200/50 text-indigo-700"
                      : "bg-slate-50/40 border-black/5 text-black/35"
                  }`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-2xs border border-black/5">
                    <Icon className={`h-4 w-4 ${step.active ? "text-indigo-600 font-bold" : "text-black/30"}`} />
                  </div>

                  <div className="mt-2.5">
                    <p className={`text-[11px] font-bold tracking-tight ${step.active ? "text-indigo-900" : "text-black/60"}`}>
                      {step.label}
                    </p>
                    <p className="text-[9px] text-black/45 mt-0.5 font-medium leading-tight">
                      {step.description}
                    </p>
                  </div>

                  {step.date ? (
                    <span className="mt-2 rounded bg-white px-2 py-0.5 text-[9px] font-bold shadow-2xs border border-black/5 text-black/65 font-mono">
                      {step.date}
                    </span>
                  ) : (
                    <span className="mt-2 text-[9px] text-black/30 font-medium font-mono">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Status Dropdown for Editing */}
        {!isSales && (
          <div className="mt-5 border-t border-black/5 pt-4">
            <details className="group">
              <summary className="cursor-pointer select-none font-bold text-xs uppercase tracking-wider text-black/50 hover:text-black flex items-center justify-between">
                <span>Durumu Güncelle</span>
                <ChevronDown size={14} className="transition-transform duration-200 group-open:rotate-180 text-black/40" />
              </summary>
              <form action={updateOrderStatus} className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <input type="hidden" name="order_id" value={order.id} />
                {orderStatusOptions.map((opt) => {
                  const active = (order.order_status ?? "").toLowerCase() === opt.toLowerCase();
                  return (
                    <SubmitButton
                      key={opt}
                      name="order_status"
                      value={opt}
                      pendingLabel={opt}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition cursor-pointer ${
                        active
                          ? "bg-black text-white"
                          : "border border-black/10 bg-[#fbfaf6] text-black/65 hover:border-black/35 hover:bg-slate-50"
                      }`}
                    >
                      {opt}
                    </SubmitButton>
                  );
                })}
              </form>
            </details>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {summaryChips.map((chip) => {
          const Icon = chip.icon;
          const isFinanceChip = chip.tone === "finance";
          const isMissingDocs = chip.label.includes("Eksik");

          let cardBg = "bg-white border-black/8 shadow-2xs";
          let labelColor = "text-black/45";
          let valColor = "text-black/85";
          let iconColor = "text-black/40 bg-slate-50";

          if (isFinanceChip) {
            cardBg = "bg-amber-50/40 border-amber-200/60 shadow-2xs shadow-amber-100/50";
            labelColor = "text-amber-800/70";
            valColor = "text-amber-950 font-bold";
            iconColor = "text-amber-600 bg-amber-50";
          } else if (isMissingDocs && Number(chip.value) > 0) {
            cardBg = "bg-rose-50/40 border-rose-200/60 shadow-2xs shadow-rose-100/50";
            labelColor = "text-rose-800/70";
            valColor = "text-rose-950 font-bold";
            iconColor = "text-rose-600 bg-rose-50";
          }

          return (
            <div
              key={chip.label}
              className={`min-w-0 rounded-xl border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-3 ${cardBg}`}
            >
              <span className={`rounded-lg p-2.5 shadow-2xs border border-black/5 ${iconColor}`}>
                <Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-[10px] font-bold uppercase tracking-[0.15em] leading-tight ${labelColor}`}>
                  {chip.label}
                </div>
                <p
                  className={`mt-1 truncate text-[13px] font-semibold tracking-tight leading-none ${valColor}`}
                  title={chip.value}
                >
                  {chip.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Missing Docs Warning Banner */}
      {!isSales && missingOrderTypes.length > 0 && (
        <div className="rounded-xl border border-red-200/60 bg-red-50/50 px-4 py-3 text-xs font-semibold text-red-800 flex flex-wrap items-center gap-2 shadow-2xs">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <span>Eksik belgeler mevcut:</span>
          <div className="flex flex-wrap gap-1.5">
            {missingOrderTypes.map((item) => (
              <span
                key={item}
                className="rounded-md border border-red-200 bg-white px-2 py-0.5 text-[11px] font-bold"
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main Tab Segmented Control */}
      <div className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">
              Sipariş Bilgileri
            </p>
            <h3 className="text-lg font-semibold text-slate-800">Sipariş Detayları</h3>
          </div>
          <div className="flex flex-wrap gap-2 text-sm bg-slate-100/70 p-1 rounded-xl border border-black/5">
            {tabItems.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <Link
                  key={tab.key}
                  href={`/orders/${order.id}?tab=${tab.key}`}
                  className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all duration-200 ${
                    isActive
                      ? "bg-[#101817] text-white shadow-xs"
                      : "text-black/60 hover:text-black hover:bg-white/50"
                  }`}
                >
                  <Icon size={14} className={isActive ? "text-emerald-400" : "text-black/40"} />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === "products" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-800">Ürün Kalemleri</h4>
              <div className="flex flex-wrap items-center gap-2 text-xs text-black/60">
                <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 font-semibold">
                  Toplam: {formatNumber(resolvedTotalQty, 0)} adet
                  {isSales ? "" : ` | ${formatMoney(totalsAll.amount, order.currency)}`}
                </span>
                {canEditPage && orderItems?.length ? (
                  <ConfirmActionForm
                    action={deleteAllOrderItems}
                    confirmText="Tüm ürün kalemleri silinsin mi?"
                    buttonText="Tümünü Sil"
                    className="inline"
                  >
                    <input type="hidden" name="order_id" value={order.id} />
                  </ConfirmActionForm>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-black/8 bg-slate-50/50 p-4 text-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  {!isSales ? (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">
                        Fatura / Kalem İçe Aktarma
                      </p>
                      <p className="text-sm font-semibold text-slate-700">
                        Uzun faturalar için Excel veya CSV yükleyin
                      </p>
                      <p className="text-xs text-black/50 leading-relaxed max-w-2xl">
                        Ürün kartından nitelikler otomatik getirilir. Excel dosyasında verilen fiyatlar ürün kartını da güncelleyecektir.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm font-semibold text-slate-700">Ürün kalemlerinde ara</p>
                  )}
                  <form className="mt-2 flex flex-wrap items-center gap-2 text-xs" method="get">
                    <input type="hidden" name="tab" value="products" />
                    <input
                      type="text"
                      name="itemsQ"
                      defaultValue={itemsQuery ?? ""}
                      placeholder="Kalem ara..."
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 outline-none focus:border-black"
                    />
                    <button className="rounded-xl bg-black px-3.5 py-2 font-semibold text-white cursor-pointer hover:bg-slate-800 transition">
                      Ara
                    </button>
                    <Link
                      href={`/orders/${order.id}?tab=products`}
                      className="rounded-xl border border-black/15 bg-white px-3.5 py-2 font-semibold text-black/70 hover:bg-slate-100 transition"
                    >
                      Temizle
                    </Link>
                  </form>
                </div>
                {!isSales && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href="/templates/order-items-template.csv"
                      className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs font-semibold text-black/70 hover:bg-slate-50 transition"
                    >
                      CSV Şablonu
                    </Link>
                    <Link
                      href="/api/order-items/template"
                      className="rounded-xl border border-black/15 bg-white px-4 py-2.5 text-xs font-semibold text-black/70 hover:bg-slate-50 transition"
                    >
                      Excel Şablonu
                    </Link>
                  </div>
                )}
              </div>
              {canEditPage && !isSales && (
                <form
                  action={importOrderItems}
                  className="mt-4 border-t border-black/5 pt-4 flex flex-wrap items-center gap-3"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <input
                    type="file"
                    name="file"
                    accept=".csv,.xlsx"
                    className="rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-black"
                  />
                  <SubmitButton className="rounded-xl bg-[#101817] px-4 py-2 text-xs font-bold text-white transition hover:bg-black cursor-pointer" pendingLabel="Yükleniyor...">
                    Excel/CSV Yükle
                  </SubmitButton>
                </form>
              )}
            </div>

            {orderItems?.length ? (
              <div className="space-y-4">
                {canEditPage && !isSales && (
                  <details className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
                    <summary className="cursor-pointer select-none text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-between">
                      <span>Toplu Hızlı Düzenleme Paneli</span>
                      <ChevronDown size={16} className="text-black/40" />
                    </summary>
                    <div className="mt-3">
                      <OrderItemsQuickEdit
                        orderId={order.id}
                        action={bulkUpdateOrderItems}
                        items={(orderItems ?? []).map((item) => ({
                          id: String(item.id),
                          code: item.products?.code ?? null,
                          name: item.name ?? item.products?.name ?? null,
                          quantity: item.quantity ?? null,
                          unit_price: item.unit_price ?? null,
                          net_weight_kg: item.net_weight_kg ?? null,
                          gross_weight_kg: item.gross_weight_kg ?? null,
                        }))}
                      />
                    </div>
                  </details>
                )}

                <div className="overflow-x-auto rounded-xl border border-black/8 bg-white p-5 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">
                        Invoice lines
                      </p>
                      <p className="text-base font-semibold text-slate-800">Ürün Kalemleri Listesi</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="rounded-lg border border-black/10 bg-indigo-50/50 px-3.5 py-1.5 font-bold text-indigo-800">
                        Toplam: {formatNumber(totalsPage.qty, 0)} adet
                        {canSeeFinance ? ` | ${formatMoney(totalsPage.amount, order.currency)}` : ""}
                      </div>
                      {!isSales && (
                        <a
                          href={`/api/orders/${order.id}/items-export?format=xlsx`}
                          className="flex items-center gap-2 rounded-xl border border-black/15 bg-white px-3.5 py-1.5 font-semibold text-black/75 hover:bg-slate-50 transition"
                        >
                          <Download size={14} /> Ürünleri Dışa Aktar (Excel)
                        </a>
                      )}
                    </div>
                  </div>

                  <table className="mt-4 w-full min-w-[1100px]">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                        <th className="py-3 font-semibold">Ürün</th>
                        <th className="py-3 font-semibold">Adet</th>
                        {canSeeFinance ? <th className="py-3 font-semibold">Birim fiyat</th> : null}
                        {canSeeFinance ? <th className="py-3 font-semibold">Önceki sip. birim fiyat</th> : null}
                        {canSeeFinance ? <th className="py-3 font-semibold">Total</th> : null}
                        <th className="py-3 font-semibold">Nitelikler</th>
                        <th className="py-3 font-semibold">Not</th>
                        {canEditPage ? <th className="py-3 text-right font-semibold">İşlem</th> : null}
                      </tr>
                    </thead>
                    <tbody className="text-sm">
                      {orderItems.map((item, index) => {
                        const computedTotal =
                          item.total_amount ??
                          (item.quantity && item.unit_price
                            ? Number(item.quantity) * Number(item.unit_price)
                            : null);
                        const currentUnitPrice =
                          item.unit_price ?? item.products?.unit_price ?? null;
                        const previousUnitPrice =
                          item.product_id ? previousUnitPriceByProduct.get(item.product_id) : undefined;
                        const fallbackUnitPrice =
                          item.products?.unit_price !== null &&
                          item.products?.unit_price !== undefined &&
                          Number(item.products.unit_price) > 0
                            ? {
                                unitPrice: Number(item.products.unit_price),
                                orderName: "Ürün kartı",
                                orderCreatedAt: null,
                              }
                            : undefined;
                        const baselineUnitPrice = previousUnitPrice ?? fallbackUnitPrice;
                        const unitPriceDiffPct =
                          currentUnitPrice !== null &&
                          currentUnitPrice !== undefined &&
                          baselineUnitPrice?.unitPrice &&
                          baselineUnitPrice.unitPrice > 0
                            ? ((Number(currentUnitPrice) - baselineUnitPrice.unitPrice) /
                                baselineUnitPrice.unitPrice) *
                              100
                            : null;
                        return (
                          <tr
                            key={item.id}
                            style={{ animationDelay: `${index * 45}ms` }}
                            className="group border-b border-black/5 transition hover:bg-slate-50/50"
                          >
                            <td className="py-4">
                              <Link
                                href={item.product_id ? `/products/${item.product_id}` : "#"}
                                className="block hover:underline"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                                    {item.products?.code ?? "-"}
                                  </span>
                                  <p className="font-semibold text-slate-800 hover:text-indigo-600 transition-colors font-sans">
                                    {item.name ?? item.products?.name ?? "-"}
                                  </p>
                                </div>
                                <p className="mt-1 text-xs text-black/45 leading-tight max-w-xs truncate">
                                  {item.products?.name ?? "-"}
                                </p>
                              </Link>
                            </td>
                            <td className="py-4 font-semibold text-slate-700">
                              {formatNumber(item.quantity ?? null, 0)}
                            </td>
                            {canSeeFinance ? (
                              <td className="py-4 text-slate-700">
                                {formatUnitPrice(
                                  currentUnitPrice,
                                  order.currency
                                )}
                              </td>
                            ) : null}
                            {canSeeFinance ? (
                              <td className="py-4">
                                {baselineUnitPrice ? (
                                  <div className="space-y-1">
                                    <div className="text-xs font-semibold text-slate-700">
                                      {formatUnitPrice(baselineUnitPrice.unitPrice, order.currency)}
                                    </div>
                                    <div className="text-[10px] text-black/45 leading-none flex items-center gap-1 font-medium">
                                      <span className="truncate max-w-[80px]" title={baselineUnitPrice.orderName ?? undefined}>
                                        {baselineUnitPrice.orderName ?? "-"}
                                      </span>
                                      {unitPriceDiffPct !== null && (
                                        <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${
                                          unitPriceDiffPct > 0.01
                                            ? "bg-rose-50 text-rose-700 border-rose-200/65"
                                            : unitPriceDiffPct < -0.01
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200/65"
                                            : "bg-slate-50 text-slate-500 border-slate-200/65"
                                        }`}>
                                          {unitPriceDiffPct > 0 ? "+" : ""}{formatNumber(unitPriceDiffPct, 2)}%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-black/35 font-medium">-</span>
                                )}
                              </td>
                            ) : null}
                            {canSeeFinance ? (
                              <td className="py-4 font-bold text-slate-900">
                                {formatMoney(
                                  computedTotal !== null ? Number(computedTotal) : null,
                                  order.currency
                                )}
                              </td>
                            ) : null}
                            <td className="py-4 text-xs text-black/55 leading-relaxed max-w-[200px]">
                              {item.product_id
                                ? mergedAttributesByProduct[item.product_id]?.join(", ") ?? "-"
                                : "-"}
                            </td>
                            <td className="py-4 text-black/50 max-w-[150px] truncate">
                              {item.notes ?? "-"}
                            </td>
                            {canEditPage && (
                              <td className="py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Link
                                    href={`/orders/${order.id}/items/${item.id}/edit`}
                                    className="rounded-lg border border-black/15 bg-white px-2.5 py-1 text-xs font-semibold text-black/75 hover:bg-slate-50 transition"
                                  >
                                    Düzenle
                                  </Link>
                                  <ConfirmActionForm
                                    action={deleteOrderItem}
                                    confirmText="Ürün kalemi silinsin mi?"
                                    buttonText="Sil"
                                    className="inline"
                                  >
                                    <input type="hidden" name="order_id" value={order.id} />
                                    <input type="hidden" name="item_id" value={item.id} />
                                  </ConfirmActionForm>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-black/60 border-t border-black/5 pt-4">
                    <span>Kalem toplamlarına göre hesaplanmıştır.</span>
                    {!isSales && (
                      <span className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3.5 py-1.5 font-bold text-indigo-900">
                        Genel Toplam: {formatMoney(totalsAll.amount, order.currency)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-sm text-black/50 text-center">
                Siparişte henüz ürün kalemi bulunmamaktadır. Aşağıdaki araçları kullanarak ilk kalemi ekleyin.
              </div>
            )}

            {!isSales && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-black/8 bg-white p-5 text-sm shadow-2xs">
                  <p className="text-base font-bold text-slate-800">Katalogdan Ürün Ekle</p>
                  <p className="mt-1 text-xs text-black/45 leading-relaxed">
                    Katalogdaki mevcut ürün kodu veya ismiyle hızlı arama yaparak siparişe kalem ekleyin.
                  </p>
                  <div className="mt-4">
                    <OrderItemCreateForm
                      orderId={order.id}
                      products={products ?? []}
                      action={createOrderItem}
                    />
                  </div>
                </div>

                <form
                  action={completeSingleMissingProduct}
                  className="rounded-xl border border-black/8 bg-white p-5 text-sm shadow-2xs"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <p className="text-base font-bold text-slate-800">Yeni Ürün Tanımla ve Kalem Ekle</p>
                  <p className="mt-1 text-xs text-black/45 leading-relaxed">
                    Katalogda yer almayan yeni bir ürün kartı oluşturup aynı anda bu siparişe eklenmesini sağlar.
                  </p>
                  <div className="mt-4">
                    <MissingProductRow
                      row={{
                        code: "",
                        name: "",
                        quantity: null,
                        unit_price: null,
                        total_amount: null,
                        net_weight_kg: null,
                        gross_weight_kg: null,
                        notes: "",
                        attributes: [],
                      }}
                      index={0}
                      groups={groupsWithAttrs}
                      showQuantity
                    />
                  </div>
                  <div className="mt-4 flex justify-end">
                    <SubmitButton
                      className="rounded-xl bg-[#101817] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-black cursor-pointer shadow-sm"
                      pendingLabel="Kaydediliyor..."
                    >
                      Yeni Ürünü Kaydet ve Ekle
                    </SubmitButton>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {activeTab === "packing" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-800">Çeki Listesi (Packing List)</h4>
              <div className="flex flex-wrap items-center gap-2 text-xs text-black/60">
                <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 font-semibold">
                  Doküman: {hasPackingDocument ? "Mevcut" : "Yüklenmedi"}
                  {packingSummaryResolved?.updated_at ? ` · Son Güncelleme: ${formatDate(packingSummaryResolved.updated_at)}` : ""}
                </span>
              </div>
            </div>

            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">Toplam Koli</p>
                <p className="mt-1.5 text-2xl font-bold leading-tight text-slate-800">
                  {formatNumber(packingTotals.packages, 0)}
                </p>
                <p className="text-[10px] text-black/50 mt-1">Koli / Paket Sayısı</p>
              </div>
              <div className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">Net Ağırlık</p>
                <p className="mt-1.5 text-2xl font-bold leading-tight text-slate-800">
                  {formatNumber(packingTotals.netWeight)} kg
                </p>
                <p className="text-[10px] text-black/50 mt-1">Toplam Net Ağırlık</p>
              </div>
              <div className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">Brüt Ağırlık</p>
                <p className="mt-1.5 text-2xl font-bold leading-tight text-slate-800">
                  {formatNumber(packingTotals.grossWeight)} kg
                </p>
                <p className="text-[10px] text-black/50 mt-1">Toplam Brüt Ağırlık</p>
              </div>
              <div className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">Toplam Hacim</p>
                <p className="mt-1.5 text-2xl font-bold leading-tight text-slate-800">
                  {formatNumber(packingTotals.cbm)} CBM
                </p>
                <p className="text-[10px] text-black/50 mt-1">Kübik Metre Hacim</p>
              </div>
            </div>

            <details className="rounded-xl border border-black/8 bg-white p-4 shadow-2xs">
              <summary className="cursor-pointer text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center justify-between">
                <span>Özet Çeki Listesi Toplamlarını Düzenle</span>
                <ChevronDown size={16} className="text-black/40" />
              </summary>
              <form
                action={saveOrderPackingListSummary}
                className="mt-3 grid gap-4 md:grid-cols-2"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/60">Koli Adedi</label>
                  <input
                    name="total_packages"
                    type="number"
                    step="1"
                    defaultValue={packingTotals.packages || ""}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    placeholder="Örn: 120"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/60">Net Ağırlık (kg)</label>
                  <input
                    name="total_net_weight_kg"
                    type="number"
                    step="0.01"
                    defaultValue={packingTotals.netWeight || ""}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    placeholder="Örn: 1450.50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/60">Brüt Ağırlık (kg)</label>
                  <input
                    name="total_gross_weight_kg"
                    type="number"
                    step="0.01"
                    defaultValue={packingTotals.grossWeight || ""}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    placeholder="Örn: 1530.70"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/60">Hacim (CBM)</label>
                  <input
                    name="total_cbm"
                    type="number"
                    step="0.001"
                    defaultValue={packingTotals.cbm || ""}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    placeholder="Örn: 3.45"
                  />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-black/60">Not / Açıklama</label>
                  <textarea
                    name="notes"
                    defaultValue={packingSummaryResolved?.notes ?? ""}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                    placeholder="Örn: Konteyner yükleme detayları, istif notları..."
                    rows={3}
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
                  <p className="text-xs text-black/50">
                    * Ürün bazlı satırlar yerine çeki listesi genel özet toplamlarını girmek için kullanın.
                  </p>
                  <SubmitButton className="rounded-xl bg-[#101817] px-4.5 py-2 text-xs font-bold text-white transition hover:bg-black cursor-pointer shadow-sm" pendingLabel="Kaydediliyor...">
                    Kaydet
                  </SubmitButton>
                </div>
              </form>
            </details>

            <div className="rounded-xl border border-black/8 bg-white p-5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">
                    Packing List Belgesi
                  </p>
                  <p className="text-sm font-semibold text-slate-800">Doküman Yükleme & Versiyon Geçmişi</p>
                </div>
              </div>

              {packingDocuments?.length ? (
                <div className="mt-4 space-y-2">
                  {packingDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/20 px-3.5 py-2.5 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white">
                          Packing List
                        </span>
                        <span className="font-semibold text-slate-800">{doc.file_name ?? "Dosya"}</span>
                        {doc.storage_path && (
                          <DocumentDownloadButton storagePath={doc.storage_path} label="Görüntüle" />
                        )}
                        <span className="text-xs text-black/45">
                          {doc.uploaded_at ?? ""} {doc.status ? `| ${doc.status}` : ""}
                        </span>
                      </div>
                      <ConfirmActionForm
                        action={deleteOrderDocument}
                        confirmText="Belge silinsin mi?"
                        buttonText="Sil"
                        className="inline"
                      >
                        <input type="hidden" name="order_id" value={order.id} />
                        <input type="hidden" name="document_id" value={doc.id} />
                      </ConfirmActionForm>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-black/10 bg-slate-50 px-4 py-6 text-xs text-black/50 text-center">
                  Çeki listesi belgesi henüz sisteme yüklenmedi.
                </div>
              )}

              {packingDocumentTypes.length > 0 && (
                <div className="mt-4">
                  <OrderDocumentUploader
                    orderId={order.id}
                    documentTypes={packingDocumentTypes}
                    orderCurrency={order.currency}
                  />
                </div>
              )}

              {packingDocuments?.length ? (
                <div className="mt-5 border-t border-black/5 pt-4 space-y-2">
                  <p className="text-xs font-bold text-black/60 uppercase tracking-wider">
                    Evrak Önizleme
                  </p>
                  <div className="rounded-xl overflow-hidden border border-black/10 shadow-sm bg-white">
                    <DocumentInlineViewer
                      storagePath={packingDocuments[0].storage_path}
                      fileName={packingDocuments[0].file_name}
                      height="65vh"
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {!isSales && (
              <div className="rounded-xl border border-black/8 bg-white p-5 shadow-2xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">Kalem Import</p>
                    <p className="text-sm font-semibold text-slate-800">Excel / CSV ile Kalem Çeki Listesi İçe Aktarma</p>
                    <p className="text-xs text-black/45 mt-1 leading-relaxed">
                      Sıralı format: KoliSayısı, ÜrünKodu, KolidekiAdet, NetKg, BrutKg
                    </p>
                  </div>
                  <Link
                    href={`/orders/${order.id}/packing-import${order.supplier_id ? `?supplier=${order.supplier_id}` : ""}`}
                    className="rounded-xl bg-[#101817] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-black shadow-sm"
                  >
                    CSV / Excel İçe Aktar
                  </Link>
                </div>

                <div className="rounded-xl border border-black/10 bg-slate-50 p-3.5 text-xs text-slate-700">
                  <p className="font-bold text-slate-800 mb-1">Hesaplanan Kalem Toplamları</p>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600 font-medium">
                    {(() => {
                      const total = Array.from(packingAgg.values()).reduce(
                        (acc, v) => {
                          acc.qty += v.qty;
                          acc.net += v.net;
                          acc.gross += v.gross;
                          acc.boxes += v.boxes;
                          return acc;
                        },
                        { qty: 0, net: 0, gross: 0, boxes: 0 }
                      );
                      return (
                        <>
                          <span>Adet: {formatNumber(total.qty, 0)}</span>
                          <span>Net: {formatNumber(total.net)} kg</span>
                          <span>Brüt: {formatNumber(total.gross)} kg</span>
                          <span>Koli: {formatNumber(total.boxes, 0)} adet</span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {packingLists?.length ? (
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-xl border border-black/8 bg-white">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50/80 text-left text-[11px] uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                          <tr>
                            <th className="px-3 py-3 font-semibold">Dosya Adı</th>
                            <th className="px-3 py-3 font-semibold">Durum</th>
                            <th className="px-3 py-3 font-semibold">Versiyon</th>
                            <th className="px-3 py-3 font-semibold text-right">Adet</th>
                            <th className="px-3 py-3 text-right font-semibold">Net</th>
                            <th className="px-3 py-3 text-right font-semibold">Brüt</th>
                            <th className="px-3 py-3 text-right font-semibold">Koli</th>
                            <th className="px-3 py-3 font-semibold">Tarih</th>
                            <th className="px-3 py-3 text-right font-semibold">İşlem</th>
                          </tr>
                        </thead>
                        <tbody className="text-black/70">
                          {packingLists.map((pl) => {
                            const agg = packingAgg.get(pl.id) ?? { qty: 0, net: 0, gross: 0, boxes: 0 };
                            return (
                              <tr key={pl.id} className="border-b border-black/5 hover:bg-slate-50/50">
                                <td className="px-3 py-3 font-semibold text-slate-800">{pl.file_name ?? "-"}</td>
                                <td className="px-3 py-3 text-xs font-semibold text-slate-500">{pl.status ?? "imported"}</td>
                                <td className="px-3 py-3 text-xs font-bold text-slate-600">v{pl.version ?? 1}</td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatNumber(agg.qty, 0)}</td>
                                <td className="px-3 py-3 text-right text-slate-700">{formatNumber(agg.net)} kg</td>
                                <td className="px-3 py-3 text-right text-slate-700">{formatNumber(agg.gross)} kg</td>
                                <td className="px-3 py-3 text-right font-semibold text-slate-700">{formatNumber(agg.boxes, 0)}</td>
                                <td className="px-3 py-3 text-xs text-black/50">{formatDate(pl.created_at)}</td>
                                <td className="px-3 py-3 text-right">
                                  <ConfirmActionForm
                                    action={deletePackingList}
                                    confirmText="Packing list silinsin mi? Bu işlem geri alınamaz."
                                    buttonText="Sil"
                                  >
                                    <input type="hidden" name="order_id" value={order.id} />
                                    <input type="hidden" name="packing_list_id" value={pl.id} />
                                  </ConfirmActionForm>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <details className="rounded-xl border border-indigo-100 bg-indigo-50/15 p-4 shadow-2xs">
                      <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-indigo-900 mb-2 flex items-center justify-between">
                        <span>Ürün Bazlı Toplam Detayları</span>
                        <ChevronDown size={14} className="text-indigo-400" />
                      </summary>
                      <div className="mt-3 overflow-x-auto rounded-lg bg-white border border-indigo-100/50">
                        <table className="min-w-full text-xs text-slate-700">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-black/40 border-b border-black/5 bg-slate-50/50">
                              <th className="px-3 py-2 font-semibold">Ürün Kodu</th>
                              <th className="px-3 py-2 text-right font-semibold">Adet</th>
                              <th className="px-3 py-2 text-right font-semibold">Net</th>
                              <th className="px-3 py-2 text-right font-semibold">Brüt</th>
                              <th className="px-3 py-2 text-right font-semibold">Koli</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from(productAgg.entries()).map(([code, agg]) => (
                              <tr key={code} className="border-b border-black/5 hover:bg-slate-50/40">
                                <td className="px-3 py-2 font-bold text-slate-800">{code}</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(agg.qty, 0)}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{formatNumber(agg.net)} kg</td>
                                <td className="px-3 py-2 text-right text-slate-600">{formatNumber(agg.gross)} kg</td>
                                <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatNumber(agg.boxes, 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-6 text-sm text-black/50 text-center">
                    Henüz içe aktarılmış kalem çeki listesi bulunmamaktadır.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "payments" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-800">Ödemeler (Payment Ledger)</h4>
              <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/60">
                {orderPayments?.length ?? 0} adet ödeme kaydı
              </span>
            </div>

            {orderPayments?.length ? (
              <div className="overflow-x-auto rounded-xl border border-black/8 bg-white p-5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/40">
                      Payment Ledger
                    </p>
                    <p className="text-base font-semibold text-slate-800">Ödeme Detay Tablosu</p>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3.5 py-1.5 text-xs font-bold text-amber-900">
                    Ödenen: {formatMoney(paidTotal, order.currency)} | Kalan: {formatMoney(remainingTotal, order.currency)}
                  </div>
                </div>

                <table className="mt-4 w-full min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                      <th className="py-3 font-semibold">Ödeme Tarihi</th>
                      <th className="py-3 font-semibold">Tutar</th>
                      <th className="py-3 font-semibold">Ödeme Yöntemi</th>
                      <th className="py-3 font-semibold">Ödeme Durumu</th>
                      <th className="py-3 font-semibold">Not</th>
                      <th className="py-3 text-right font-semibold">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-slate-700">
                    {orderPayments.map((payment, index) => (
                      <tr
                        key={payment.id}
                        style={{ animationDelay: `${index * 45}ms` }}
                        className="group border-b border-black/5 hover:bg-slate-50/40"
                      >
                        <td className="py-4 font-medium text-slate-700">{formatDate(payment.payment_date)}</td>
                        <td className="py-4 font-bold text-slate-900">
                          {formatMoney(payment.amount ?? null, payment.currency)}
                        </td>
                        <td className="py-4 text-xs font-semibold text-slate-500 uppercase">{payment.method ?? "-"}</td>
                        <td className="py-4">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                              payment.status === "Odendi"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : "bg-amber-50 text-amber-700 border-amber-200"
                            }`}
                          >
                            {payment.status ?? "-"}
                          </span>
                        </td>
                        <td className="py-4 text-xs text-black/50 max-w-[200px] truncate">
                          {payment.notes ?? "-"}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {(() => {
                              const notes = payment.notes ?? "";
                              const docIdMatch = notes.match(/doc:([0-9a-f-]+)/i);
                              const pathMatch = notes.match(/path:([\\w\\-\\/.]+)/i);
                              const doc =
                                (docIdMatch && docById.get(docIdMatch[1])) ||
                                (pathMatch && docByPath.get(pathMatch[1]));
                              return doc ? (
                                <PaymentDocLink storagePath={doc.storage_path} fileName={doc.file_name} />
                              ) : null;
                            })()}
                            <ConfirmActionForm
                              action={deleteOrderPayment}
                              confirmText="Ödeme silinsin mi?"
                              buttonText="Sil"
                              className="inline"
                            >
                              <input type="hidden" name="order_id" value={order.id} />
                              <input type="hidden" name="payment_id" value={payment.id} />
                            </ConfirmActionForm>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-sm text-black/50 text-center">
                Bu siparişe kayıtlı ödeme işlemi bulunmamaktadır.
              </div>
            )}

            <form
              action={createOrderPayment}
              className="rounded-xl border border-black/8 bg-white p-5 text-sm shadow-2xs"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <p className="font-bold text-slate-800 text-base">Ödeme İşlemi Girin</p>
              <p className="text-xs text-black/45 mt-1 leading-relaxed">
                Tedarikçiye yapılan ödemelerin vadelerini, miktarlarını ve dekont eşleşmelerini takip etmek için ekleyin.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Tutar</label>
                  <input
                    name="amount"
                    placeholder="Örn: 25000"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Para Birimi</label>
                  <input
                    name="currency"
                    defaultValue={order.currency ?? "USD"}
                    placeholder="USD"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Ödeme Tarihi</label>
                  <input
                    type="date"
                    name="payment_date"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Yöntem</label>
                  <input
                    name="method"
                    placeholder="Örn: TT veya LC"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Durum</label>
                  <select
                    name="status"
                    defaultValue="Bekleniyor"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  >
                    <option value="Bekleniyor">Bekleniyor</option>
                    <option value="Odendi">Ödendi</option>
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-5 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-black/60">Notlar</label>
                  <input
                    name="notes"
                    placeholder="Örn: %30 peşinat ödemesi"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-black"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <SubmitButton className="rounded-xl bg-[#101817] px-5 py-2.5 text-xs font-bold text-white transition hover:bg-black cursor-pointer shadow-sm" pendingLabel="Kaydediliyor...">
                  Ödemeyi Kaydet
                </SubmitButton>
              </div>
            </form>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold text-slate-800">Sipariş Belgeleri</h4>
              <span className="rounded-lg border border-black/10 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-black/60">
                {orderDocuments?.length ?? 0} adet yüklenen belge
              </span>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/45 px-4 py-3.5 text-xs font-semibold text-rose-800 shadow-2xs">
              Eksik Belge Listesi: <span className="font-bold text-rose-950">{missingOrderTypes.length ? missingOrderTypes.join(", ") : "Eksik evrak bulunmamaktadır."}</span>
            </div>

            {orderDocuments?.length ? (
              <div className="overflow-x-auto rounded-xl border border-black/8 bg-white p-5 shadow-2xs">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                      <th className="py-3 font-semibold">Belge Tipi</th>
                      <th className="py-3 font-semibold">Dosya Adı</th>
                      <th className="py-3 font-semibold">Durum / Tarih</th>
                      <th className="py-3 font-semibold">Ek Bilgi</th>
                      <th className="py-3 font-semibold">Not</th>
                      <th className="py-3 font-semibold">Yüklenme Tarihi</th>
                      <th className="py-3 text-right font-semibold">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {orderDocuments.map((doc, index) => {
                      const dt = doc.document_types as any;
                      const docTypeName = Array.isArray(dt) ? dt[0]?.name ?? "-" : dt?.name ?? "-";
                      const docTypeLower = docTypeName.toLowerCase();
                      const isPaymentDoc =
                        docTypeLower.includes("odeme") ||
                        docTypeLower.includes("ödeme") ||
                        docTypeLower.includes("payment") ||
                        docTypeLower.includes("dekont");
                      return (
                        <tr
                          key={doc.id}
                          style={{ animationDelay: `${index * 45}ms` }}
                          className="group border-b border-black/5 hover:bg-slate-50/40"
                        >
                          <td className="py-4 font-bold text-slate-800 text-xs">
                            {docTypeName}
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-700">{doc.file_name ?? "Dosya"}</span>
                              {doc.storage_path && (
                                <DocumentDownloadButton
                                  storagePath={doc.storage_path}
                                  label="Görüntüle"
                                />
                              )}
                            </div>
                          </td>
                          <td className="py-4 text-xs font-semibold text-slate-500">
                            {doc.status ?? "Bekleniyor"}
                            {doc.received_at ? ` | Alındı: ${formatDate(doc.received_at)}` : ""}
                          </td>
                          <td className="py-4 text-xs font-semibold text-slate-600">
                            {doc.freight_amount !== null && doc.freight_amount !== undefined
                              ? `Navlun: ${formatMoney(Number(doc.freight_amount), doc.freight_currency ?? order.currency)}`
                              : doc.insurance_amount !== null && doc.insurance_amount !== undefined
                              ? `Sigorta: ${formatMoney(Number(doc.insurance_amount), doc.insurance_currency ?? order.currency)}`
                              : "-"}
                          </td>
                          <td className="py-4 text-xs text-black/50 max-w-[150px] truncate">
                            {doc.notes ?? "-"}
                          </td>
                          <td className="py-4 text-xs text-black/45">{doc.uploaded_at ? formatDate(doc.uploaded_at) : "-"}</td>
                          <td className="py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {isPaymentDoc && doc.storage_path && (
                                <span className="text-[10px] font-medium text-black/40">
                                  Ödeme ilişkili
                                </span>
                              )}
                              <ConfirmActionForm
                                action={deleteOrderDocument}
                                confirmText="Belge silinsin mi?"
                                buttonText="Sil"
                                className="inline"
                              >
                                <input type="hidden" name="order_id" value={order.id} />
                                <input type="hidden" name="document_id" value={doc.id} />
                              </ConfirmActionForm>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-sm text-black/50 text-center">
                Bu siparişe yüklenmiş bir doküman bulunmamaktadır.
              </div>
            )}

            <div className="rounded-xl border border-black/8 bg-white p-5 shadow-2xs">
              <p className="font-bold text-slate-800 text-base mb-3">Yeni Belge Yükle</p>
              <OrderDocumentUploader
                orderId={order.id}
                documentTypes={orderDocumentTypes}
                orderCurrency={order.currency}
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}







import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit, canViewFinance } from "@/lib/roles";
import OrderItemsToast from "@/components/OrderItemsToast";
import {
  createOrderItem,
  deleteOrderItem,
  importOrderItems,
  deleteAllOrderItems,
} from "@/app/actions/order-items";
import {
  saveOrderPackingListSummary,
} from "@/app/actions/order-packing-list";
import { deletePackingList } from "@/app/actions/packing-lists";
import { deleteOrder, updateOrderStatus } from "@/app/actions/orders";
import { createOrderPayment, deleteOrderPayment } from "@/app/actions/order-payments";
import { deleteOrderDocument } from "@/app/actions/order-documents";
import OrderDocumentUploader from "@/components/OrderDocumentUploader";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import OrderItemCreateForm from "@/components/OrderItemCreateForm";
import DocumentInlineViewer from "@/components/DocumentInlineViewer";

type SearchParams = {
  tab?: string;
  itemsPage?: string;
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

  const itemsPage = Math.max(1, Number(resolvedSearchParams.itemsPage ?? 1) || 1);
  const itemsPageSize = 20;
  const itemsQuery = resolvedSearchParams.itemsQ?.trim();

    let orderItemsQuery = supabase
      .from("order_items")
      .select("*, products(id, code, name, unit_price)", { count: "exact" })
      .eq("order_id", order.id)
      .order("line_no", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

  if (itemsQuery) {
    orderItemsQuery = orderItemsQuery.ilike("name", `%${itemsQuery}%`);
  }

  const { data: orderItems, count: orderItemsCount } = await orderItemsQuery.range(
    (itemsPage - 1) * itemsPageSize,
    itemsPage * itemsPageSize - 1
  );

  // Light query for totals (tÃ¼m kalemler)
  const { data: orderItemsAll } = await supabase
    .from("order_items")
    .select("quantity, total_amount, net_weight_kg, gross_weight_kg, product_id")
    .eq("order_id", order.id);
  const totalItemCount = orderItemsCount ?? orderItemsAll?.length ?? 0;
  const totalItemPages = Math.max(1, Math.ceil(totalItemCount / itemsPageSize));

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

  const productIdsFromOrder = Array.from(
    new Set(
      (orderItems ?? [])
        .map((item) => item.product_id)
        .filter((value): value is string => Boolean(value))
    )
  );

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

  const { data: orderDocuments } = await supabase
    .from("order_documents")
    .select("id, file_name, storage_path, notes, uploaded_at, document_type_id, status, received_at, insurance_amount, insurance_currency, document_types(name)")
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
    hasPackingDocument || Boolean(packingSummary) || (packingListItems ?? []).length > 0;

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

  const buildItemsPageLink = (page: number) => {
    const params = new URLSearchParams();
    params.set("tab", "products");
    if (itemsQuery) params.set("itemsQ", itemsQuery);
    params.set("itemsPage", String(page));
    return `/orders/${order.id}?${params.toString()}`;
  };

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
  const remainingTotal = Math.max(
    0,
    Number(order.total_amount ?? 0) - paidTotal
  );

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

  const fallbackPackingTotals = (packingListItems ?? []).reduce(
    (acc, item) => {
      acc.qty += Number(item.quantity ?? 0);
      acc.packages += Number(item.packages ?? 0);
      const netWeight = Number(item.net_weight_kg ?? item.weight_kg ?? 0);
      const grossWeight = Number(item.gross_weight_kg ?? item.weight_kg ?? 0);
      acc.netWeight += netWeight;
      acc.grossWeight += grossWeight;
      acc.cbm += Number(item.cbm ?? 0);
      return acc;
    },
    { qty: 0, packages: 0, netWeight: 0, grossWeight: 0, cbm: 0 }
  );

  // Customs import (packing_list_lines) is the source of truth for box/net/gross totals.
  const importedPackingTotals = (packingLines ?? []).reduce(
    (acc, line) => {
      acc.qty += Number(line.quantity ?? 0);
      acc.packages += Number(line.packages_count ?? 0);
      acc.netWeight += Number(line.net_weight ?? 0);
      acc.grossWeight += Number(line.gross_weight ?? 0);
      return acc;
    },
    { qty: 0, packages: 0, netWeight: 0, grossWeight: 0 }
  );

  const hasImportedPackingTotals =
    importedPackingTotals.qty > 0 ||
    importedPackingTotals.packages > 0 ||
    importedPackingTotals.netWeight > 0 ||
    importedPackingTotals.grossWeight > 0;

  const packingTotals = hasImportedPackingTotals
    ? {
        qty: importedPackingTotals.qty,
        packages: importedPackingTotals.packages,
        netWeight: importedPackingTotals.netWeight,
        grossWeight: importedPackingTotals.grossWeight,
        cbm: Number(packingSummary?.total_cbm ?? fallbackPackingTotals.cbm ?? 0),
      }
    : packingSummary
    ? {
        qty: fallbackPackingTotals.qty,
        packages: Number(packingSummary.total_packages ?? 0),
        netWeight: Number(packingSummary.total_net_weight_kg ?? 0),
        grossWeight: Number(packingSummary.total_gross_weight_kg ?? 0),
        cbm: Number(packingSummary.total_cbm ?? 0),
      }
    : fallbackPackingTotals;

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

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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

  return (
    <section className="space-y-6">
      <OrderItemsToast orderId={order.id} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`/orders/${order.id}/edit`}
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Düzenle
        </Link>
        <ConfirmActionForm
          action={deleteOrder}
          confirmText="Bu siparis silinsin mi? Bu islem geri alinamaz."
          buttonText="Siparisi sil"
        >
          <input type="hidden" name="order_id" value={order.id} />
        </ConfirmActionForm>
        <Link
          href="/orders"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
        <Link
          href={`/api/export-gumruk?orderId=${order.id}`}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md"
        >
          Gümrük Excel&apos;i indir
        </Link>
      </div>
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">Siparis ozeti</p>
            <h3 className="text-2xl font-semibold">{order.name ?? "Siparis"}</h3>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {/* Sol: Sipariş bilgisi */}
          <div className="rounded-2xl border border-black/10 bg-white/80 px-3 py-3 text-sm">
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-black/70">
              {!isSales ? (
                <>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black/70">
                    Tedarikçi:{" "}
                    {suppliers?.find((supplier) => supplier.id === order.supplier_id)?.name ?? "-"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black/70">
                    Odeme: {order.payment_method ?? "-"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black/70">
                    Incoterm: {order.incoterm ?? "-"}
                  </span>
                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black/70">
                    Konşimento No: {order.consignment_no ?? "-"}
                  </span>
                  <span className="rounded-full border border-black/20 bg-[var(--mint)]/60 px-3 py-1 text-[12px] font-semibold text-black">
                    Para birimi: {order.currency ?? "USD"}
                  </span>
                </>
              ) : null}
              <span className="rounded-full border border-black/20 bg-[var(--mint)]/60 px-3 py-1 text-[12px] font-semibold text-black">
                Adet: {formatNumber(totalsAll.qty, 0)}
              </span>
              <span className="rounded-full border border-black/20 bg-[var(--mint)]/60 px-3 py-1 text-[12px] font-semibold text-black">
                Agirlik: {formatNumber(order.weight_kg)} kg
              </span>
              <span className="rounded-full border border-black/20 bg-[var(--mint)]/60 px-3 py-1 text-[12px] font-semibold text-black">
                Liman varis: {formatDate(orderEta)}
              </span>
              <span className="inline-flex flex-wrap items-center gap-2 rounded-full border border-black/20 bg-[var(--mint)]/60 px-3 py-1 text-[12px] font-semibold text-black">
                <span>Shipment:</span>
                {linkedShipments.length ? (
                  linkedShipments.map((item) => (
                    <Link
                      key={item.id}
                      href={`/shipments/${item.id}`}
                      className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[var(--ocean)] underline-offset-2 hover:underline"
                    >
                      {item.file_no ?? "Shipment"}
                    </Link>
                  ))
                ) : (
                  <span>-</span>
                )}
              </span>
                </div>
              </div>

              {/* Orta: Eksik belge + toplam */}
              <div className="space-y-3">
                {isSales ? null : (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[11px]">Eksik belgeler</p>
                      <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold">
                        {missingOrderTypes.length}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {missingOrderTypes.length ? (
                        missingOrderTypes.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-red-200 bg-white px-2 py-0.5 text-[11px] font-semibold"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-red-700/80">Eksik belge yok.</span>
                      )}
                    </div>
                  </div>
                )}

                {canSeeFinance && !isSales ? (
                  <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/40 px-3 py-3 text-xs">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-black/40">Toplam tutar</p>
                    <p className="mt-1 text-lg font-semibold text-black">
                      {formatMoney(order.total_amount ?? null, order.currency)}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#1f3c88]">
                      Ödenen: {formatMoney(paidTotal, order.currency)}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold text-[#8a1a1a]">
                      Kalan: {formatMoney(remainingTotal, order.currency)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-black/60">Hazir: {order.expected_ready_date ?? "-"}</p>
                  </div>
                ) : null}
              </div>

              {/* Sağ: Siparis durumu */}
              <div className="rounded-2xl border border-black/10 bg-white px-3 py-3 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Siparis durumu</p>
                  <span className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-[10px] font-semibold text-black/70">
                    {orderStatusLabel}
                  </span>
                </div>
                {!isSales ? (
                  <form action={updateOrderStatus} className="flex flex-wrap gap-2 text-[11px]">
                    <input type="hidden" name="order_id" value={order.id} />
                    {orderStatusOptions.map((opt) => {
                      const active = (order.order_status ?? "").toLowerCase() === opt.toLowerCase();
                      return (
                        <button
                          key={opt}
                          type="submit"
                          name="order_status"
                          value={opt}
                          className={`rounded-full px-3 py-1.5 font-semibold transition ${
                            active
                              ? "bg-black text-white"
                              : "border border-black/15 bg-white text-black/70 hover:border-black/40"
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </form>
                ) : null}
              </div>
            </div>

            {/* Adet/Ağırlık/Para birimi/Shipment chip'lere taşındı */}
          </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-4">
          <h3 className="text-lg font-semibold">Siparis detaylari</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {(isSales
              ? [{ key: "products", label: "Ürünler" }]
              : [
                  { key: "products", label: "Ürünler" },
                  { key: "packing", label: "Packing Listesi" },
                  { key: "payments", label: "Odemeler" },
                  { key: "documents", label: "Belgeler" },
                ]
            ).map((tab) => (
              <Link
                key={tab.key}
                href={`/orders/${order.id}?tab=${tab.key}`}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${
                  activeTab === tab.key
                    ? "bg-[var(--ocean)] text-white"
                    : "border border-black/10 bg-white text-black/70"
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        {activeTab === "products" ? (
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">Ürün kalemleri</h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-black/60">
                  <span>
                    Toplam: {formatNumber(totalsAll.qty, 0)} adet
                    {isSales ? "" : ` | ${formatMoney(totalsAll.amount, order.currency)}`}
                  </span>
                    {canEditPage && orderItems?.length ? (
                      <ConfirmActionForm
                        action={deleteAllOrderItems}
                        confirmText="Tum urun kalemleri silinsin mi?"
                        buttonText="Tumunu sil"
                        className="inline"
                      >
                        <input type="hidden" name="order_id" value={order.id} />
                      </ConfirmActionForm>
                    ) : null}
              </div>
            </div>
              <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/40">
                    Fatura import
                  </p>
                  <p className="text-sm font-semibold">
                    Uzun faturalar icin Excel/CSV import kullanin
                  </p>
                  <p className="mt-1 text-xs text-black/60">
                    Excel (.xlsx) veya UTF-8 CSV kullanabilirsiniz. Ürün kodu
                    kullanabilirsiniz. Nitelikler urun kartindan gelir, dosyada
                    verilen fiyat ve nitelikler urun kartini da gunceller.
                  </p>
                  <form className="mt-2 flex flex-wrap items-center gap-2 text-xs" method="get">
                    <input type="hidden" name="tab" value="products" />
                    <input
                      type="text"
                      name="itemsQ"
                      defaultValue={itemsQuery ?? ""}
                      placeholder="Kalem ara..."
                      className="rounded-xl border border-black/10 bg-white px-3 py-2"
                    />
                    <button className="rounded-full border border-black/10 px-3 py-2 font-semibold">
                      Ara
                    </button>
                    <Link
                      href={`/orders/${order.id}?tab=products`}
                      className="rounded-full border border-black/10 px-3 py-2 font-semibold"
                    >
                      Temizle
                    </Link>
                  </form>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/templates/order-items-template.csv"
                    className="rounded-full border border-black/15 px-4 py-2 text-xs font-semibold"
                  >
                    Ürün CSV
                  </Link>
                  <Link
                    href="/api/order-items/template"
                    className="rounded-full border border-black/15 px-4 py-2 text-xs font-semibold"
                  >
                    Ürün Excel (Guncel)
                  </Link>
                </div>
              </div>
              {canEditPage ? (
                <form
                  action={importOrderItems}
                  className="mt-4 flex flex-wrap items-center gap-3"
                >
                  <input type="hidden" name="order_id" value={order.id} />
                  <input
                    type="file"
                    name="file"
                    accept=".csv,.xlsx"
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                  <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
                    Import et
                  </button>
                </form>
              ) : null}
            </div>
            {orderItems?.length ? (
              <div className="overflow-x-auto rounded-3xl border border-black/10 bg-white p-6 shadow-[0_24px_50px_-34px_rgba(15,61,62,0.6)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-black/10 pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
                      Invoice lines
                    </p>
                    <p className="text-lg font-semibold">Ürün kalemleri</p>
                  </div>
                  <div className="rounded-full border border-black/10 bg-[var(--sky)]/60 px-4 py-2 text-xs font-semibold text-black/60">
                    Toplam: {formatNumber(totalsPage.qty, 0)} adet
                    {canSeeFinance ? ` | ${formatMoney(totalsPage.amount, order.currency)}` : ""}
                  </div>
                </div>
                <table className="mt-4 w-full min-w-[1100px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                      <th className="py-3">Ürün</th>
                      <th className="py-3">Adet</th>
                      {canSeeFinance ? <th className="py-3">Birim fiyat</th> : null}
                      {canSeeFinance ? <th className="py-3">Total</th> : null}
                      <th className="py-3">Nitelikler</th>
                      <th className="py-3">Not</th>
                      {canEditPage ? <th className="py-3 text-right">Islem</th> : null}
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {orderItems.map((item, index) => {
                      const computedTotal =
                        item.total_amount ??
                        (item.quantity && item.unit_price
                          ? Number(item.quantity) * Number(item.unit_price)
                          : null);
                      return (
                        <tr
                          key={item.id}
                          style={{ animationDelay: `${index * 45}ms` }}
                          className="group animate-[fade-up_0.35s_ease] border-b border-dashed border-black/10 transition hover:bg-[var(--mint)]/35"
                        >
                          <td className="py-4">
                            <Link
                              href={item.product_id ? `/products/${item.product_id}` : "#"}
                              className="block hover:underline"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                                  {item.products?.code ?? "-"}
                                </span>
                                <p className="font-semibold text-black">
                                  {item.name ?? item.products?.name ?? "-"}
                                </p>
                              </div>
                              <p className="mt-2 text-xs text-black/60">
                                {item.products?.name ?? "-"}
                              </p>
                            </Link>
                          </td>
                          <td className="py-4">
                            {formatNumber(item.quantity ?? null, 0)}
                          </td>
                          {canSeeFinance ? (
                            <td className="py-4">
                              {formatMoney(
                                item.unit_price ?? item.products?.unit_price ?? null,
                                order.currency
                              )}
                            </td>
                          ) : null}
                          {canSeeFinance ? (
                            <td className="py-4 font-semibold text-black">
                              {formatMoney(
                                computedTotal !== null ? Number(computedTotal) : null,
                                order.currency
                              )}
                            </td>
                          ) : null}
                          <td className="py-4 text-xs text-black/60">
                            {item.product_id
                              ? mergedAttributesByProduct[item.product_id]?.join(", ") ?? "-"
                              : "-"}
                          </td>
                          <td className="py-4 text-black/60">
                            {item.notes ?? "-"}
                          </td>
                          {canEditPage ? (
                            <td className="py-4 text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                <Link
                                  href={`/orders/${order.id}/items/${item.id}/edit`}
                                  className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold text-black/70 transition group-hover:border-black/40"
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
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-black/60">
                  <span>Line items toplamina gore hesaplanir.</span>
                  {!isSales ? (
                    <span className="rounded-full border border-black/10 bg-white px-3 py-1 font-semibold text-black/70">
                      Genel toplam: {formatMoney(totalsAll.amount, order.currency)}
                    </span>
                  ) : null}
                </div>
                {totalItemPages > 1 ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {Array.from({ length: totalItemPages }).map((_, idx) => {
                      const page = idx + 1;
                      const active = page === itemsPage;
                      return (
                        <Link
                          key={page}
                          href={buildItemsPageLink(page)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            active
                              ? "bg-[var(--ocean)] text-white"
                              : "border border-black/10 bg-white text-black/70"
                          }`}
                        >
                          {page}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Ürün kalemi bulunamadi. Ilk urunu ekleyin.
              </div>
            )}

            {!isSales ? (
              <OrderItemCreateForm
                orderId={order.id}
                products={products ?? []}
                action={createOrderItem}
              />
            ) : null}
          </div>
        ) : null}

        {activeTab === "packing" ? (
          <>
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">Packing listesi</h4>
              <div className="flex flex-wrap items-center gap-2 text-xs text-black/60">
                <span>
                  Dokuman: {hasPackingDocument ? "Var" : "Yok"} Â· Son guncelleme:{" "}
                  {packingSummary?.updated_at ?? "-"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 md:flex-nowrap">
              <div className="flex-1 min-w-[180px] rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
                  Koli
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-black">
                  {formatNumber(packingTotals.packages, 0)}
                </p>
                <p className="text-xs text-black/60">Toplam koli adedi</p>
              </div>
              <div className="flex-1 min-w-[180px] rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
                  Net (kg)
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-black">
                  {formatNumber(packingTotals.netWeight)}
                </p>
                <p className="text-xs text-black/60">Toplam net agirlik</p>
              </div>
              <div className="flex-1 min-w-[180px] rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
                  Brut (kg)
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-black">
                  {formatNumber(packingTotals.grossWeight)}
                </p>
                <p className="text-xs text-black/60">Toplam brut agirlik</p>
              </div>
              <div className="flex-1 min-w-[180px] rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
                  CBM
                </p>
                <p className="mt-2 text-2xl font-semibold leading-tight text-black">
                  {formatNumber(packingTotals.cbm)}
                </p>
                <p className="text-xs text-black/60">Toplam hacim</p>
              </div>
            </div>

            <details className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold">
                Toplamlari duzenle
              </summary>
              <form
                action={saveOrderPackingListSummary}
                className="mt-3 grid gap-3 md:grid-cols-2"
              >
                <input type="hidden" name="order_id" value={order.id} />
                <label className="text-xs font-semibold text-black/60">
                  Koli adedi
                  <input
                    name="total_packages"
                    type="number"
                    step="1"
                    defaultValue={packingTotals.packages || ""}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Orn. 120"
                  />
                </label>
                <label className="text-xs font-semibold text-black/60">
                  Net (kg)
                  <input
                    name="total_net_weight_kg"
                    type="number"
                    step="0.01"
                    defaultValue={packingTotals.netWeight || ""}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Orn. 12.5"
                  />
                </label>
                <label className="text-xs font-semibold text-black/60">
                  Brut (kg)
                  <input
                    name="total_gross_weight_kg"
                    type="number"
                    step="0.01"
                    defaultValue={packingTotals.grossWeight || ""}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Orn. 13.4"
                  />
                </label>
                <label className="text-xs font-semibold text-black/60">
                  CBM
                  <input
                    name="total_cbm"
                    type="number"
                    step="0.001"
                    defaultValue={packingTotals.cbm || ""}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Orn. 3.45"
                  />
                </label>
                <label className="md:col-span-2 text-xs font-semibold text-black/60">
                  Not
                  <textarea
                    name="notes"
                    defaultValue={packingSummary?.notes ?? ""}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    placeholder="Tedarikçiden gelen ozet / aciklama"
                    rows={3}
                  />
                </label>
                <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-black/60">
                    Ürün bazli satirlar yerine ozet bilgileri tutuyoruz.
                  </p>
                  <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
                    Kaydet
                  </button>
                </div>
              </form>
            </details>

            <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
                    Packing list dokumani
                  </p>
                  <p className="text-sm font-semibold">Belgeyi yukle ve goruntule</p>
                  <p className="mt-1 text-xs text-black/60">
                    Ürün ekleme/CSV yok; sadece tedarikcinin gonderdigi dokumani ve ozet
                    toplamlarini takip ediyoruz.
                  </p>
                </div>
              </div>
              {packingDocuments?.length ? (
                <div className="mt-3 space-y-2">
                  {packingDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-[var(--mint)]/30 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-black px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                          Packing
                        </span>
                        <span className="font-semibold">{doc.file_name ?? "Dosya"}</span>
                        {doc.storage_path ? (
                          <DocumentDownloadButton storagePath={doc.storage_path} label="Gor" />
                        ) : null}
                        <span className="text-xs text-black/60">
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
                <div className="mt-3 rounded-xl border border-dashed border-black/10 bg-[var(--peach)] px-3 py-2 text-xs text-black/70">
                  Packing dokumani henuz yuklenmedi.
                </div>
              )}

              {packingDocumentTypes.length ? (
                <div className="mt-4">
                  <OrderDocumentUploader
                    orderId={order.id}
                    documentTypes={packingDocumentTypes}
                    orderCurrency={order.currency}
                  />
                </div>
              ) : null}

              {packingDocuments?.length ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold text-black/60">
                    Otomatik onizleme (ilk dokuman)
                  </p>
                  <DocumentInlineViewer
                    storagePath={packingDocuments[0].storage_path}
                    fileName={packingDocuments[0].file_name}
                    height="75vh"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Packing list import</p>
                <p className="text-sm text-black/60">
                  Sabit CSV formatı: KoliSayısı, ÜrünKodu, KolidekiAdet, NetKg, BrutKg
                </p>
              </div>
              <Link
                href={`/orders/${order.id}/packing-import${order.supplier_id ? `?supplier=${order.supplier_id}` : ""}`}
                className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white"
              >
                CSV içe aktar
              </Link>
            </div>

            <div className="rounded-2xl border border-black/10 bg-[var(--sand)]/60 p-3 text-xs text-black/70">
              <p className="font-semibold mb-1">Toplam özet</p>
              <div className="flex flex-wrap gap-4">
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
                      <span>Koli: {formatNumber(total.boxes, 0)}</span>
                    </>
                  );
                })()}
              </div>
            </div>

            {packingLists?.length ? (
              <div className="space-y-3">
                <div className="overflow-auto rounded-2xl border border-black/10">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--sky)]/50 text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
                      <tr>
                        <th className="px-3 py-2">Dosya</th>
                        <th className="px-3 py-2">Durum</th>
                        <th className="px-3 py-2">Vers.</th>
                        <th className="px-3 py-2">Adet</th>
                        <th className="px-3 py-2">Net</th>
                        <th className="px-3 py-2">Brüt</th>
                        <th className="px-3 py-2">Koli</th>
                        <th className="px-3 py-2">Tarih</th>
                        <th className="px-3 py-2 text-right">Islem</th>
                      </tr>
                    </thead>
                    <tbody className="text-black/70">
                      {packingLists.map((pl) => {
                        const agg = packingAgg.get(pl.id) ?? { qty: 0, net: 0, gross: 0, boxes: 0 };
                        return (
                          <tr key={pl.id} className="border-b border-black/5">
                            <td className="px-3 py-2 font-semibold">{pl.file_name ?? "-"}</td>
                            <td className="px-3 py-2">{pl.status ?? "imported"}</td>
                            <td className="px-3 py-2">{pl.version ?? 1}</td>
                            <td className="px-3 py-2">{formatNumber(agg.qty, 0)}</td>
                            <td className="px-3 py-2">{formatNumber(agg.net)} kg</td>
                            <td className="px-3 py-2">{formatNumber(agg.gross)} kg</td>
                            <td className="px-3 py-2">{formatNumber(agg.boxes, 0)}</td>
                            <td className="px-3 py-2">{pl.created_at ?? "-"}</td>
                            <td className="px-3 py-2 text-right">
                              <ConfirmActionForm
                                action={deletePackingList}
                                confirmText="Packing list silinsin mi? Bu islem geri alinamaz."
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

                <details className="rounded-2xl border border-black/10 bg-[var(--mint)]/40 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-black/70 mb-2">
                    Ürün bazlı toplam
                  </summary>
                  <div className="mt-2 overflow-auto">
                    <table className="min-w-full text-xs text-black/70">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
                          <th className="px-2 py-1">Ürün kodu</th>
                          <th className="px-2 py-1">Adet</th>
                          <th className="px-2 py-1">Net</th>
                          <th className="px-2 py-1">Brüt</th>
                          <th className="px-2 py-1">Koli</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(productAgg.entries()).map(([code, agg]) => (
                          <tr key={code} className="border-b border-black/5">
                            <td className="px-2 py-1 font-semibold">{code}</td>
                            <td className="px-2 py-1">{formatNumber(agg.qty, 0)}</td>
                            <td className="px-2 py-1">{formatNumber(agg.net)} kg</td>
                            <td className="px-2 py-1">{formatNumber(agg.gross)} kg</td>
                            <td className="px-2 py-1">{formatNumber(agg.boxes, 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-sm text-black/70">
                Henüz packing list importu yok.
              </div>
            )}
          </div>
        </>
      ) : null}

      {activeTab === "payments" ? (
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">Odemeler</h4>
              <span className="text-xs text-black/60">
                {orderPayments?.length ?? 0} odeme kaydi
              </span>
            </div>
            {orderPayments?.length ? (
              <div className="overflow-x-auto rounded-3xl border border-black/10 bg-white p-6 shadow-[0_24px_50px_-34px_rgba(15,61,62,0.6)]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-black/10 pb-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
                      Payment ledger
                    </p>
                    <p className="text-lg font-semibold">Odeme kalemleri</p>
                  </div>
                  <div className="rounded-full border border-black/10 bg-[var(--sky)]/60 px-4 py-2 text-xs font-semibold text-black/60">
                    Odenen: {formatMoney(paidTotal, order.currency)} | Kalan:{" "}
                    {formatMoney(remainingTotal, order.currency)}
                  </div>
                </div>
                <table className="mt-4 w-full min-w-[900px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                      <th className="py-3">Tarih</th>
                      <th className="py-3">Tutar</th>
                      <th className="py-3">Yontem</th>
                      <th className="py-3">Durum</th>
                      <th className="py-3">Not</th>
                      <th className="py-3 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {orderPayments.map((payment, index) => (
                      <tr
                        key={payment.id}
                        style={{ animationDelay: `${index * 45}ms` }}
                        className="group animate-[fade-up_0.35s_ease] border-b border-dashed border-black/10 transition hover:bg-[var(--mint)]/35"
                      >
                        <td className="py-4">{payment.payment_date ?? "-"}</td>
                        <td className="py-4 font-semibold">
                          {formatMoney(payment.amount ?? null, payment.currency)}
                        </td>
                        <td className="py-4">{payment.method ?? "-"}</td>
                        <td className="py-4">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              payment.status === "Odendi"
                                ? "bg-[#d8f2e1] text-[#1b6a3f]"
                                : "bg-[#ffe9c5] text-[#8a5b1a]"
                            }`}
                          >
                            {payment.status ?? "-"}
                          </span>
                        </td>
                        <td className="py-4 text-black/60">
                          {payment.notes ?? "-"}
                        </td>
                        <td className="py-4 text-right">
                          <ConfirmActionForm
                            action={deleteOrderPayment}
                            confirmText="Odeme silinsin mi?"
                            buttonText="Sil"
                            className="inline"
                          >
                            <input type="hidden" name="order_id" value={order.id} />
                            <input type="hidden" name="payment_id" value={payment.id} />
                          </ConfirmActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Odeme kaydi bulunamadi.
              </div>
            )}

            <form
              action={createOrderPayment}
              className="rounded-2xl border border-dashed border-black/10 bg-white p-4 text-sm"
            >
              <input type="hidden" name="order_id" value={order.id} />
              <p className="font-semibold">Yeni odeme ekle</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <input
                  name="amount"
                  placeholder="Tutar"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="currency"
                  defaultValue={order.currency ?? "USD"}
                  placeholder="USD"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <input
                  type="date"
                  name="payment_date"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="method"
                  placeholder="Yontem (TT/LC)"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <select
                  name="status"
                  defaultValue="Bekleniyor"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="Bekleniyor">Bekleniyor</option>
                  <option value="Odendi">Odendi</option>
                </select>
                <input
                  name="notes"
                  placeholder="Not"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm lg:col-span-3"
                />
              </div>
              <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
                Odeme ekle
              </button>
            </form>
          </div>
        ) : null}

        {activeTab === "documents" ? (
          <div className="mt-6 space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-lg font-semibold">Belgeler</h4>
              <span className="text-xs text-black/60">
                {orderDocuments?.length ?? 0} belge
              </span>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-3 text-xs text-black/70">
              Eksik evraklar:{" "}
              {missingOrderTypes.length ? missingOrderTypes.join(", ") : "Yok"}
            </div>
            {orderDocuments?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40">
                      <th className="px-3 py-2">Tip</th>
                      <th className="px-3 py-2">Dosya</th>
                      <th className="px-3 py-2">Durum</th>
                      <th className="px-3 py-2">Navlun sigortasi</th>
                      <th className="px-3 py-2">Not</th>
                      <th className="px-3 py-2">Tarih</th>
                      <th className="px-3 py-2 text-right">Islem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDocuments.map((doc, index) => (
                    <tr
                      key={doc.id}
                      style={{ animationDelay: `${index * 45}ms` }}
                      className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/15 [&>td]:bg-white [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl [&>td]:shadow-[0_16px_26px_-24px_rgba(15,61,62,0.6)] hover:[&>td]:bg-[var(--mint)] hover:[&>td]:shadow-[0_20px_30px_-24px_rgba(15,61,62,0.7)]"
                    >
                        <td className="px-3 py-4 text-xs font-semibold text-black/70">
                          {(() => {
                            const dt = (doc as any).document_types;
                            if (Array.isArray(dt)) return dt[0]?.name ?? "-";
                            return dt?.name ?? "-";
                          })()}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="font-semibold">
                              {doc.file_name ?? "Dosya"}
                            </span>
                            {doc.storage_path ? (
                              <DocumentDownloadButton
                                storagePath={doc.storage_path}
                                label="Gor"
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-4 text-xs font-semibold">
                          {doc.status ?? "Bekleniyor"}
                          {doc.received_at ? ` | ${doc.received_at}` : ""}
                        </td>
                        <td className="px-3 py-4 text-xs font-semibold text-black/70">
                          {doc.insurance_amount !== null && doc.insurance_amount !== undefined
                            ? formatMoney(
                                Number(doc.insurance_amount),
                                doc.insurance_currency ?? order.currency
                              )
                            : "-"}
                        </td>
                        <td className="px-3 py-4 text-black/60">
                          {doc.notes ?? "-"}
                        </td>
                        <td className="px-3 py-4">{doc.uploaded_at ?? "-"}</td>
                        <td className="px-3 py-4 text-right">
                          <ConfirmActionForm
                            action={deleteOrderDocument}
                            confirmText="Belge silinsin mi?"
                            buttonText="Sil"
                            className="inline"
                          >
                            <input type="hidden" name="order_id" value={order.id} />
                            <input type="hidden" name="document_id" value={doc.id} />
                          </ConfirmActionForm>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Belge bulunamadi.
              </div>
            )}

            <OrderDocumentUploader
              orderId={order.id}
              documentTypes={orderDocumentTypes}
              orderCurrency={order.currency}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}






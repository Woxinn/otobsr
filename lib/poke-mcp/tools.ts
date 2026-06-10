import type { SupabaseClient } from "@supabase/supabase-js";
import { getShipmentFlags } from "@/lib/shipments";

type ToolContext = {
  supabase: SupabaseClient;
  appBaseUrl: string;
  allowFinance: boolean;
};

const normalizeStatus = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ç", "c")
    .trim();

const normalizeSearch = (value: string | null | undefined) =>
  (value ?? "").replace(/[%_,]/g, " ").trim();

const limitNumber = (value: number | null | undefined, fallback = 10, max = 50) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("tr-TR");
};

const formatMoney = (value: number, currency: string | null | undefined) =>
  `${value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency ?? "USD"}`;

const appUrl = (baseUrl: string, path: string) =>
  baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;

const relationOne = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const paidAmount = (value: unknown) => Number(value ?? 0) || 0;

async function getRequiredOrderDocumentTypes(ctx: ToolContext) {
  const { data } = await ctx.supabase
    .from("document_types")
    .select("id, name, is_required, applies_to")
    .eq("applies_to", "order");

  return (data ?? []).filter((type: any) => Boolean(type.is_required));
}

async function getOverdueShipmentRows(ctx: ToolContext, limit = 10) {
  const [{ data: documentTypes }, { data: shipments }] = await Promise.all([
    ctx.supabase
      .from("document_types")
      .select("id, name, is_required, is_critical, applies_to"),
    ctx.supabase
      .from("shipments")
      .select("id, file_no, status, eta_current, ata_actual, warehouse_delivery_date, archived_at")
      .is("archived_at", null),
  ]);

  const shipmentIds = (shipments ?? []).map((shipment: any) => shipment.id).filter(Boolean);
  const { data: documents } = shipmentIds.length
    ? await ctx.supabase
        .from("documents")
        .select("shipment_id, document_type_id, status")
        .in("shipment_id", shipmentIds)
    : { data: [] as any[] };

  const documentsByShipment = new Map<string, any[]>();
  (documents ?? []).forEach((doc: any) => {
    if (!doc.shipment_id) return;
    const bucket = documentsByShipment.get(String(doc.shipment_id)) ?? [];
    bucket.push(doc);
    documentsByShipment.set(String(doc.shipment_id), bucket);
  });

  return (shipments ?? [])
    .map((shipment: any) => {
      const flags = getShipmentFlags(
        {
          eta_current: shipment.eta_current,
          ata_actual: shipment.ata_actual,
          warehouse_delivery_date: shipment.warehouse_delivery_date,
          status: shipment.status,
        },
        documentsByShipment.get(String(shipment.id)) ?? [],
        documentTypes ?? []
      );

      return { shipment, flags };
    })
    .filter((row) => row.flags.overdue)
    .sort((left, right) =>
      String(left.shipment.eta_current ?? "").localeCompare(String(right.shipment.eta_current ?? ""))
    )
    .slice(0, limit)
    .map(({ shipment, flags }) => ({
      id: shipment.id,
      file_no: shipment.file_no ?? "Shipment",
      status: shipment.status ?? null,
      eta_current: shipment.eta_current ?? null,
      eta_display: formatDate(shipment.eta_current),
      risk: flags.risk,
      bl_missing: flags.blMissing,
      missing_required_count: flags.missingRequiredCount,
      url: appUrl(ctx.appBaseUrl, `/shipments/${shipment.id}`),
    }));
}

async function getOrdersWithMissingDocs(ctx: ToolContext, limit = 10) {
  const requiredTypes = await getRequiredOrderDocumentTypes(ctx);
  if (!requiredTypes.length) return [];

  const { data: orders } = await ctx.supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, supplier_id, suppliers(name), archived")
    .order("expected_ready_date", { ascending: true, nullsFirst: false });

  const activeOrders = (orders ?? []).filter((order: any) => order.archived !== true);
  const orderIds = activeOrders.map((order: any) => order.id).filter(Boolean);
  const { data: documents } = orderIds.length
    ? await ctx.supabase
        .from("order_documents")
        .select("order_id, document_type_id, status")
        .in("order_id", orderIds)
    : { data: [] as any[] };

  const docsByOrder = new Map<string, any[]>();
  (documents ?? []).forEach((doc: any) => {
    if (!doc.order_id) return;
    const bucket = docsByOrder.get(String(doc.order_id)) ?? [];
    bucket.push(doc);
    docsByOrder.set(String(doc.order_id), bucket);
  });

  return activeOrders
    .map((order: any) => {
      const docs = docsByOrder.get(String(order.id)) ?? [];
      const missing = requiredTypes
        .filter((type: any) => {
          return !docs.some(
            (doc) => doc.document_type_id === type.id && doc.status === "Geldi"
          );
        })
        .map((type: any) => String(type.name ?? "Belge"));

      const supplier = relationOne(order.suppliers as any);
      return {
        id: order.id,
        name: order.name ?? "Siparis",
        status: order.order_status ?? null,
        supplier: supplier?.name ?? null,
        expected_ready_date: order.expected_ready_date ?? null,
        expected_ready_display: formatDate(order.expected_ready_date),
        missing_documents: missing,
        url: appUrl(ctx.appBaseUrl, `/orders/${order.id}`),
      };
    })
    .filter((row) => row.missing_documents.length > 0)
    .slice(0, limit);
}

async function getProductionAlerts(ctx: ToolContext, limit = 10) {
  const { data: orders } = await ctx.supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, suppliers(name), archived")
    .not("expected_ready_date", "is", null)
    .order("expected_ready_date", { ascending: true });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (orders ?? [])
    .filter((order: any) => order.archived !== true)
    .map((order: any) => {
      const status = normalizeStatus(order.order_status);
      if (status !== "uretimde") return null;
      const ready = new Date(order.expected_ready_date);
      ready.setHours(0, 0, 0, 0);
      const diffDays = Math.round((ready.getTime() - today.getTime()) / 86_400_000);
      if (diffDays > 7) return null;
      const supplier = relationOne(order.suppliers as any);
      return {
        id: order.id,
        name: order.name ?? "Siparis",
        status: order.order_status ?? null,
        supplier: supplier?.name ?? null,
        expected_ready_date: order.expected_ready_date ?? null,
        expected_ready_display: formatDate(order.expected_ready_date),
        days_to_ready: diffDays,
        message:
          diffDays < 0
            ? `${Math.abs(diffDays)} gun gecikti`
            : diffDays === 0
              ? "Bugun hazir olmali"
              : `${diffDays} gun icinde hazir`,
        url: appUrl(ctx.appBaseUrl, `/orders/${order.id}`),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .slice(0, limit);
}

async function getRemainingPaymentRows(ctx: ToolContext, limit = 10) {
  if (!ctx.allowFinance) return [];

  const [{ data: orders }, { data: payments }] = await Promise.all([
    ctx.supabase
      .from("orders")
      .select("id, name, supplier_id, total_amount, currency, expected_ready_date, created_at, archived")
      .order("created_at", { ascending: true }),
    ctx.supabase.from("order_payments").select("order_id, amount, status"),
  ]);

  const supplierIdByOrderId = new Map<string, string>();
  const activeOrders = (orders ?? []).filter((order: any) => order.archived !== true);

  activeOrders.forEach((order: any) => {
    if (order.supplier_id) supplierIdByOrderId.set(String(order.id), String(order.supplier_id));
  });

  const supplierPaidTotals = new Map<string, number>();
  (payments ?? []).forEach((payment: any) => {
    if (payment.status !== "Odendi") return;
    const supplierId = supplierIdByOrderId.get(String(payment.order_id));
    if (!supplierId) return;
    supplierPaidTotals.set(
      supplierId,
      (supplierPaidTotals.get(supplierId) ?? 0) + paidAmount(payment.amount)
    );
  });

  const supplierOrders = new Map<string, any[]>();
  activeOrders.forEach((order: any) => {
    if (!order.supplier_id) return;
    const bucket = supplierOrders.get(String(order.supplier_id)) ?? [];
    bucket.push(order);
    supplierOrders.set(String(order.supplier_id), bucket);
  });

  const rows: any[] = [];
  supplierOrders.forEach((supplierOrderList, supplierId) => {
    const sortedOrders = [...supplierOrderList].sort((left, right) => {
      const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
      const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
      return leftTime - rightTime || String(left.id).localeCompare(String(right.id));
    });
    let supplierCredit = supplierPaidTotals.get(supplierId) ?? 0;
    sortedOrders.forEach((order) => {
      const total = Number(order.total_amount ?? 0) || 0;
      const remaining = Math.max(0, total - supplierCredit);
      supplierCredit = Math.max(0, supplierCredit - total);
      if (remaining <= 0) return;
      rows.push({
        id: order.id,
        name: order.name ?? "Siparis",
        total_amount: total,
        remaining,
        remaining_display: formatMoney(remaining, order.currency),
        currency: order.currency ?? "USD",
        expected_ready_date: order.expected_ready_date ?? null,
        expected_ready_display: formatDate(order.expected_ready_date),
        url: appUrl(ctx.appBaseUrl, `/orders/${order.id}`),
      });
    });
  });

  return rows.sort((left, right) => right.remaining - left.remaining).slice(0, limit);
}

export async function getDashboardPriorityList(ctx: ToolContext, input: { limit?: number }) {
  const limit = limitNumber(input.limit, 12, 30);
  const [overdueShipments, missingDocs, productionAlerts, paymentRows] = await Promise.all([
    getOverdueShipmentRows(ctx, 6),
    getOrdersWithMissingDocs(ctx, 6),
    getProductionAlerts(ctx, 6),
    getRemainingPaymentRows(ctx, 6),
  ]);

  const items = [
    ...overdueShipments.map((shipment) => ({
      type: "shipment_overdue",
      priority: 1,
      title: shipment.file_no,
      description: `ETA gecikti: ${shipment.eta_display ?? "-"}`,
      meta: shipment.status,
      url: shipment.url,
      data: shipment,
    })),
    ...missingDocs.map((order) => ({
      type: "missing_order_documents",
      priority: 2,
      title: order.name,
      description: `${order.missing_documents.length} eksik evrak: ${order.missing_documents.slice(0, 3).join(", ")}`,
      meta: order.expected_ready_display,
      url: order.url,
      data: order,
    })),
    ...productionAlerts.map((order) => ({
      type: "production_alert",
      priority: order.days_to_ready < 0 ? 1 : 3,
      title: order.name,
      description: order.message,
      meta: order.supplier,
      url: order.url,
      data: order,
    })),
    ...paymentRows.map((order) => ({
      type: "remaining_payment",
      priority: 4,
      title: order.name,
      description: `${order.remaining_display} kalan odeme`,
      meta: order.expected_ready_display,
      url: order.url,
      data: order,
    })),
  ]
    .sort((left, right) => left.priority - right.priority)
    .slice(0, limit);

  return {
    generated_at: new Date().toISOString(),
    finance_included: ctx.allowFinance,
    counts: {
      overdue_shipments: overdueShipments.length,
      missing_document_orders: missingDocs.length,
      production_alerts: productionAlerts.length,
      remaining_payment_orders: paymentRows.length,
    },
    items,
  };
}

export async function getOverdueShipments(ctx: ToolContext, input: { limit?: number }) {
  return {
    generated_at: new Date().toISOString(),
    shipments: await getOverdueShipmentRows(ctx, limitNumber(input.limit, 10, 50)),
  };
}

export async function searchProducts(
  ctx: ToolContext,
  input: { query?: string; limit?: number; include_finance?: boolean }
) {
  const limit = limitNumber(input.limit, 10, 30);
  const query = normalizeSearch(input.query);

  let builder = ctx.supabase
    .from("products")
    .select("id, code, name, brand, netsis_stok_kodu, group_id, gtip_id, unit_price, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query) {
    builder = builder.or(
      `code.ilike.%${query}%,name.ilike.%${query}%,brand.ilike.%${query}%,netsis_stok_kodu.ilike.%${query}%`
    );
  }

  const { data: products, error } = await builder;
  if (error) throw new Error(error.message);

  const groupIds = Array.from(
    new Set((products ?? []).map((product: any) => product.group_id).filter(Boolean))
  );
  const gtipIds = Array.from(
    new Set((products ?? []).map((product: any) => product.gtip_id).filter(Boolean))
  );

  const [{ data: groups }, { data: gtips }] = await Promise.all([
    groupIds.length
      ? ctx.supabase.from("product_groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] as any[] }),
    gtipIds.length
      ? ctx.supabase.from("gtips").select("id, code").in("id", gtipIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const groupById = new Map((groups ?? []).map((group: any) => [String(group.id), group.name]));
  const gtipById = new Map((gtips ?? []).map((gtip: any) => [String(gtip.id), gtip.code]));
  const includeFinance = ctx.allowFinance && Boolean(input.include_finance);

  return {
    query: query || null,
    count: products?.length ?? 0,
    finance_included: includeFinance,
    products: (products ?? []).map((product: any) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      brand: product.brand,
      stock_code: product.netsis_stok_kodu,
      category: product.group_id ? groupById.get(String(product.group_id)) ?? null : null,
      gtip: product.gtip_id ? gtipById.get(String(product.gtip_id)) ?? null : null,
      unit_price: includeFinance ? product.unit_price ?? null : undefined,
      url: appUrl(ctx.appBaseUrl, `/products/${product.id}`),
    })),
  };
}

export async function getSupplierOpenOrders(
  ctx: ToolContext,
  input: { supplier_id?: string; supplier_query?: string; limit?: number; include_finance?: boolean }
) {
  const limit = limitNumber(input.limit, 10, 50);
  const supplierQuery = normalizeSearch(input.supplier_query);
  let supplierId = input.supplier_id?.trim() || "";
  let supplierName: string | null = null;

  if (!supplierId && supplierQuery) {
    const { data: suppliers } = await ctx.supabase
      .from("suppliers")
      .select("id, name")
      .ilike("name", `%${supplierQuery}%`)
      .limit(1);
    supplierId = suppliers?.[0]?.id ? String(suppliers[0].id) : "";
    supplierName = suppliers?.[0]?.name ?? null;
  }

  if (!supplierId) {
    return { error: "supplier_id veya supplier_query gerekli", orders: [] };
  }

  const { data: supplier } = await ctx.supabase
    .from("suppliers")
    .select("id, name")
    .eq("id", supplierId)
    .maybeSingle();
  supplierName = supplierName ?? supplier?.name ?? null;

  const { data: orders, error } = await ctx.supabase
    .from("orders")
    .select("id, name, order_status, total_amount, currency, expected_ready_date, created_at, archived")
    .eq("supplier_id", supplierId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const supplierOrders = (orders ?? []).filter((order: any) => order.archived !== true);
  const openOrders = supplierOrders.filter(
    (order: any) => normalizeStatus(order.order_status) !== "depoya teslim edildi"
  );
  const includeFinance = ctx.allowFinance && Boolean(input.include_finance);

  let remainingByOrder = new Map<string, number>();
  if (includeFinance) {
    const orderIds = supplierOrders.map((order: any) => order.id).filter(Boolean);
    const { data: payments } = orderIds.length
      ? await ctx.supabase
          .from("order_payments")
          .select("order_id, amount, status")
          .in("order_id", orderIds)
      : { data: [] as any[] };

    let supplierCredit = (payments ?? []).reduce((sum: number, payment: any) => {
      return payment.status === "Odendi" ? sum + paidAmount(payment.amount) : sum;
    }, 0);

    supplierOrders.forEach((order: any) => {
      const total = Number(order.total_amount ?? 0) || 0;
      const remaining = Math.max(0, total - supplierCredit);
      remainingByOrder.set(String(order.id), remaining);
      supplierCredit = Math.max(0, supplierCredit - total);
    });
  }

  return {
    supplier: { id: supplierId, name: supplierName },
    finance_included: includeFinance,
    count: openOrders.length,
    orders: openOrders.slice(0, limit).map((order: any) => {
      const remaining = remainingByOrder.get(String(order.id));
      return {
        id: order.id,
        name: order.name,
        status: order.order_status,
        expected_ready_date: order.expected_ready_date,
        expected_ready_display: formatDate(order.expected_ready_date),
        total_amount: includeFinance ? Number(order.total_amount ?? 0) || 0 : undefined,
        remaining_amount: includeFinance ? remaining ?? null : undefined,
        remaining_display:
          includeFinance && typeof remaining === "number"
            ? formatMoney(remaining, order.currency)
            : undefined,
        currency: includeFinance ? order.currency ?? "USD" : undefined,
        url: appUrl(ctx.appBaseUrl, `/orders/${order.id}`),
      };
    }),
  };
}

export async function getRfqMissingPrices(ctx: ToolContext, input: { limit?: number }) {
  const limit = limitNumber(input.limit, 10, 30);
  const { data: rfqs, error } = await ctx.supabase
    .from("rfqs")
    .select("id, code, title, status, response_due_date, currency, target_suppliers, created_at")
    .not("status", "in", "(kapatildi,closed)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rfqIds = (rfqs ?? []).map((rfq: any) => rfq.id).filter(Boolean);
  if (!rfqIds.length) return { count: 0, rfqs: [] };

  const [{ data: items }, { data: quotes }] = await Promise.all([
    ctx.supabase
      .from("rfq_items")
      .select("id, rfq_id, product_code, product_name, quantity")
      .in("rfq_id", rfqIds),
    ctx.supabase
      .from("rfq_quotes")
      .select("id, rfq_id, supplier_id, currency")
      .in("rfq_id", rfqIds),
  ]);

  const quoteIds = (quotes ?? []).map((quote: any) => quote.id).filter(Boolean);
  const supplierIds = Array.from(
    new Set([
      ...(quotes ?? []).map((quote: any) => quote.supplier_id).filter(Boolean),
      ...(rfqs ?? []).flatMap((rfq: any) =>
        Array.isArray(rfq.target_suppliers) ? rfq.target_suppliers.filter(Boolean) : []
      ),
    ])
  );

  const [{ data: quoteItems }, { data: suppliers }] = await Promise.all([
    quoteIds.length
      ? ctx.supabase
          .from("rfq_quote_items")
          .select("rfq_quote_id, rfq_item_id, unit_price")
          .in("rfq_quote_id", quoteIds)
      : Promise.resolve({ data: [] as any[] }),
    supplierIds.length
      ? ctx.supabase.from("suppliers").select("id, name").in("id", supplierIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const supplierById = new Map((suppliers ?? []).map((supplier: any) => [String(supplier.id), supplier.name]));
  const itemsByRfq = new Map<string, any[]>();
  (items ?? []).forEach((item: any) => {
    const bucket = itemsByRfq.get(String(item.rfq_id)) ?? [];
    bucket.push(item);
    itemsByRfq.set(String(item.rfq_id), bucket);
  });

  const quotesByRfq = new Map<string, any[]>();
  (quotes ?? []).forEach((quote: any) => {
    const bucket = quotesByRfq.get(String(quote.rfq_id)) ?? [];
    bucket.push(quote);
    quotesByRfq.set(String(quote.rfq_id), bucket);
  });

  const priceByQuoteItem = new Map<string, number | null>();
  (quoteItems ?? []).forEach((item: any) => {
    priceByQuoteItem.set(`${item.rfq_quote_id}:${item.rfq_item_id}`, item.unit_price ?? null);
  });

  const rows = (rfqs ?? [])
    .map((rfq: any) => {
      const rfqItems = itemsByRfq.get(String(rfq.id)) ?? [];
      const quoteList = quotesByRfq.get(String(rfq.id)) ?? [];
      const targetSupplierIds = Array.isArray(rfq.target_suppliers)
        ? rfq.target_suppliers.map(String)
        : [];
      const quoteSupplierIds = quoteList.map((quote: any) => String(quote.supplier_id));
      const allSupplierIds = Array.from(new Set([...targetSupplierIds, ...quoteSupplierIds]));

      const suppliersWithMissing = allSupplierIds
        .map((supplierId) => {
          const quote = quoteList.find((item: any) => String(item.supplier_id) === supplierId);
          const missingItems = rfqItems.filter((rfqItem) => {
            const price = quote ? priceByQuoteItem.get(`${quote.id}:${rfqItem.id}`) : null;
            return !(typeof price === "number" && Number.isFinite(price) && price > 0);
          });

          return {
            supplier_id: supplierId,
            supplier_name: supplierById.get(String(supplierId)) ?? supplierId,
            quote_exists: Boolean(quote),
            missing_count: missingItems.length,
            priced_count: rfqItems.length - missingItems.length,
            missing_products: missingItems.slice(0, 8).map((item: any) => ({
              code: item.product_code,
              name: item.product_name,
              quantity: item.quantity,
            })),
          };
        })
        .filter((supplier) => supplier.missing_count > 0);

      return {
        id: rfq.id,
        code: rfq.code,
        title: rfq.title,
        status: rfq.status,
        response_due_date: rfq.response_due_date,
        response_due_display: formatDate(rfq.response_due_date),
        currency: rfq.currency,
        item_count: rfqItems.length,
        suppliers_with_missing: suppliersWithMissing,
        url: appUrl(ctx.appBaseUrl, `/rfqs/${rfq.id}`),
      };
    })
    .filter((rfq) => rfq.suppliers_with_missing.length > 0);

  return {
    generated_at: new Date().toISOString(),
    count: rows.length,
    rfqs: rows,
  };
}

export async function getOrderPaymentSummary(
  ctx: ToolContext,
  input: { order_id?: string; order_query?: string }
) {
  if (!ctx.allowFinance) {
    return {
      finance_included: false,
      error: "Finans verisi MCP icin kapali. POKE_MCP_ALLOW_FINANCE=true ile acilabilir.",
    };
  }

  const orderQuery = normalizeSearch(input.order_query);
  let orderBuilder = ctx.supabase
    .from("orders")
    .select("id, name, supplier_id, total_amount, currency, created_at, suppliers(name)")
    .limit(1);

  if (input.order_id) {
    orderBuilder = orderBuilder.eq("id", input.order_id);
  } else if (orderQuery) {
    orderBuilder = orderBuilder.ilike("name", `%${orderQuery}%`);
  } else {
    return { error: "order_id veya order_query gerekli" };
  }

  const { data: foundOrders } = await orderBuilder;
  const order = foundOrders?.[0] as any;
  if (!order) return { error: "Siparis bulunamadi" };

  const { data: supplierOrders } = await ctx.supabase
    .from("orders")
    .select("id, name, total_amount, currency, created_at")
    .eq("supplier_id", order.supplier_id)
    .order("created_at", { ascending: true });

  const supplierOrderIds = (supplierOrders ?? []).map((row: any) => row.id);
  const { data: payments } = supplierOrderIds.length
    ? await ctx.supabase
        .from("order_payments")
        .select("id, order_id, amount, currency, status, payment_date")
        .in("order_id", supplierOrderIds)
    : { data: [] as any[] };

  let supplierCredit = (payments ?? []).reduce((sum: number, payment: any) => {
    return payment.status === "Odendi" ? sum + paidAmount(payment.amount) : sum;
  }, 0);

  let selectedRemaining = 0;
  (supplierOrders ?? []).forEach((row: any) => {
    const total = Number(row.total_amount ?? 0) || 0;
    const remaining = Math.max(0, total - supplierCredit);
    if (String(row.id) === String(order.id)) selectedRemaining = remaining;
    supplierCredit = Math.max(0, supplierCredit - total);
  });

  const supplier = relationOne(order.suppliers as any);
  const orderPayments = (payments ?? []).filter((payment: any) => payment.order_id === order.id);

  return {
    finance_included: true,
    order: {
      id: order.id,
      name: order.name,
      supplier: supplier?.name ?? null,
      total_amount: Number(order.total_amount ?? 0) || 0,
      total_display: formatMoney(Number(order.total_amount ?? 0) || 0, order.currency),
      remaining_amount: selectedRemaining,
      remaining_display: formatMoney(selectedRemaining, order.currency),
      currency: order.currency ?? "USD",
      url: appUrl(ctx.appBaseUrl, `/orders/${order.id}`),
    },
    payments: orderPayments.map((payment: any) => ({
      amount: Number(payment.amount ?? 0) || 0,
      amount_display: formatMoney(Number(payment.amount ?? 0) || 0, payment.currency ?? order.currency),
      currency: payment.currency ?? order.currency,
      status: payment.status,
      payment_date: payment.payment_date,
    })),
    note: "Kalan odeme tedarikci bazli fazla odeme carry-over mantigi ile hesaplandi.",
  };
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FALLBACK_LEAD_TIME_DAYS = 105;
const FALLBACK_SAFETY_DAYS = 15;
const DELIVERED_STATUS_TOKENS = new Set(["depoya teslim edildi", "depoya teslim", "delivered"]);

type ProductRow = {
  id: string;
  code: string | null;
  name: string | null;
  netsis_stok_kodu: string | null;
  group_id: string | null;
  gtip_id: string | null;
  product_type_id: string | null;
  product_groups?: { name?: string | null }[] | { name?: string | null } | null;
};

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const normalizeStatusToken = (value: string | null | undefined) =>
  String(value ?? "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .replace(/\s+/g, " ")
    .trim();

const extractOrderStatus = (ordersField: any) => {
  if (!ordersField) return "";
  if (Array.isArray(ordersField)) return String(ordersField[0]?.order_status ?? "");
  return String(ordersField.order_status ?? "");
};

const fetchTransitByProduct = async (supabase: any, productIds: string[]) => {
  const totals: Record<string, number> = {};
  if (!productIds.length) return totals;

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, quantity, orders!inner(order_status)")
      .in("product_id", productIds)
      .range(from, to);

    if (error || !data?.length) break;

    (data as any[]).forEach((row) => {
      const pid = row.product_id as string | null;
      if (!pid) return;
      const status = normalizeStatusToken(extractOrderStatus(row.orders));
      if (DELIVERED_STATUS_TOKENS.has(status)) return;
      totals[pid] = (totals[pid] ?? 0) + Number(row.quantity ?? 0);
    });

    if (data.length < pageSize) break;
  }

  return totals;
};

const fetchOpenProformaByProduct = async (
  supabase: any,
  productIds: string[],
  supplierId?: string
) => {
  const proformaByProduct = new Map<string, number>();
  const invoicedByProduct = new Map<string, number>();
  if (!productIds.length) return proformaByProduct;

  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let query = supabase
      .from("proforma_items")
      .select("product_id, quantity, proformas!inner(status, supplier_id)")
      .in("product_id", productIds)
      .neq("proformas.status", "iptal")
      .range(from, to);
    if (supplierId) query = query.eq("proformas.supplier_id", supplierId);
    const { data, error } = await query;
    if (error || !data?.length) break;
    (data as any[]).forEach((row) => {
      const pid = row.product_id ? String(row.product_id) : "";
      if (!pid) return;
      proformaByProduct.set(pid, (proformaByProduct.get(pid) ?? 0) + Number(row.quantity ?? 0));
    });
    if (data.length < pageSize) break;
  }

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let query = supabase
      .from("order_items")
      .select("product_id, quantity, orders!inner(supplier_id)")
      .in("product_id", productIds)
      .range(from, to);
    if (supplierId) query = query.eq("orders.supplier_id", supplierId);
    const { data, error } = await query;
    if (error || !data?.length) break;
    (data as any[]).forEach((row) => {
      const pid = row.product_id ? String(row.product_id) : "";
      if (!pid) return;
      invoicedByProduct.set(pid, (invoicedByProduct.get(pid) ?? 0) + Number(row.quantity ?? 0));
    });
    if (data.length < pageSize) break;
  }

  const openByProduct = new Map<string, number>();
  productIds.forEach((pid) => {
    const open = (proformaByProduct.get(pid) ?? 0) - (invoicedByProduct.get(pid) ?? 0);
    openByProduct.set(pid, open > 0 ? open : 0);
  });
  return openByProduct;
};

const parseFilters = (url: URL) => {
  const q = (url.searchParams.get("q") ?? "").trim();
  const supplier = url.searchParams.get("supplier") ?? "";
  const gtip = url.searchParams.get("gtip") ?? "";
  const tip = url.searchParams.get("tip") ?? "";
  const filledOnly = url.searchParams.get("filledOnly") === "1";
  const quantityFilter = url.searchParams.get("quantityFilter") ?? "";
  const groupParam = url.searchParams.get("group") ?? "";
  const selectedGroupIds = groupParam ? groupParam.split(",").filter(Boolean) : [];
  const queryTokens = q
    ? q
        .replace(/,/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const includeFilledOnly =
    quantityFilter === "filled" || quantityFilter === "both" || filledOnly;

  return {
    q,
    supplier,
    gtip,
    tip,
    queryTokens,
    selectedGroupIds,
    includeFilledOnly,
  };
};

const fetchAllProducts = async (supabase: any, filters: ReturnType<typeof parseFilters>) => {
  const filledProductIds = (() => {
    if (!filters.includeFilledOnly) return null;
    return supabase.from("order_plan_entries").select("product_id").gt("value", 0);
  })();

  const baseSelect =
    "id, code, name, netsis_stok_kodu, group_id, gtip_id, product_type_id, product_groups!left(name)";
  const select = filters.supplier
    ? `${baseSelect}, supplier_product_aliases!inner(supplier_id)`
    : baseSelect;

  const buildQuery = () => {
    let queryBuilder = supabase
      .from("products")
      .select(select as any)
      .order("id", { ascending: true });

    if (filters.queryTokens.length === 1) {
      const term = filters.queryTokens[0];
      queryBuilder = queryBuilder.or(
        `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
      );
    } else if (filters.queryTokens.length > 1) {
      filters.queryTokens.forEach((term) => {
        queryBuilder = queryBuilder.or(
          `code.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`
        );
      });
    }
    if (filters.selectedGroupIds.length > 0) {
      queryBuilder = queryBuilder.in("group_id", filters.selectedGroupIds);
    }
    if (filters.supplier) {
      queryBuilder = queryBuilder.eq("supplier_product_aliases.supplier_id", filters.supplier);
    }
    if (filters.gtip) {
      queryBuilder = filters.gtip === "none"
        ? queryBuilder.is("gtip_id", null)
        : queryBuilder.eq("gtip_id", filters.gtip);
    }
    if (filters.tip) {
      queryBuilder = filters.tip === "none"
        ? queryBuilder.is("product_type_id", null)
        : queryBuilder.eq("product_type_id", filters.tip);
    }
    if (filters.includeFilledOnly && filledProductIds) {
      queryBuilder = queryBuilder.in("id", filledProductIds as any);
    }
    return queryBuilder;
  };

  const rows: ProductRow[] = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery().range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as ProductRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
};

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const url = new URL(req.url);
  const filters = parseFilters(url);

  const [{ data: groups }, { data: planDefaults }, authResult] = await Promise.all([
    supabase.from("product_groups").select("id, name, lead_time_days, safety_days").order("name"),
    supabase.from("order_plan_defaults").select("lead_time_days, safety_days").eq("id", 1).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const resolveLeadSafety = (groupId?: string | null) => {
    const group = groups?.find((g) => g.id === groupId);
    return {
      lead: group?.lead_time_days ?? planDefaults?.lead_time_days ?? FALLBACK_LEAD_TIME_DAYS,
      safety: group?.safety_days ?? planDefaults?.safety_days ?? FALLBACK_SAFETY_DAYS,
      groupName: group?.name ?? "Kategori yok",
    };
  };

  const products = await fetchAllProducts(supabase, filters);
  if (!products.length) {
    return NextResponse.json(
      { ok: false, message: "Filtreye uygun urun bulunamadi." },
      { status: 400 }
    );
  }

  const productIds = Array.from(new Set(products.map((p) => p.id).filter(Boolean)));
  const netsisCodes = Array.from(
    new Set(
      products
        .map((p) => (p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : ""))
        .filter(Boolean)
    )
  );

  const sales10yByProduct = new Map<string, number>();
  for (const ids of chunk(productIds, 500)) {
    const { data } = await supabase
      .from("product_sales_10y_totals")
      .select("product_id, total_10y")
      .in("product_id", ids);
    (data ?? []).forEach((row) => {
      if (row.product_id) sales10yByProduct.set(row.product_id, Number(row.total_10y ?? 0));
    });
  }

  const [inTransitByProduct, openProformaByProduct, rfqItems, planEntries] = await Promise.all([
    fetchTransitByProduct(supabase, productIds),
    fetchOpenProformaByProduct(supabase, productIds, filters.supplier || undefined),
    supabase
      .from("rfq_items")
      .select("product_id, quantity, rfqs!inner(status)")
      .not("rfqs.status", "in", "(kapatildi,closed)"),
    supabase.from("order_plan_entries").select("product_id, value"),
  ]);

  const rfqByProduct = new Map<string, number>();
  (rfqItems.data ?? []).forEach((row) => {
    const pid = row.product_id ? String(row.product_id) : "";
    if (!pid) return;
    rfqByProduct.set(pid, (rfqByProduct.get(pid) ?? 0) + Number(row.quantity ?? 0));
  });

  const planByProduct = new Map<string, number>();
  (planEntries.data ?? []).forEach((row) => {
    const pid = row.product_id ? String(row.product_id) : "";
    if (!pid) return;
    planByProduct.set(pid, Number(row.value ?? 0));
  });

  const { data: jobRow, error: jobError } = await supabase
    .from("order_plan_export_jobs")
    .insert({
      created_by: authResult.data.user?.id ?? null,
      status: "queued",
      params: filters,
      total_products: products.length,
      total_codes: netsisCodes.length,
      processed_codes: 0,
    })
    .select("id")
    .single();

  if (jobError || !jobRow?.id) {
    return NextResponse.json({ ok: false, message: "Export isi olusturulamadi." }, { status: 500 });
  }

  const jobId = String(jobRow.id);
  const staticRows = products.map((p) => {
    const { lead, safety, groupName } = resolveLeadSafety(p.group_id);
    return {
      job_id: jobId,
      product_id: p.id,
      code: String(p.code ?? ""),
      name: String(p.name ?? ""),
      group_name: groupName,
      netsis_code: p.netsis_stok_kodu ? String(p.netsis_stok_kodu).trim() : null,
      in_transit: Number(inTransitByProduct[p.id] ?? 0),
      proforma_open: Number(openProformaByProduct.get(p.id) ?? 0),
      rfq_qty: Number(rfqByProduct.get(p.id) ?? 0),
      sales10y: Number(sales10yByProduct.get(p.id) ?? 0),
      lead,
      safety,
      plan_value: Number(planByProduct.get(p.id) ?? 0),
    };
  });

  for (const batchRows of chunk(staticRows, 500)) {
    const { error } = await supabase.from("order_plan_export_job_rows").insert(batchRows);
    if (error) {
      await supabase
        .from("order_plan_export_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: `Satirlar kaydedilemedi: ${error.message}`,
        })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, message: "Export satirlari kaydedilemedi." }, { status: 500 });
    }
  }

  const codeRows = netsisCodes.map((code) => ({ job_id: jobId, netsis_code: code }));
  for (const batchCodes of chunk(codeRows, 1000)) {
    const { error } = await supabase.from("order_plan_export_job_codes").insert(batchCodes);
    if (error) {
      await supabase
        .from("order_plan_export_jobs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error: `Kodlar kaydedilemedi: ${error.message}`,
        })
        .eq("id", jobId);
      return NextResponse.json({ ok: false, message: "Export kodlari kaydedilemedi." }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    job: {
      id: jobId,
      status: "queued",
      totalProducts: products.length,
      totalCodes: netsisCodes.length,
      processedCodes: 0,
    },
  });
}

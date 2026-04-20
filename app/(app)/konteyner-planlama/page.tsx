import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import ContainerPlannerBoard, { type PlannerLoad } from "@/components/ContainerPlannerBoard";

export const metadata: Metadata = {
  title: "Konteyner Planlama",
};

const STATUS_DONE = "Tamamlandi";
const STATUS_PROGRESS = "Devam ediyor";
const STATUS_TODO = "Sirada";

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

const INCLUDED_ORDER_STATUS_TOKENS = new Set([
  "siparis verildi",
  "proforma geldi",
  "uretimde",
  "hazir",
]);
const PAGE_SIZE = 1000;

const toNumber = (value: unknown) => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const takeOne = <T,>(value: T | T[] | null | undefined): T | null => {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
};

type OrderRef = {
  id?: string | null;
  name?: string | null;
  reference_name?: string | null;
  order_status?: string | null;
  supplier_id?: string | null;
};

type ProductRef = {
  code?: string | null;
  name?: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string | null;
  product_id: string | null;
  quantity: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  products: ProductRef | ProductRef[] | null;
};

type SupplierRow = {
  id: string;
  name: string | null;
};

type ProductAttrValueRow = {
  product_id: string | null;
  value_text: string | null;
  value_number: number | null;
  attribute: { name?: string | null } | { name?: string | null }[] | null;
};

type ProductExtraAttrRow = {
  product_id: string | null;
  name: string | null;
  value_text: string | null;
  value_number: number | null;
};

const normalizeName = (value: string | null | undefined) =>
  String(value ?? "")
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("İ", "i")
    .replaceAll("ş", "s")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .trim();

const isWeightName = (name: string | null | undefined) => {
  const lower = normalizeName(name);
  return lower.includes("weight") || lower.includes("agirlik") || lower.includes("ağırlık");
};

type PlannerDataResult = {
  loads: PlannerLoad[];
  stats: {
    queriedOrderItems: number;
    excludedByStatus: number;
    excludedZeroQty: number;
    supabaseError: string | null;
  };
};

const buildInitialLoads = async (): Promise<PlannerDataResult> => {
  const supabase = await createSupabaseServerClient();
  const matchedOrders: OrderRef[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("orders")
      .select("id, name, reference_name, order_status, supplier_id, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      return {
        loads: [],
        stats: {
          queriedOrderItems: 0,
          excludedByStatus: 0,
          excludedZeroQty: 0,
          supabaseError: error.message,
        },
      };
    }

    const rows = (data ?? []) as OrderRef[];
    if (!rows.length) break;
    rows.forEach((row) => {
      const status = normalizeStatusToken(row.order_status);
      if (INCLUDED_ORDER_STATUS_TOKENS.has(status)) matchedOrders.push(row);
    });
    if (rows.length < PAGE_SIZE) break;
  }

  const orderMap = new Map<string, OrderRef>();
  matchedOrders.forEach((order) => {
    if (order.id) orderMap.set(String(order.id), order);
  });
  const orderIds = Array.from(orderMap.keys());
  if (!orderIds.length) {
    return {
      loads: [],
      stats: {
        queriedOrderItems: 0,
        excludedByStatus: 0,
        excludedZeroQty: 0,
        supabaseError: null,
      },
    };
  }

  const orderItems: OrderItemRow[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    const batchOrderIds = orderIds.slice(i, i + 200);
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, quantity, net_weight_kg, gross_weight_kg, products(code, name)")
        .in("order_id", batchOrderIds)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        return {
          loads: [],
          stats: {
            queriedOrderItems: orderItems.length,
            excludedByStatus: 0,
            excludedZeroQty: 0,
            supabaseError: error.message,
          },
        };
      }

      const rows = (data ?? []) as OrderItemRow[];
      if (!rows.length) break;
      orderItems.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
  }

  if (!orderItems.length) {
    return {
      loads: [],
      stats: {
        queriedOrderItems: 0,
        excludedByStatus: 0,
        excludedZeroQty: 0,
        supabaseError: null,
      },
    };
  }

  const productIds = Array.from(
    new Set(
      orderItems
        .map((row) => {
          const product = takeOne<ProductRef>(row.products);
          return product?.code && row.product_id ? String(row.product_id) : row.product_id ? String(row.product_id) : null;
        })
        .filter(Boolean) as string[]
    )
  );

  const weightByProductId = new Map<string, number>();
  if (productIds.length) {
    const { data: attrValuesRaw } = await supabase
      .from("product_attribute_values")
      .select("product_id, value_text, value_number, attribute:product_attributes(name)")
      .in("product_id", productIds);
    const attrValues = (attrValuesRaw ?? []) as ProductAttrValueRow[];
    for (const row of attrValues) {
      const pid = row.product_id ? String(row.product_id) : "";
      if (!pid || weightByProductId.has(pid)) continue;
      const attr = takeOne<{ name?: string | null }>(row.attribute);
      if (!isWeightName(attr?.name)) continue;
      const value = row.value_number ?? toNumber(row.value_text);
      if (value > 0) weightByProductId.set(pid, value);
    }

    const { data: extraAttrsRaw } = await supabase
      .from("product_extra_attributes")
      .select("product_id, name, value_text, value_number")
      .in("product_id", productIds);
    const extraAttrs = (extraAttrsRaw ?? []) as ProductExtraAttrRow[];
    for (const row of extraAttrs) {
      const pid = row.product_id ? String(row.product_id) : "";
      if (!pid || weightByProductId.has(pid)) continue;
      if (!isWeightName(row.name)) continue;
      const value = row.value_number ?? toNumber(row.value_text);
      if (value > 0) weightByProductId.set(pid, value);
    }
  }

  const supplierIds = Array.from(
    new Set(
      orderItems
        .map((row) => {
          const order = row.order_id ? orderMap.get(String(row.order_id)) ?? null : null;
          return order?.supplier_id ? String(order.supplier_id) : null;
        })
        .filter(Boolean) as string[]
    )
  );

  const supplierMap = new Map<string, string>();
  if (supplierIds.length) {
    const { data: suppliersRaw } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
    const suppliers = (suppliersRaw ?? []) as SupplierRow[];
    suppliers.forEach((supplier) => {
      supplierMap.set(String(supplier.id), String(supplier.name ?? ""));
    });
  }

  let excludedByStatus = 0;
  let excludedZeroQty = 0;

  const loads = orderItems
    .map((row) => {
      const order = row.order_id ? orderMap.get(String(row.order_id)) ?? null : null;
      const product = takeOne<ProductRef>(row.products);
      const status = normalizeStatusToken(order?.order_status);
      if (!INCLUDED_ORDER_STATUS_TOKENS.has(status)) {
        excludedByStatus += 1;
        return null;
      }

      const quantity = toNumber(row.quantity);
      const grossKgRaw = toNumber(row.gross_weight_kg);
      const netKgRaw = toNumber(row.net_weight_kg);
      const perUnitWeight =
        row.product_id && weightByProductId.has(String(row.product_id))
          ? (weightByProductId.get(String(row.product_id)) ?? 0)
          : 0;
      const fallbackWeight = perUnitWeight > 0 ? perUnitWeight * Math.max(quantity, 0) : 0;
      const grossKg = grossKgRaw > 0 ? grossKgRaw : netKgRaw > 0 ? netKgRaw : fallbackWeight;
      if (quantity <= 0) excludedZeroQty += 1;

      const supplierId = order?.supplier_id ? String(order.supplier_id) : "";
      const supplierName = supplierMap.get(supplierId) || "Bilinmeyen tedarikci";
      const orderLabel =
        String(order?.name ?? order?.reference_name ?? row.order_id ?? "").trim() || `Siparis ${row.order_id}`;

      return {
        id: String(row.id),
        orderId: String(row.order_id ?? ""),
        orderLabel,
        supplierName,
        productCode: String(product?.code ?? "-"),
        productName: String(product?.name ?? "Urun"),
        quantity,
        grossKg,
        cbm: null,
        priority: grossKg > 1500 ? "high" : "normal",
      } as PlannerLoad;
    })
    .filter(Boolean) as PlannerLoad[];

  return {
    loads,
    stats: {
      queriedOrderItems: orderItems.length,
      excludedByStatus,
      excludedZeroQty,
      supabaseError: null,
    },
  };
};

export default async function ContainerPlanningPage() {
  const { role } = await getCurrentUserRole();
  if (!canViewModule(role, "order-plan")) {
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  const plannerData = await buildInitialLoads();
  const initialLoads = plannerData.loads;

  const tasks = [
    {
      title: "Veri akisi ve durum filtreleme",
      detail: "Once orders sonra ilgili order_items cekilerek eksik/yanlis durum eslesmeleri duzeltildi.",
      status: STATUS_DONE,
    },
    {
      title: "Siparis bazli drag-drop planlama",
      detail: "Havuz siparis collapse + urun bazli bolme + konteynerler arasi toplu siparis tasima aktif.",
      status: STATUS_DONE,
    },
    {
      title: "Havuz filtreleri ve manuel agirlik UX",
      detail: "Arama, tedarikci, 0 kg filtreleri; kalem/siparis override badge ve toplu override temizleme eklendi.",
      status: STATUS_DONE,
    },
    {
      title: "Kural motoru modlari",
      detail: "Hizli / Dengeli / Tedarikci bazli otomatik yerlesim algoritmalarinin ayrilmasi.",
      status: STATUS_PROGRESS,
    },
    {
      title: "Plan kaydetme + revizyon + export",
      detail: "Taslak/final kayit, revizyon gecmisi, konteyner bazli Excel/PDF operasyon ciktisi.",
      status: STATUS_TODO,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="rounded-[32px] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-black/40">Konteyner Planlama</p>
            <h2 className="mt-2 text-2xl font-semibold [font-family:var(--font-display)]">
              Drag-drop Konteyner Planlayici (MVP)
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/65">
              Yukleri havuzdan konteynere surukleyin, canli limitleri takip edin ve otomatik oneriyle plani hizlandirin.
              Bu surumde brut agirlik merkezli planlama aktif, kural motoru ve kalici plan kaydi siradaki adim.
            </p>
          </div>
          <Link
            href="/siparis-plani"
            className="rounded-full border border-black/15 bg-[var(--mint)] px-4 py-2 text-xs font-semibold text-black/75 hover:-translate-y-0.5"
          >
            Siparis Plani&apos;na don
          </Link>
        </div>
      </div>

      <div className="rounded-[32px] border border-black/10 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-black/45">Gorev Plani</h3>
        <div className="mt-3 grid gap-2">
          {tasks.map((task) => (
            <div key={task.title} className="rounded-2xl border border-black/10 bg-[var(--sand)]/35 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-black/80">{task.title}</p>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    task.status === STATUS_DONE
                      ? "bg-emerald-100 text-emerald-700"
                      : task.status === STATUS_PROGRESS
                      ? "bg-amber-100 text-amber-700"
                      : "bg-black/10 text-black/60"
                  }`}
                >
                  {task.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-black/60">{task.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-4 text-xs text-black/65 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1">
            Supabase kalem: {plannerData.stats.queriedOrderItems}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1">
            Durum disi filtrelenen: {plannerData.stats.excludedByStatus}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1">
            Adet 0 (bilgi): {plannerData.stats.excludedZeroQty}
          </span>
          <span className="rounded-full border border-black/10 bg-[var(--mint)] px-3 py-1">
            Havuza giren: {initialLoads.length}
          </span>
          {plannerData.stats.supabaseError ? (
            <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
              Hata: {plannerData.stats.supabaseError}
            </span>
          ) : null}
        </div>
      </div>

      <ContainerPlannerBoard initialLoads={initialLoads} />
    </section>
  );
}


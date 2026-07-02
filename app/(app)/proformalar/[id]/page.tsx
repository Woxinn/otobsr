import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEdit, canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaDeleteButton from "@/components/ProformaDeleteButton";
import { ChevronLeft, Building, Calendar, Hash, Package, Coins, TrendingUp, TrendingDown, Eye, FileText } from "lucide-react";

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("tr-TR");
};

const fmtNum = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

const fmtMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

export default async function ProformaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const allowDelete = canEdit(role);
  if (!canViewModule(role, "proformas")) {
    return <div className="p-6 text-sm text-red-600">Erişim yok.</div>;
  }

  const { data: proforma, error: proformaErr } = await supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, currency, total_amount, supplier_id, suppliers(name), notes")
    .eq("id", id)
    .maybeSingle();
  if (proformaErr) return <div className="p-6 text-sm text-red-600">Proforma okunamadı: {proformaErr.message}</div>;
  if (!proforma) return notFound();

  const pageSize = 1000;
  const items: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("proforma_items")
      .select("*")
      .eq("proforma_id", id)
      .order("product_code", { ascending: true })
      .range(from, to);
    if (error) {
      return <div className="p-6 text-sm text-red-600">Kalemler okunamadı: {error.message}</div>;
    }
    const batch = data ?? [];
    items.push(...batch);
    if (batch.length < pageSize) break;
  }

  const productIds = Array.from(
    new Set(items.map((row) => row.product_id).filter((value): value is string => Boolean(value)))
  );
  const productUnitPriceById = new Map<string, number>();
  if (productIds.length) {
    const { data: products } = await supabase
      .from("products")
      .select("id, unit_price")
      .in("id", productIds);
    (products ?? []).forEach((product) => {
      const unitPrice = Number(product.unit_price ?? 0);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
      productUnitPriceById.set(String(product.id), unitPrice);
    });
  }
  const latestOrderUnitPriceByProduct = new Map<
    string,
    { unitPrice: number; orderName: string | null; orderCreatedAt: string | null }
  >();
  if (productIds.length && proforma.supplier_id) {
    const { data: latestOrders } = await supabase
      .from("orders")
      .select("id, name, created_at")
      .eq("supplier_id", proforma.supplier_id)
      .order("created_at", { ascending: false, nullsFirst: false })
      .range(0, 1999);
    const latestOrderRows = latestOrders ?? [];
    const latestOrderIds = latestOrderRows.map((row) => row.id).filter(Boolean);
    if (latestOrderIds.length) {
      const orderRankById = new Map<string, number>();
      const orderMetaById = new Map<string, { name: string | null; created_at: string | null }>();
      latestOrderRows.forEach((row, index) => {
        orderRankById.set(String(row.id), index);
        orderMetaById.set(String(row.id), {
          name: row.name ?? null,
          created_at: row.created_at ?? null,
        });
      });

      const { data: latestOrderItems } = await supabase
        .from("order_items")
        .select("order_id, product_id, unit_price")
        .in("order_id", latestOrderIds)
        .in("product_id", productIds)
        .not("unit_price", "is", null);

      const sortedLatestOrderItems = (latestOrderItems ?? [])
        .filter((row) => row.order_id && row.product_id)
        .sort((a, b) => {
          const rankA = orderRankById.get(String(a.order_id)) ?? Number.MAX_SAFE_INTEGER;
          const rankB = orderRankById.get(String(b.order_id)) ?? Number.MAX_SAFE_INTEGER;
          return rankA - rankB;
        });

      sortedLatestOrderItems.forEach((row) => {
        const productId = String(row.product_id);
        if (latestOrderUnitPriceByProduct.has(productId)) return;
        const unitPrice = Number(row.unit_price ?? 0);
        if (!Number.isFinite(unitPrice) || unitPrice <= 0) return;
        const orderMeta = orderMetaById.get(String(row.order_id));
        latestOrderUnitPriceByProduct.set(productId, {
          unitPrice,
          orderName: orderMeta?.name ?? null,
          orderCreatedAt: orderMeta?.created_at ?? null,
        });
      });
    }
  }

  const totalQty = items.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
  const totalAmount = items.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
  const supplierName = Array.isArray(proforma.suppliers)
    ? proforma.suppliers[0]?.name
    : (proforma.suppliers as any)?.name;

  return (
    <section className="space-y-6">
      {/* Header Area */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href="/proformalar"
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Proformalar Listesine Dön
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 [font-family:var(--font-display)]">
              {proforma.proforma_no}
            </h1>
            {proforma.currency && (
              <span className="rounded-lg bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 uppercase">
                {proforma.currency}
              </span>
            )}
          </div>
          {proforma.name && (
            <p className="text-sm font-semibold text-slate-700">{proforma.name}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-medium">
            <span className="flex items-center gap-1">
              <Building className="h-3.5 w-3.5 opacity-70" />
              Tedarikçi: <strong className="text-slate-700">{supplierName ?? "-"}</strong>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 opacity-70" />
              Tarih: <strong className="text-slate-700">{fmtDate(proforma.proforma_date)}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {allowDelete ? <ProformaDeleteButton proformaId={id} redirectTo="/proformalar" /> : null}
          {proforma.supplier_id ? (
            <Link
              href={`/suppliers/${proforma.supplier_id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Eye className="h-3.5 w-3.5" />
              Tedarikçi Detayı
            </Link>
          ) : null}
        </div>
      </div>

      {/* Stats Area */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Toplam Kalem */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-indigo-500 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Toplam Kalem</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{items.length}</p>
          </div>
          <div className="rounded-lg bg-indigo-50 p-2.5 text-indigo-600">
            <Hash className="h-5 w-5" />
          </div>
        </div>

        {/* Toplam Adet */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-teal-500 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Toplam Adet</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{fmtNum(totalQty)}</p>
          </div>
          <div className="rounded-lg bg-teal-50 p-2.5 text-teal-600">
            <Package className="h-5 w-5" />
          </div>
        </div>

        {/* Toplam Tutar */}
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-emerald-600 flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Toplam Tutar</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {fmtMoney(totalAmount)} <span className="text-xs font-semibold text-slate-500 uppercase">{proforma.currency ?? "USD"}</span>
            </p>
          </div>
          <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
            <Coins className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm border-t-4 border-t-sky-500">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <th className="px-4 py-3.5">Ürün Kodu</th>
                <th className="px-4 py-3.5">Ürün Adı</th>
                <th className="px-4 py-3.5 text-right">Adet</th>
                <th className="px-4 py-3.5 text-right">Birim Fiyat</th>
                <th className="px-4 py-3.5 text-right">Son Sipariş Birim Fiyatı</th>
                <th className="px-4 py-3.5 text-right">Satır Tutarı</th>
                <th className="px-4 py-3.5">Not</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((row) => {
                const latestOrderUnitPrice =
                  row.product_id ? latestOrderUnitPriceByProduct.get(String(row.product_id)) : undefined;
                const fallbackUnitPrice =
                  row.product_id && productUnitPriceById.get(String(row.product_id))
                    ? {
                        unitPrice: Number(productUnitPriceById.get(String(row.product_id))),
                        orderName: "Ürün kartı",
                        orderCreatedAt: null,
                      }
                    : undefined;
                const baselineUnitPrice = latestOrderUnitPrice ?? fallbackUnitPrice;
                const currentUnitPrice = Number(row.unit_price ?? 0);
                const diffPct =
                  baselineUnitPrice?.unitPrice && baselineUnitPrice.unitPrice > 0 && Number.isFinite(currentUnitPrice)
                    ? ((currentUnitPrice - baselineUnitPrice.unitPrice) / baselineUnitPrice.unitPrice) * 100
                    : null;
                return (
                  <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.product_code}</td>
                    <td className="px-4 py-3 text-slate-700">{row.product_name ?? "-"}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-semibold">{fmtNum(row.quantity)}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-semibold">{fmtMoney(row.unit_price)}</td>
                    <td className="px-4 py-3 text-right">
                      {baselineUnitPrice ? (
                        <div className="space-y-1">
                          <div className="flex justify-end items-center gap-1.5">
                            <span className="text-xs text-slate-600 font-semibold">
                              {fmtMoney(baselineUnitPrice.unitPrice)}
                            </span>
                            {diffPct !== null && (
                              diffPct > 0 ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700" title="Son siparişe kıyasla fiyat artışı">
                                  <TrendingUp className="h-2.5 w-2.5 animate-pulse" />
                                  +{fmtNum(diffPct)}%
                                </span>
                              ) : diffPct < 0 ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700" title="Son siparişe kıyasla fiyat düşüşü (Tasarruf)">
                                  <TrendingDown className="h-2.5 w-2.5" />
                                  {fmtNum(diffPct)}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                                  Fark yok
                                </span>
                              )
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">
                            Kaynak: {baselineUnitPrice.orderName ?? "-"}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{fmtMoney(row.line_total)}</td>
                    <td className="px-4 py-3 text-slate-500">{row.notes ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

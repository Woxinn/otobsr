import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canEdit, canViewModule, getCurrentUserRole } from "@/lib/roles";
import ProformaDeleteButton from "@/components/ProformaDeleteButton";

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
    return <div className="p-6 text-sm text-red-600">Erisim yok.</div>;
  }

  const { data: proforma, error: proformaErr } = await supabase
    .from("proformas")
    .select("id, proforma_no, name, proforma_date, currency, total_amount, supplier_id, suppliers(name), notes")
    .eq("id", id)
    .maybeSingle();
  if (proformaErr) return <div className="p-6 text-sm text-red-600">Proforma okunamadi: {proformaErr.message}</div>;
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
      return <div className="p-6 text-sm text-red-600">Kalemler okunamadi: {error.message}</div>;
    }
    const batch = data ?? [];
    items.push(...batch);
    if (batch.length < pageSize) break;
  }

  const productIds = Array.from(
    new Set(items.map((row) => row.product_id).filter((value): value is string => Boolean(value)))
  );
  const latestOrderUnitPriceByProduct = new Map<
    string,
    { unitPrice: number; orderName: string | null; orderCreatedAt: string | null }
  >();
  if (productIds.length) {
    const { data: latestOrders } = await supabase
      .from("orders")
      .select("id, name, created_at")
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
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">Proforma Detay</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">{proforma.proforma_no}</h1>
          <div className="mt-1 text-sm font-semibold text-black/80">{proforma.name ?? "-"}</div>
          <div className="mt-1 text-sm text-black/60">
            Tedarikci: {supplierName ?? "-"} | Tarih: {fmtDate(proforma.proforma_date)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allowDelete ? <ProformaDeleteButton proformaId={id} redirectTo="/proformalar" /> : null}
          {proforma.supplier_id ? (
            <Link
              href={`/suppliers/${proforma.supplier_id}`}
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
            >
              Tedarikci detayi
            </Link>
          ) : null}
          <Link
            href="/proformalar"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/70"
          >
            Listeye don
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Toplam Kalem</div>
          <div className="mt-2 text-xl font-semibold text-black">{items.length}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Toplam Adet</div>
          <div className="mt-2 text-xl font-semibold text-black">{fmtNum(totalQty)}</div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Toplam Tutar</div>
          <div className="mt-2 text-xl font-semibold text-black">
            {fmtMoney(totalAmount)} {proforma.currency ?? "USD"}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-[11px] uppercase tracking-[0.24em] text-black/50">
                <th className="px-3 py-3">Urun kodu</th>
                <th className="px-3 py-3">Urun adi</th>
                <th className="px-3 py-3 text-right">Adet</th>
                <th className="px-3 py-3 text-right">Birim fiyat</th>
                <th className="px-3 py-3 text-right">Son sip. birim fiyat</th>
                <th className="px-3 py-3 text-right">Satir tutar</th>
                <th className="px-3 py-3">Not</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const latestOrderUnitPrice =
                  row.product_id ? latestOrderUnitPriceByProduct.get(String(row.product_id)) : undefined;
                const currentUnitPrice = Number(row.unit_price ?? 0);
                const diffPct =
                  latestOrderUnitPrice?.unitPrice && latestOrderUnitPrice.unitPrice > 0 && Number.isFinite(currentUnitPrice)
                    ? ((currentUnitPrice - latestOrderUnitPrice.unitPrice) / latestOrderUnitPrice.unitPrice) * 100
                    : null;
                return (
                  <tr key={row.id} className="border-b border-black/5 hover:bg-black/5">
                    <td className="px-3 py-3 font-semibold text-black">{row.product_code}</td>
                    <td className="px-3 py-3 text-black/80">{row.product_name ?? "-"}</td>
                    <td className="px-3 py-3 text-right">{fmtNum(row.quantity)}</td>
                    <td className="px-3 py-3 text-right">{fmtMoney(row.unit_price)}</td>
                    <td className="px-3 py-3 text-right">
                      {latestOrderUnitPrice ? (
                        <div className="space-y-1">
                          <div>
                            <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                              {fmtMoney(latestOrderUnitPrice.unitPrice)}
                            </span>
                          </div>
                          <div className="text-xs text-black/55">
                            {latestOrderUnitPrice.orderName ?? "-"}
                            {diffPct !== null ? ` | ${diffPct >= 0 ? "+" : ""}${fmtNum(diffPct)}%` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="text-black/50">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">{fmtMoney(row.line_total)}</td>
                    <td className="px-3 py-3 text-black/60">{row.notes ?? "-"}</td>
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

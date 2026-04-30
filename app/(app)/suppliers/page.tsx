import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CSSProperties } from "react";

export const metadata: Metadata = {
  title: "Tedarikçiler",
};

export default async function SuppliersPage() {
  const supabase = await createSupabaseServerClient();
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("*")
    .order("name");
  const supplierIds = (suppliers ?? []).map((s) => s.id);
  const { data: orders } = supplierIds.length
    ? await supabase
        .from("orders")
        .select("id, supplier_id, total_amount")
        .in("supplier_id", supplierIds)
    : { data: [] as any[] };
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: orderPayments } = orderIds.length
    ? await supabase
        .from("order_payments")
        .select("order_id, amount, status")
        .in("order_id", orderIds)
    : { data: [] as any[] };

  const paidByOrder = new Map<string, number>();
  (orderPayments ?? []).forEach((payment) => {
    if (payment.status !== "Odendi") return;
    const current = paidByOrder.get(payment.order_id) ?? 0;
    paidByOrder.set(payment.order_id, current + Number(payment.amount ?? 0));
  });

  const balanceBySupplier = new Map<string, number>();
  (orders ?? []).forEach((order) => {
    const total = Number(order.total_amount ?? 0) || 0;
    const paid = paidByOrder.get(order.id) ?? 0;
    const balance = total - paid; // >0 kalan odeme, <0 fazla odeme
    const supplierId = String(order.supplier_id ?? "");
    if (!supplierId) return;
    balanceBySupplier.set(supplierId, (balanceBySupplier.get(supplierId) ?? 0) + balance);
  });

  const formatMoney = (value: number) =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rowColorsFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return {
      bg: `hsl(${hue}, 80%, 96%)`,
      accent: `hsl(${hue}, 70%, 45%)`,
    };
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Tedarikçiler
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Tedarikçi listesi
        </h2>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-black/60">
          Tedarikçileri tablo üzerinden güncelleyebilir, detaya gidebilirsiniz.
        </p>
        <Link
          href="/suppliers/new"
          className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
        >
          Yeni tedarikçi
        </Link>
      </div>

      <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#ffffff,#f6f7fb)] p-6 shadow-[0_40px_80px_-50px_rgba(12,45,52,0.7)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
              Tedarikçi panosu
            </p>
            <h3 className="text-lg font-semibold">Mevcut tedarikçiler</h3>
          </div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/70 shadow-sm">
            {suppliers?.length ?? 0} kayıt
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {suppliers?.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1240px] rounded-[30px] border border-black/10 bg-[linear-gradient(130deg,#f7f7fb,#eef1f7)] p-3 shadow-inner">
                <table className="w-full border-separate border-spacing-y-4">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-[0.3em] text-black/50">
                      <th className="px-4 pt-2">Tedarikçi</th>
                      <th className="px-4 pt-2">Yetkili</th>
                      <th className="px-4 pt-2">E-posta</th>
                      <th className="px-4 pt-2">Telefon</th>
                      <th className="px-4 pt-2">Şehir</th>
                      <th className="px-4 pt-2">Ülke</th>
                      <th className="px-4 pt-2 text-right">Bakiye</th>
                      <th className="px-4 pt-2 text-right">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((supplier, index) => {
                      const rowColors = rowColorsFromId(supplier.id);
                      const balance = balanceBySupplier.get(supplier.id) ?? 0;
                      const balanceAbs = Math.abs(balance);
                      const balanceLabel =
                        balance > 0 ? "Kalan" : balance < 0 ? "Fazla" : "Bakiye";
                      const balanceClass =
                        balance > 0
                          ? "text-red-700 bg-red-50 border-red-200"
                          : balance < 0
                          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                          : "text-black/60 bg-slate-50 border-black/15";
                      return (
                        <tr
                          key={supplier.id}
                          className="group animate-[fade-up_0.35s_ease] transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/10 [&>td]:bg-[var(--row-bg)] [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-[linear-gradient(120deg,rgba(11,47,54,0.06),rgba(242,166,90,0.14))]"
                          style={
                            {
                              animationDelay: `${index * 45}ms`,
                              ["--row-bg" as string]: rowColors.bg,
                              ["--row-accent" as string]: rowColors.accent,
                            } as CSSProperties
                          }
                        >
                          <td className="px-4 py-4 text-xs font-semibold text-black/80">
                            <div className="flex items-center gap-3">
                              <span
                                className="h-9 w-1.5 rounded-full"
                                style={{ backgroundColor: "var(--row-accent)" }}
                              />
                              <span className="text-sm font-semibold">
                                {supplier.name ?? "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-4">{supplier.contact_name ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.email ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.phone ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.city ?? "-"}</td>
                          <td className="px-4 py-4">{supplier.country ?? "-"}</td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${balanceClass}`}
                            >
                              {balanceLabel}: {formatMoney(balanceAbs)} USD
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Link
                              href={`/suppliers/${supplier.id}`}
                              className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold transition group-hover:border-black/40"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz tedarikçi yok.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}




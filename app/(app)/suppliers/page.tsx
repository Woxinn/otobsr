import Link from "next/link";
import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  Users,
  WalletCards,
  TrendingUp,
  Search,
  Plus,
  ArrowRight,
  Building2,
  X,
  MapPin,
  Mail,
  Phone,
  Contact
} from "lucide-react";

export const metadata: Metadata = {
  title: "Tedarikçiler",
};

type SearchParams = {
  q?: string;
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const q = (resolvedParams.q ?? "").toLowerCase().trim();

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
  const volumeBySupplier = new Map<string, number>();

  (orders ?? []).forEach((order) => {
    const total = Number(order.total_amount ?? 0) || 0;
    const paid = paidByOrder.get(order.id) ?? 0;
    const balance = total - paid;
    const supplierId = String(order.supplier_id ?? "");
    if (!supplierId) return;

    balanceBySupplier.set(supplierId, (balanceBySupplier.get(supplierId) ?? 0) + balance);
    volumeBySupplier.set(supplierId, (volumeBySupplier.get(supplierId) ?? 0) + total);
  });

  // Calculate metrics
  let totalOutstanding = 0;
  let totalOverpaid = 0;
  balanceBySupplier.forEach((val) => {
    if (val > 0) totalOutstanding += val;
    else if (val < 0) totalOverpaid += Math.abs(val);
  });

  let topSupplierName = "-";
  let maxVolume = 0;
  volumeBySupplier.forEach((vol, id) => {
    if (vol > maxVolume) {
      maxVolume = vol;
      const s = (suppliers ?? []).find((x) => x.id === id);
      if (s) topSupplierName = s.name ?? "-";
    }
  });

  const formatMoney = (value: number) =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Filter suppliers in-memory
  const filteredSuppliers = (suppliers ?? []).filter((supplier) => {
    if (!q) return true;
    return (
      (supplier.name ?? "").toLowerCase().includes(q) ||
      (supplier.contact_name ?? "").toLowerCase().includes(q) ||
      (supplier.email ?? "").toLowerCase().includes(q) ||
      (supplier.city ?? "").toLowerCase().includes(q) ||
      (supplier.country ?? "").toLowerCase().includes(q)
    );
  });

  const stats = [
    {
      label: "Toplam Tedarikçi",
      value: String(suppliers?.length ?? 0),
      sub: "Kayıtlı aktif firma",
      icon: Users,
      tone: "default",
    },
    {
      label: "Kalan Toplam Borç",
      value: `${formatMoney(totalOutstanding)} USD`,
      sub: "Ödeme bekleyen sipariş bakiyesi",
      icon: WalletCards,
      tone: "danger",
    },
    {
      label: "Fazla Ödemeler",
      value: `${formatMoney(totalOverpaid)} USD`,
      sub: "Fazla ödenmiş sipariş bakiyesi",
      icon: WalletCards,
      tone: "success",
    },
    {
      label: "En Büyük Tedarikçi",
      value: topSupplierName,
      sub: `Hacim: ${formatMoney(maxVolume)} USD`,
      icon: TrendingUp,
      tone: "warning",
    },
  ];

  return (
    <section className="space-y-6 animate-fade-up">
      {/* Title */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/40">
            Tedarikçiler
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 [font-family:var(--font-display)]">
            Tedarikçi Listesi
          </h2>
        </div>
        <Link
          href="/suppliers/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-black px-4.5 py-2.5 text-xs font-bold text-white hover:bg-black/90 transition shadow-sm"
        >
          <Plus size={14} /> Yeni Tedarikçi
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          let cardBg = "bg-white border-black/8 shadow-2xs";
          let iconColor = "text-black/40 bg-slate-50";
          let valColor = "text-black/85";

          if (stat.tone === "danger") {
            cardBg = "bg-rose-50/40 border-rose-200/60 shadow-2xs shadow-rose-100/50";
            iconColor = "text-rose-600 bg-rose-50";
            valColor = "text-rose-950 font-bold";
          } else if (stat.tone === "success") {
            cardBg = "bg-emerald-50/40 border-emerald-200/60 shadow-2xs shadow-emerald-100/50";
            iconColor = "text-emerald-600 bg-emerald-50";
            valColor = "text-emerald-950 font-bold";
          } else if (stat.tone === "warning") {
            cardBg = "bg-amber-50/40 border-amber-200/60 shadow-2xs shadow-amber-100/50";
            iconColor = "text-amber-600 bg-amber-50";
            valColor = "text-amber-950 font-bold";
          }

          return (
            <div
              key={stat.label}
              className={`min-w-0 rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xs flex items-center gap-4.5 ${cardBg}`}
            >
              <span className={`rounded-xl p-3 border border-black/5 ${iconColor}`}>
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                  {stat.label}
                </p>
                <h4 className={`mt-1.5 truncate text-lg font-bold tracking-tight ${valColor}`}>
                  {stat.value}
                </h4>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{stat.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Panel */}
      <div className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm">
        {/* Header & Search */}
        <div className="flex flex-col gap-4 border-b border-black/5 pb-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">
              İletişim & Cari Hesap
            </p>
            <h3 className="text-lg font-semibold text-slate-800">Tedarikçi Portföyü</h3>
          </div>

          <div className="flex items-center gap-2">
            <form className="relative w-full max-w-xs" method="get">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-black/30">
                <Search size={14} />
              </span>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Tedarikçi ara..."
                className="w-full rounded-xl border border-black/10 bg-[#fbfaf6] pl-9 pr-3 py-2 text-xs outline-none focus:border-black/30 focus:bg-white transition"
              />
            </form>
            {q && (
              <Link
                href="/suppliers"
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-black/10 hover:bg-slate-50 transition text-black/50 hover:text-black"
                title="Aramayı Temizle"
              >
                <X size={14} />
              </Link>
            )}
          </div>
        </div>

        {/* Active Search Badge */}
        {q && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
            <span>Arama sonucu gösteriliyor:</span>
            <span className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-[#f7f3ea] px-2.5 py-1 text-[11px] font-bold text-black/70">
              "{q}"
              <Link href="/suppliers" className="text-black/40 hover:text-black">
                <X size={11} />
              </Link>
            </span>
          </div>
        )}

        {/* Suppliers List */}
        <div className="mt-4 text-sm">
          {filteredSuppliers.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                    <th className="pb-3 font-semibold">Tedarikçi</th>
                    <th className="pb-3 font-semibold">Yetkili</th>
                    <th className="pb-3 font-semibold">İletişim</th>
                    <th className="pb-3 font-semibold">Lokasyon</th>
                    <th className="pb-3 text-right font-semibold">Bakiye Durumu</th>
                    <th className="pb-3 text-right font-semibold">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {filteredSuppliers.map((supplier, index) => {
                    const balance = balanceBySupplier.get(supplier.id) ?? 0;
                    const balanceAbs = Math.abs(balance);

                    let balanceClass = "bg-slate-50 text-slate-600 border-slate-200/60";
                    let balanceLabel = "Bakiye Yok";

                    if (balance > 0) {
                      balanceClass = "bg-rose-50/60 text-rose-700 border-rose-200/60 font-bold";
                      balanceLabel = "Borç (Kalan)";
                    } else if (balance < 0) {
                      balanceClass = "bg-emerald-50/60 text-emerald-700 border-emerald-200/60 font-bold";
                      balanceLabel = "Alacak (Fazla)";
                    }

                    return (
                      <tr
                        key={supplier.id}
                        style={{ animationDelay: `${index * 30}ms` }}
                        className="group transition hover:bg-slate-50/50"
                      >
                        <td className="py-4 font-semibold text-slate-800">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-black/5 bg-[#fbfaf6] text-black/45 shadow-2xs group-hover:scale-105 transition-transform">
                              <Building2 size={16} />
                            </span>
                            <div>
                              <Link
                                href={`/suppliers/${supplier.id}`}
                                className="font-bold text-slate-800 hover:text-indigo-600 transition-colors"
                              >
                                {supplier.name ?? "-"}
                              </Link>
                              {supplier.tax_no && (
                                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                  VN: {supplier.tax_no}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-4 text-slate-600 font-medium">
                          {supplier.contact_name ? (
                            <div className="flex items-center gap-1.5">
                              <Contact size={13} className="text-slate-400" />
                              <span>{supplier.contact_name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-350">-</span>
                          )}
                        </td>

                        <td className="py-4 text-xs">
                          <div className="space-y-1">
                            {supplier.email && (
                              <div className="flex items-center gap-1.5 text-slate-500 font-medium hover:text-black">
                                <Mail size={12} className="text-slate-400" />
                                <a href={`mailto:${supplier.email}`}>{supplier.email}</a>
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="flex items-center gap-1.5 text-slate-500 font-medium hover:text-black">
                                <Phone size={12} className="text-slate-400" />
                                <a href={`tel:${supplier.phone}`}>{supplier.phone}</a>
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-4">
                          {supplier.city || supplier.country ? (
                            <div className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                              <MapPin size={13} className="text-slate-400" />
                              <span>
                                {supplier.city ? `${supplier.city}, ` : ""}
                                {supplier.country ?? ""}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-350">-</span>
                          )}
                        </td>

                        <td className="py-4 text-right">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs ${balanceClass}`}
                          >
                            {balanceLabel}: {formatMoney(balanceAbs)} USD
                          </span>
                        </td>

                        <td className="py-4 text-right">
                          <Link
                            href={`/suppliers/${supplier.id}`}
                            className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white px-3.5 py-1.5 text-xs font-semibold text-black/75 hover:bg-slate-50 hover:border-black/25 transition shadow-2xs"
                          >
                            Detay <ArrowRight size={13} className="text-black/40 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-center text-slate-500">
              Kayıtlı tedarikçi bulunamadı.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

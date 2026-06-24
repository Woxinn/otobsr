import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canViewFinance } from "@/lib/roles";
import { updateSupplier } from "@/app/actions/master-data";
import CountrySelect from "@/components/CountrySelect";
import SupplierStatement from "@/components/SupplierStatement";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Building2,
  Contact,
  Mail,
  Phone,
  MapPin,
  FileText,
  WalletCards,
  TrendingUp,
  Boxes,
  Compass,
  AlertTriangle,
  History,
  Tag,
  CheckCircle2,
  Calendar,
  Layers,
  ChevronDown,
  ArrowRight
} from "lucide-react";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: supplier } = await supabase
    .from("suppliers")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  const title = supplier?.name || "Tedarikçi";
  return { title: `Tedarikçi | ${title}` };
}

type SearchParams = {
  tab?: string;
};

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const activeTab = resolvedSearchParams.tab || "profil";

  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const isPriv = role === "Admin" || role === "Yonetim";
  const canSeeFinance = canViewFinance(role);

  const { data: supplier } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", resolvedParams.id)
    .single();

  if (!supplier) {
    notFound();
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, name, reference_name, payment_method, total_amount, currency, expected_ready_date, created_at, order_status")
    .eq("supplier_id", supplier.id)
    .order("created_at", { ascending: false });

  const { data: supplierRfqLinks } = await supabase
    .from("rfq_suppliers")
    .select("rfq_id, rfqs(id, code, title, status, response_due_date, created_at, currency)")
    .eq("supplier_id", supplier.id)
    .order("created_at", { ascending: false });

  const orderIds = (orders ?? []).map((o) => o.id);

  const pageSize = 1000;
  const inChunkSize = 60;
  const fetchAllByIds = async (
    table: "order_items" | "proforma_items",
    idColumn: "order_id" | "proforma_id",
    ids: string[],
    select: string
  ) => {
    if (!ids.length) return [] as any[];
    const out: any[] = [];
    for (let i = 0; i < ids.length; i += inChunkSize) {
      const idChunk = ids.slice(i, i + inChunkSize);
      for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .in(idColumn, idChunk)
          .range(from, to);
        if (error) throw error;
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < pageSize) break;
      }
    }
    return out;
  };

  const { data: orderPayments } = orderIds.length && canSeeFinance
    ? await supabase
        .from("order_payments")
        .select("id, order_id, amount, status, currency, payment_date, method, notes, created_at")
        .in("order_id", orderIds)
    : { data: [] };

  let orderItems: any[] = [];
  if (orderIds.length && isPriv) {
    try {
      orderItems = await fetchAllByIds(
        "order_items",
        "order_id",
        orderIds,
        "order_id, quantity, unit_price, total_amount, product_id, name"
      );
    } catch (err) {
      console.error("[supplier-detail] orderItems read error", err);
      orderItems = [];
    }
  }

  const { data: supplierProformas } = isPriv
    ? await supabase
        .from("proformas")
        .select("id, proforma_no, name, proforma_date, total_amount, currency, status, created_at")
        .eq("supplier_id", supplier.id)
        .neq("status", "iptal")
        .order("proforma_date", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [] };

  const proformaIds = (supplierProformas ?? []).map((p) => p.id);
  let proformaItems: any[] = [];
  if (proformaIds.length && isPriv) {
    try {
      proformaItems = await fetchAllByIds(
        "proforma_items",
        "proforma_id",
        proformaIds,
        "proforma_id, quantity, line_total"
      );
    } catch (err) {
      console.error("[supplier-detail] proformaItems read error", err);
      proformaItems = [];
    }
  }

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

  const closedStatuses = ["depoya teslim edildi"];
  const openOrders = (orders ?? []).filter(
    (o) => !closedStatuses.includes(normalizeStatus(o.order_status))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueOpen = (orders ?? []).filter((o) => {
    const status = normalizeStatus(o.order_status);
    const ready = o.expected_ready_date ? new Date(o.expected_ready_date) : null;
    if (!ready) return false;
    ready.setHours(0, 0, 0, 0);
    return ready < today && !closedStatuses.includes(status);
  });

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString("tr-TR");
  };

  const totalAmount = (orders ?? []).reduce(
    (sum, o) => sum + Number(o.total_amount ?? 0),
    0
  );
  const paidAmount = (orderPayments ?? []).reduce(
    (sum, p) => (p.status === "Odendi" ? sum + Number(p.amount ?? 0) : sum),
    0
  );
  const pendingAmount = (orderPayments ?? []).reduce(
    (sum, p) => (p.status === "Bekleniyor" ? sum + Number(p.amount ?? 0) : sum),
    0
  );
  const balanceAmount = totalAmount - paidAmount;
  const balanceAbs = Math.abs(balanceAmount);
  const balanceLabel =
    balanceAmount > 0 ? "Kalan Ödeme" : balanceAmount < 0 ? "Fazla Ödeme" : "Bakiye";

  const orderQtyTotal = orderItems.reduce(
    (sum, row) => sum + Number((row as any).quantity ?? 0),
    0
  );
  const orderAmountFromItems = orderItems.reduce((sum, row) => {
    const total = Number((row as any).total_amount ?? 0);
    if (Number.isFinite(total) && total > 0) return sum + total;
    const qty = Number((row as any).quantity ?? 0);
    const unit = Number((row as any).unit_price ?? 0);
    return sum + qty * unit;
  }, 0);
  const proformaQtyTotal = proformaItems.reduce(
    (sum, row) => sum + Number((row as any).quantity ?? 0),
    0
  );
  const proformaAmountTotal = proformaItems.reduce(
    (sum, row) => sum + Number((row as any).line_total ?? 0),
    0
  );
  const qtyDiff = orderQtyTotal - proformaQtyTotal;
  const amountDiff = orderAmountFromItems - proformaAmountTotal;
  const proformaCurrencies = Array.from(
    new Set((supplierProformas ?? []).map((p) => String(p.currency ?? "").trim()).filter(Boolean))
  );
  const summaryCurrency = proformaCurrencies.length === 1 ? proformaCurrencies[0] : "USD";
  const productIdToName = new Map<string, string>();
  const orderProductIds = Array.from(
    new Set(orderItems.map((row) => String((row as any).product_id ?? "")).filter(Boolean))
  );
  if (orderProductIds.length) {
    const productChunkSize = 200;
    for (let i = 0; i < orderProductIds.length; i += productChunkSize) {
      const idChunk = orderProductIds.slice(i, i + productChunkSize);
      const { data: products } = await supabase
        .from("products")
        .select("id, name")
        .in("id", idChunk);
      (products ?? []).forEach((p) => productIdToName.set(String(p.id), String(p.name ?? "")));
    }
  }
  const distinctProducts = Array.from(
    new Set(
      orderItems
        .map((row) => {
          const pid = String((row as any).product_id ?? "");
          const mapped = pid ? productIdToName.get(pid) : null;
          return mapped || String((row as any).name ?? "").trim() || null;
        })
        .filter(Boolean) as string[]
    )
  ).slice(0, 50);

  const avgDelayDays = (() => {
    const delays = overdueOpen
      .map((o) => {
        if (!o.expected_ready_date) return null;
        const ready = new Date(o.expected_ready_date);
        ready.setHours(0, 0, 0, 0);
        return Math.floor((today.getTime() - ready.getTime()) / (1000 * 60 * 60 * 24));
      })
      .filter((v): v is number => v !== null);
    if (!delays.length) return 0;
    return Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
  })();

  const linkedRfqs = Array.from(
    new Map(
      (supplierRfqLinks ?? [])
        .map((row: any) => row?.rfqs)
        .filter(Boolean)
        .map((rfq: any) => [String(rfq.id), rfq])
    ).values()
  );

  const statementTransactions = (() => {
    if (!isPriv || !canSeeFinance) return [];

    const list: any[] = [];

    (orders ?? []).forEach((order) => {
      const date = order.created_at || order.expected_ready_date || new Date().toISOString();
      list.push({
        id: order.id,
        date: new Date(date),
        dateStr: date,
        type: "order",
        refNo: order.name || "Sipariş",
        description: order.reference_name || "",
        debit: Number(order.total_amount ?? 0),
        credit: 0,
        currency: order.currency || "USD",
        link: `/orders/${order.id}`,
      });
    });

    (orderPayments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi") return;
      const date = payment.payment_date || payment.created_at || new Date().toISOString();
      const orderName = (orders ?? []).find(o => o.id === payment.order_id)?.name || "Sipariş";
      list.push({
        id: payment.id || Math.random().toString(),
        date: new Date(date),
        dateStr: date,
        type: "payment",
        refNo: `Ödeme (${payment.method ?? "-"})`,
        description: `${orderName} ödemesi${payment.notes ? ` - ${payment.notes}` : ""}`,
        debit: 0,
        credit: Number(payment.amount ?? 0),
        currency: payment.currency || "USD",
        link: `/orders/${payment.order_id}`,
      });
    });

    list.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = 0;
    const finalTransactions = list.map((tx) => {
      runningBalance += (tx.debit - tx.credit);
      return {
        id: tx.id,
        dateStr: tx.dateStr,
        type: tx.type,
        refNo: tx.refNo,
        description: tx.description,
        debit: tx.debit,
        credit: tx.credit,
        currency: tx.currency,
        runningBalance,
        link: tx.link,
      };
    });

    return finalTransactions;
  })();

  const formatMoney = (value: number, currency: string = "USD") =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + currency;

  const tabItems = [
    { key: "profil", label: "Firma Profili", icon: Building2 },
    { key: "finans", label: "Finans & Ekstre", icon: WalletCards },
    { key: "islemler", label: "Operasyonlar", icon: Boxes },
    { key: "performans", label: "Performans & Ürünler", icon: TrendingUp },
  ];

  return (
    <section className="space-y-6 animate-fade-up">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-black/8 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-black/45">
              <span className="rounded-lg border border-black/10 bg-[#f7f3ea] px-2.5 py-1 text-black/60">
                Tedarikçi Detay
              </span>
              {supplier.tax_no && (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700 font-mono">
                  VN: {supplier.tax_no}
                </span>
              )}
              {supplier.country && (
                <span className="rounded-lg border border-black/10 bg-white px-2.5 py-1 text-slate-700">
                  {supplier.city ? `${supplier.city}, ` : ""}{supplier.country}
                </span>
              )}
            </div>
            <h1 className="mt-3 truncate text-2xl font-bold tracking-tight text-slate-800 [font-family:var(--font-display)]">
              {supplier.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-medium">
              {supplier.contact_name && (
                <span className="flex items-center gap-1.5">
                  <Contact size={14} className="text-slate-400" /> {supplier.contact_name}
                </span>
              )}
              {supplier.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} className="text-slate-400" /> {supplier.email}
                </span>
              )}
              {supplier.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} className="text-slate-400" /> {supplier.phone}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Link
              href="/suppliers"
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-black/70 hover:bg-slate-50 hover:border-black/30 transition shadow-2xs"
            >
              <ArrowLeft size={14} className="text-black/50" /> Liste
            </Link>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 text-sm bg-slate-100/70 p-1.5 rounded-2xl border border-black/5 max-w-fit shadow-inner">
        {tabItems.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/suppliers/${supplier.id}?tab=${tab.key}`}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all duration-200 ${
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

      {/* Tab Contents */}
      {activeTab === "profil" && (
        <div className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm space-y-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">
              Firma Kayıt Kartı
            </p>
            <h3 className="text-lg font-semibold text-slate-800">Profil Bilgilerini Güncelle</h3>
          </div>

          <form action={updateSupplier} className="space-y-4 pt-2">
            <input type="hidden" name="id" value={supplier.id} />
            
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tedarikçi Adı</label>
                <input
                  name="name"
                  defaultValue={supplier.name ?? ""}
                  placeholder="Firma adı"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Yetkili Kişi</label>
                <input
                  name="contact_name"
                  defaultValue={supplier.contact_name ?? ""}
                  placeholder="Ad Soyad"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-posta Adresi</label>
                <input
                  name="email"
                  type="email"
                  defaultValue={supplier.email ?? ""}
                  placeholder="contact@company.com"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Telefon Numarası</label>
                <input
                  name="phone"
                  defaultValue={supplier.phone ?? ""}
                  placeholder="+90 5xx..."
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ülke</label>
                <CountrySelect
                  name="country"
                  defaultValue={supplier.country ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Şehir</label>
                <input
                  name="city"
                  defaultValue={supplier.city ?? ""}
                  placeholder="Şehir"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Açık Adres</label>
                <input
                  name="address"
                  defaultValue={supplier.address ?? ""}
                  placeholder="Açık adres detayları..."
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vergi Numarası / Vergi Dairesi</label>
                <input
                  name="tax_no"
                  defaultValue={supplier.tax_no ?? ""}
                  placeholder="Vergi no"
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notlar / Dahili Açıklama</label>
                <textarea
                  name="notes"
                  defaultValue={supplier.notes ?? ""}
                  placeholder="Firma hakkında ek notlar..."
                  rows={3}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-black/5 pt-4">
              <button
                type="submit"
                className="rounded-xl bg-black px-6 py-2.5 text-xs font-bold text-white hover:bg-black/90 transition shadow-sm cursor-pointer"
              >
                Bilgileri Güncelle
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "finans" && (
        <div className="space-y-6">
          {isPriv && canSeeFinance ? (
            <>
              {/* Financial KPI Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-2xs flex items-center gap-4.5">
                  <span className="rounded-xl p-3 border border-black/5 bg-slate-50 text-slate-400">
                    <FileText size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Toplam Hacim</p>
                    <h4 className="mt-1 text-base font-bold text-slate-800">
                      {formatMoney(totalAmount, "USD")}
                    </h4>
                    <p className="text-[9px] text-slate-400 font-medium">Tüm siparişlerin toplamı</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-2xs flex items-center gap-4.5">
                  <span className="rounded-xl p-3 border border-black/5 bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-800">Ödenen Tutar</p>
                    <h4 className="mt-1 text-base font-bold text-emerald-900">
                      {formatMoney(paidAmount, "USD")}
                    </h4>
                    <p className="text-[9px] text-emerald-600/70 font-medium">Onaylanmış dekont toplamı</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-2xs flex items-center gap-4.5">
                  <span className="rounded-xl p-3 border border-black/5 bg-amber-50 text-amber-600">
                    <History size={18} />
                  </span>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-800">Bekleyen Ödemeler</p>
                    <h4 className="mt-1 text-base font-bold text-amber-900">
                      {formatMoney(pendingAmount, "USD")}
                    </h4>
                    <p className="text-[9px] text-amber-600/70 font-medium">Vadesi beklenen talimatlar</p>
                  </div>
                </div>

                {/* Net Balance Card */}
                <div className={`rounded-2xl border p-4 shadow-2xs flex items-center gap-4.5 ${
                  balanceAmount > 0
                    ? "border-rose-200/60 bg-rose-50/40 shadow-rose-100/50"
                    : balanceAmount < 0
                    ? "border-violet-200/60 bg-violet-50/40 shadow-violet-100/50"
                    : "border-black/8 bg-white"
                }`}>
                  <span className={`rounded-xl p-3 border border-black/5 ${
                    balanceAmount > 0
                      ? "bg-rose-50 text-rose-600"
                      : balanceAmount < 0
                      ? "bg-violet-50 text-violet-600"
                      : "bg-slate-50 text-slate-400"
                  }`}>
                    <WalletCards size={18} />
                  </span>
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${
                      balanceAmount > 0 ? "text-rose-800" : balanceAmount < 0 ? "text-violet-800" : "text-slate-500"
                    }`}>{balanceLabel}</p>
                    <h4 className={`mt-1 text-base font-bold ${
                      balanceAmount > 0 ? "text-rose-900" : balanceAmount < 0 ? "text-violet-900" : "text-slate-800"
                    }`}>
                      {formatMoney(balanceAbs, "USD")}
                    </h4>
                    <p className="text-[9px] text-slate-400 font-medium">Güncel cari net durum</p>
                  </div>
                </div>
              </div>

              {/* Account Statement Ledger */}
              <div className="mt-4">
                <SupplierStatement transactions={statementTransactions} supplierName={supplier.name} />
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-center text-slate-500 text-sm">
              Bu sekmeyi görüntülemek için yetkiniz bulunmamaktadır.
            </div>
          )}
        </div>
      )}

      {activeTab === "islemler" && (
        <div className="space-y-6 animate-fade-up">
          {/* Proforma vs Order Difference Analysis */}
          {isPriv && (
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">Uyum Kontrolü</p>
                  <h3 className="text-lg font-semibold text-slate-800">Proforma / Sipariş Fark Analizi</h3>
                </div>
                <div className="text-xs font-semibold text-slate-500 rounded-lg bg-slate-50 border border-black/5 px-2.5 py-1">
                  Mutabakat Birimi: {summaryCurrency}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 text-sm">
                <div className="rounded-xl border border-black/6 bg-slate-50/50 p-3 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Proforma Adet</p>
                  <p className="mt-1.5 text-lg font-bold text-slate-700">{proformaQtyTotal.toLocaleString("tr-TR")}</p>
                </div>
                <div className="rounded-xl border border-black/6 bg-slate-50/50 p-3 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Sipariş Adet</p>
                  <p className="mt-1.5 text-lg font-bold text-slate-700">{orderQtyTotal.toLocaleString("tr-TR")}</p>
                </div>
                <div className={`rounded-xl border p-3 shadow-2xs ${qtyDiff < 0 ? "bg-rose-50/50 border-rose-100" : "bg-emerald-50/50 border-emerald-100"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Fark Adet</p>
                  <p className={`mt-1.5 text-lg font-bold ${qtyDiff < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {qtyDiff > 0 ? "+" : ""}{qtyDiff.toLocaleString("tr-TR")}
                  </p>
                </div>
                <div className="rounded-xl border border-black/6 bg-slate-50/50 p-3 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Proforma Tutar</p>
                  <p className="mt-1.5 text-lg font-bold text-slate-700">{formatMoney(proformaAmountTotal, summaryCurrency)}</p>
                </div>
                <div className="rounded-xl border border-black/6 bg-slate-50/50 p-3 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Sipariş Tutar</p>
                  <p className="mt-1.5 text-lg font-bold text-slate-700">{formatMoney(orderAmountFromItems, summaryCurrency)}</p>
                </div>
                <div className={`rounded-xl border p-3 shadow-2xs ${amountDiff < 0 ? "bg-rose-50/50 border-rose-100" : "bg-emerald-50/50 border-emerald-100"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-600">Fark Tutar</p>
                  <p className={`mt-1.5 text-lg font-bold ${amountDiff < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {amountDiff > 0 ? "+" : ""}{formatMoney(amountDiff, summaryCurrency)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-black/5 text-xs font-semibold">
                <Link
                  href={`/proformalar?supplier=${supplier.id}`}
                  className="text-indigo-600 hover:text-indigo-850 hover:underline inline-flex items-center gap-1"
                >
                  Proforma Evraklarını Görüntüle <ArrowRight size={12} />
                </Link>
                <Link
                  href={`/suppliers/${supplier.id}/proforma-rapor`}
                  className="rounded-xl border border-black/15 bg-white px-3 py-1.5 text-black/75 hover:bg-slate-50 transition shadow-2xs"
                >
                  Proforma Detaylı Rapor
                </Link>
              </div>
            </div>
          )}

          {/* Open Orders Section */}
          {isPriv && (
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">Lojistik Seyri</p>
                  <h3 className="text-lg font-semibold text-slate-800">Açık Siparişler</h3>
                </div>
                <span className="rounded-lg bg-indigo-50 border border-indigo-150 px-2.5 py-1 text-xs font-bold text-indigo-700">
                  {openOrders.length} Açık Kayıt
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {openOrders.length ? (
                  openOrders.slice(0, 10).map((o) => (
                    <div
                      key={o.id}
                      className="rounded-xl border border-black/6 bg-slate-50/50 p-4.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-2xs hover:bg-slate-50 transition"
                    >
                      <div>
                        <Link href={`/orders/${o.id}`} className="text-base font-bold text-slate-800 hover:text-indigo-600 transition">
                          {o.name ?? "Sipariş"}
                        </Link>
                        <p className="text-xs text-slate-400 font-medium mt-1 inline-flex items-center gap-1">
                          <Calendar size={13} className="text-slate-350" /> Hazır Olma Tarihi: {formatDate(o.expected_ready_date)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-indigo-50/60 border border-indigo-200 px-3 py-0.5 text-xs font-bold text-indigo-700">
                          {o.order_status ?? "-"}
                        </span>
                        <Link
                          href={`/orders/${o.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white border border-black/10 hover:border-black/25 text-black/60 shadow-3xs hover:bg-slate-50 transition"
                        >
                          <ArrowRight size={14} />
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-center text-slate-500">
                    Açık sipariş bulunmamaktadır.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Past Orders Grid */}
          <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-800 border-b border-black/5 pb-3">Sipariş Geçmişi</h3>
            <div className="mt-4 overflow-x-auto">
              {orders?.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.2em] text-black/40 border-b border-black/5">
                      <th className="pb-3 font-semibold">Sipariş Ref</th>
                      <th className="pb-3 font-semibold">Ödeme Şekli</th>
                      <th className="pb-3 font-semibold text-right">Tutar</th>
                      <th className="pb-3 font-semibold">Hazır Olma Tarihi</th>
                      <th className="pb-3 font-semibold">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5 text-slate-700">
                    {orders.map((order) => (
                      <tr key={order.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 font-bold text-slate-800">
                          <Link href={`/orders/${order.id}`} className="hover:text-indigo-600 transition">
                            {order.name ?? "-"}
                          </Link>
                          {order.reference_name && (
                            <p className="text-[10px] text-slate-400 font-medium font-sans mt-0.5">{order.reference_name}</p>
                          )}
                        </td>
                        <td className="py-3 font-semibold text-slate-500 uppercase text-xs">{order.payment_method ?? "-"}</td>
                        <td className="py-3 text-right font-bold text-slate-800">
                          {formatMoney(Number(order.total_amount ?? 0), order.currency ?? "USD")}
                        </td>
                        <td className="py-3 text-xs text-slate-500 font-medium">{formatDate(order.expected_ready_date)}</td>
                        <td className="py-3">
                          <span className="inline-flex rounded-full bg-slate-50 border border-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            {order.order_status ?? "-"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-center text-slate-500">
                  Kayıtlı sipariş bulunamadı.
                </div>
              )}
            </div>
          </div>

          {/* Connected RFQs and Proformas */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Connected RFQs */}
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <h3 className="text-base font-bold text-slate-800">Bağlı RFQ'lar (Teklif İstekleri)</h3>
                <span className="rounded-lg bg-slate-100 border border-black/5 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {linkedRfqs.length} adet
                </span>
              </div>
              <div className="mt-4 overflow-x-auto">
                {linkedRfqs.length ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-[0.18em] text-black/40 border-b border-black/5">
                        <th className="pb-2 font-semibold">Kod</th>
                        <th className="pb-2 font-semibold">Başlık</th>
                        <th className="pb-2 font-semibold">Durum</th>
                        <th className="pb-2 text-right font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 text-slate-700">
                      {linkedRfqs.map((rfq: any) => (
                        <tr key={rfq.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 font-bold text-slate-800">{rfq.code ?? "-"}</td>
                          <td className="py-2.5 font-medium truncate max-w-[150px]" title={rfq.title ?? undefined}>{rfq.title ?? "-"}</td>
                          <td className="py-2.5 uppercase font-semibold text-[10px] text-slate-500">{rfq.status ?? "-"}</td>
                          <td className="py-2.5 text-right">
                            <Link
                              href={`/rfqs/${rfq.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 font-semibold text-black/75 hover:bg-slate-50 transition shadow-3xs"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-6 text-center text-slate-500">
                    RFQ kaydı bulunamadı.
                  </div>
                )}
              </div>
            </div>

            {/* Connected Proformas */}
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <h3 className="text-base font-bold text-slate-800">Bağlı Proforma Faturalar</h3>
                <span className="rounded-lg bg-slate-100 border border-black/5 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {(supplierProformas ?? []).length} adet
                </span>
              </div>
              <div className="mt-4 overflow-x-auto">
                {(supplierProformas ?? []).length ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left uppercase tracking-[0.18em] text-black/40 border-b border-black/5">
                        <th className="pb-2 font-semibold">No</th>
                        <th className="pb-2 font-semibold">Başlık</th>
                        {canSeeFinance ? <th className="pb-2 text-right font-semibold">Tutar</th> : null}
                        <th className="pb-2 text-right font-semibold">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5 text-slate-700">
                      {(supplierProformas ?? []).map((proforma: any) => (
                        <tr key={proforma.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-2.5 font-bold text-slate-800">{proforma.proforma_no ?? "-"}</td>
                          <td className="py-2.5 font-medium truncate max-w-[150px]" title={proforma.name ?? undefined}>{proforma.name ?? "-"}</td>
                          {canSeeFinance ? (
                            <td className="py-2.5 text-right font-bold text-slate-800">
                              {formatMoney(Number(proforma.total_amount ?? 0), proforma.currency ?? "USD")}
                            </td>
                          ) : null}
                          <td className="py-2.5 text-right">
                            <Link
                              href={`/proformalar/${proforma.id}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-black/10 bg-white px-2.5 py-1 font-semibold text-black/75 hover:bg-slate-50 transition shadow-3xs"
                            >
                              Detay
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-6 text-center text-slate-500">
                    Proforma kaydı bulunamadı.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "performans" && (
        <div className="space-y-6 animate-fade-up">
          {/* Performance KPIs */}
          {isPriv && (
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm space-y-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">Lojistik & Teslimat</p>
                <h3 className="text-lg font-semibold text-slate-800">Performans Analizi</h3>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 text-sm">
                <div className={`rounded-xl border p-4 shadow-2xs ${overdueOpen.length > 0 ? "border-rose-200/70 bg-rose-50/45 text-rose-900 shadow-rose-50" : "border-black/6 bg-slate-50/50"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Geciken Açık Siparişler</p>
                  <p className="mt-2 text-2xl font-bold">{overdueOpen.length}</p>
                  <p className="text-[9px] text-slate-400 font-medium mt-1">Gecikmiş bekleyen sipariş adedi</p>
                </div>

                <div className={`rounded-xl border p-4 shadow-2xs ${avgDelayDays > 0 ? "border-amber-200/70 bg-amber-50/45 text-amber-900 shadow-amber-50" : "border-black/6 bg-slate-50/50"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Ortalama Gecikme Süresi</p>
                  <p className="mt-2 text-2xl font-bold">{avgDelayDays} Gün</p>
                  <p className="text-[9px] text-slate-400 font-medium mt-1">Geciken siparişlerin ortalama süresi</p>
                </div>

                <div className="rounded-xl border border-black/6 bg-slate-50/50 p-4 shadow-2xs">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">Toplam Sipariş Adedi</p>
                  <p className="mt-2 text-2xl font-bold text-slate-800">{orders?.length ?? 0}</p>
                  <p className="text-[9px] text-slate-400 font-medium mt-1">Sistemdeki toplam sipariş kaydı</p>
                </div>
              </div>
            </div>
          )}

          {/* Product Portfolio */}
          {isPriv && (
            <div className="rounded-2xl border border-black/8 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-black/5 pb-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">Ürün Tedarik</p>
                  <h3 className="text-lg font-semibold text-slate-800">Ürün Portföyü</h3>
                </div>
                <span className="rounded-lg bg-slate-100 border border-black/5 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {distinctProducts.length} Ürün Kalemi
                </span>
              </div>

              <div className="mt-4">
                {distinctProducts.length ? (
                  <div className="flex flex-wrap gap-2">
                    {distinctProducts.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-[#f7f3ea] px-3.5 py-1.5 text-xs font-bold text-slate-700 shadow-3xs hover:border-black/20 hover:bg-[#efece3] transition cursor-default"
                      >
                        <Tag size={11} className="text-black/45" /> {name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-black/10 bg-[#fbfaf6] px-4 py-8 text-center text-slate-500">
                    Kayıtlı ürün portföyü bulunamadı.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

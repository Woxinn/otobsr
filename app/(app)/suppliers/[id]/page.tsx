import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canViewFinance } from "@/lib/roles";
import { updateSupplier } from "@/app/actions/master-data";
import CountrySelect from "@/components/CountrySelect";
import type { Metadata } from "next";

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

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
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
    .select("id, name, payment_method, total_amount, currency, expected_ready_date, created_at, order_status")
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
        .select("order_id, amount, status, currency")
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
        .select("id, currency, status")
        .eq("supplier_id", supplier.id)
        .neq("status", "iptal")
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

  const closedStatuses = [
    "hazir",
    "depoya teslim edildi",
    "gumrukte",
    "varis limaninda",
    "denizde",
    "kalkis limaninda",
  ];
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
  const summaryCurrency = proformaCurrencies.length === 1 ? proformaCurrencies[0] : "KARISIK";
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

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Tedarikçi detay
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {supplier.name}
          </h2>
        </div>
        <Link
          href="/suppliers"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={updateSupplier}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={supplier.id} />
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Tedarikçi adi
            <input
              name="name"
              defaultValue={supplier.name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Yetkili kisi
            <input
              name="contact_name"
              defaultValue={supplier.contact_name ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            E-posta
            <input
              name="email"
              defaultValue={supplier.email ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Telefon
            <input
              name="phone"
              defaultValue={supplier.phone ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Ulke
            <CountrySelect
              name="country"
              defaultValue={supplier.country ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Sehir
            <input
              name="city"
              defaultValue={supplier.city ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-2">
            Adres
            <input
              name="address"
              defaultValue={supplier.address ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Vergi no
            <input
              name="tax_no"
              defaultValue={supplier.tax_no ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-3">
            Not
            <input
              name="notes"
              defaultValue={supplier.notes ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
          Güncelle
        </button>
      </form>

      {isPriv ? (
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Proforma / Sipariş özeti</h3>
            <div className="text-xs text-black/60">
              Para birimi: {summaryCurrency}
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3 lg:grid-cols-6 text-sm">
            <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Proforma adet</p>
              <p className="mt-1 text-xl font-semibold">{proformaQtyTotal.toLocaleString("tr-TR")}</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Sipariş adet</p>
              <p className="mt-1 text-xl font-semibold">{orderQtyTotal.toLocaleString("tr-TR")}</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Fark adet</p>
              <p className={`mt-1 text-xl font-semibold ${qtyDiff < 0 ? "text-red-700" : "text-black"}`}>
                {qtyDiff.toLocaleString("tr-TR")}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Proforma tutar</p>
              <p className="mt-1 text-xl font-semibold">
                {proformaAmountTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {summaryCurrency}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Sipariş tutar</p>
              <p className="mt-1 text-xl font-semibold">
                {orderAmountFromItems.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {summaryCurrency}
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Fark tutar</p>
              <p className={`mt-1 text-xl font-semibold ${amountDiff < 0 ? "text-red-700" : "text-black"}`}>
                {amountDiff.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {summaryCurrency}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/proformalar?supplier=${supplier.id}`}
                className="text-xs font-semibold text-[var(--ocean)] hover:underline"
              >
                Bu tedarikçinin proformalarını görüntüle
              </Link>
              <Link
                href={`/suppliers/${supplier.id}/proforma-rapor`}
                className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold text-black/70 hover:bg-black/5"
              >
                Detaylı rapor
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {isPriv ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Açık siparişler</h3>
              <span className="text-xs text-black/60">Toplam: {openOrders.length}</span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {openOrders.length ? (
                openOrders.slice(0, 6).map((o) => (
                  <div
                    key={o.id}
                    className="rounded-2xl border border-black/10 bg-[var(--sky)]/40 px-3 py-2 flex items-center justify-between"
                  >
                    <div>
                      <Link href={`/orders/${o.id}`} className="font-semibold text-[var(--ocean)] hover:underline">
                        {o.name ?? "Sipariş"}
                      </Link>
                      <p className="text-[11px] text-black/60">
                        Hazır: {formatDate(o.expected_ready_date)}
                      </p>
                    </div>
                    <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-black/70">
                      {o.order_status ?? "-"}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-black/10 bg-[var(--peach)] px-3 py-2 text-sm text-black/70">
                  Açık sipariş yok.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold">Geçmiş performans</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Geciken</p>
                <p className="mt-1 text-xl font-semibold">{overdueOpen.length}</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Ort. gecikme</p>
                <p className="mt-1 text-xl font-semibold">{avgDelayDays} gün</p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/60 p-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Toplam sipariş</p>
                <p className="mt-1 text-xl font-semibold">{orders?.length ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isPriv && canSeeFinance ? (
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold">Finans özeti</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Toplam</p>
              <p className="mt-1 text-xl font-semibold">
                {totalAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} USD
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Ödenen</p>
              <p className="mt-1 text-xl font-semibold">
                {paidAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} USD
              </p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/60 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Bekleyen</p>
              <p className="mt-1 text-xl font-semibold">
                {pendingAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} USD
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Geçmiş siparişler</h3>
        <div className="mt-4 space-y-3 text-sm">
          {orders?.length ? (
            <div className="overflow-hidden rounded-2xl border border-black/10">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] bg-gradient-to-r from-slate-50 to-white px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-black/45">
                <span>Sipariş</span>
                <span>Ödeme</span>
                <span>Tutar</span>
                <span>Hazır oluş</span>
              </div>
              <div className="divide-y divide-black/5">
                {orders.map((order, index) => (
                  <div
                    key={order.id}
                    style={{ animationDelay: `${index * 35}ms` }}
                    className="grid grid-cols-[2fr_1fr_1fr_1fr] items-center px-4 py-3 text-sm animate-[fade-up_0.35s_ease] bg-white hover:bg-[var(--mint)]/50 transition duration-200"
                  >
                    <Link
                      href={`/orders/${order.id}`}
                      className="font-semibold text-[var(--ocean)] hover:underline"
                    >
                      {order.name ?? "-"}
                    </Link>
                    <span className="text-black/70">{order.payment_method ?? "-"}</span>
                    <span className="text-black/80">
                      {order.total_amount ?? "-"} {order.currency ?? "USD"}
                    </span>
                    <span className="text-black/60">{formatDate(order.expected_ready_date)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Bu tedarikçi için sipariş bulunamadı.
            </div>
          )}
        </div>
      </div>

      {isPriv ? (
        <details className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer select-none list-none text-lg font-semibold">
            Ürün portföyü
            <span className="ml-2 text-xs text-black/60">(Toplam: {distinctProducts.length})</span>
          </summary>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {distinctProducts.length ? (
              distinctProducts.map((name) => (
                <span
                  key={name}
                  className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[12px] font-semibold text-black/70"
                >
                  {name}
                </span>
              ))
            ) : (
              <div className="rounded-xl border border-black/10 bg-[var(--peach)] px-3 py-2 text-sm text-black/70">
                Ürün bilgisi bulunamadı.
              </div>
            )}
          </div>
        </details>
      ) : null}
    </section>
  );
}


import Link from "next/link";
import type { CSSProperties } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole, canEdit, canViewFinance } from "@/lib/roles";
import OrdersToast from "@/components/OrdersToast";

type SearchParams = {
  q?: string;
  supplier?: string;
  payment?: string;
  incoterm?: string;
  shipmentStatus?: string;
  orderStatus?: string;
  readyFrom?: string;
  readyTo?: string;
  page?: string;
  perPage?: string;
  toast?: string;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  const canSeeFinance = canViewFinance(role);
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name")
    .order("name");

  const { data: orders } = await supabase
    .from("orders")
    .select("*, suppliers(name)")
    .order("created_at", { ascending: false });

  const { data: payments } = await supabase
    .from("order_payments")
    .select("order_id, amount, status");

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, applies_to")
    .order("name");

  const { data: orderDocuments } = await supabase
    .from("order_documents")
    .select("order_id, document_type_id, status");

  // Order -> Shipment eşleşmeleri
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: orderShipments } = orderIds.length
    ? await supabase
        .from("shipment_orders")
        .select("order_id, shipments(id, file_no, status, eta_current, warehouse_delivery_date)")
        .in("order_id", orderIds)
    : { data: [] as any[] };

  const shipmentsByOrder = new Map<
    string,
    {
      id: string;
      file_no: string | null;
      status: string | null;
      eta_current: string | null;
      warehouse_delivery_date: string | null;
    }[]
  >();
  (orderShipments ?? []).forEach((row) => {
    if (!row.order_id || !row.shipments) return;
    const list = shipmentsByOrder.get(row.order_id) ?? [];
    list.push(row.shipments);
    shipmentsByOrder.set(row.order_id, list);
  });

  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );
  const requiredOrderTypes = orderDocumentTypes.filter(
    (type) => type.is_required
  );

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
  });

  const missingOrderDocsByOrder = new Map<string, string[]>();
  (orders ?? []).forEach((order) => {
    const docs = orderDocumentsByOrder.get(order.id) ?? [];
    const missing = requiredOrderTypes
      .filter((type) => {
        const hasReceived = docs.some(
          (doc) =>
            doc.document_type_id === type.id && doc.status === "Geldi"
        );
        return !hasReceived;
      })
      .map((type) => type.name);
    missingOrderDocsByOrder.set(order.id, missing);
  });

  const paidTotals = (payments ?? []).reduce<Record<string, number>>(
    (acc, payment) => {
      if (payment.status !== "Odendi") return acc;
      acc[payment.order_id] =
        (acc[payment.order_id] ?? 0) + Number(payment.amount ?? 0);
      return acc;
    },
    {}
  );

  const query = resolvedParams.q?.toLowerCase();
  const normalizeStatus = (value: string | null | undefined) =>
    (value ?? "")
      .toLowerCase()
      .replaceAll("Ä±", "i")
      .replaceAll("ÄŸ", "g")
      .replaceAll("ÅŸ", "s")
      .replaceAll("Ã¶", "o")
      .replaceAll("Ã¼", "u")
      .replaceAll("Ã§", "c")
      .trim();
  const statusToken = (value: string | null | undefined) =>
    normalizeStatus(value).replaceAll(" ", "-");
  const perPageOptions = [10, 20, 50, 100];
  const perPageRaw = Number(resolvedParams.perPage ?? 20);
  const perPage = perPageOptions.includes(perPageRaw) ? perPageRaw : 20;
  const currentPage = Math.max(1, Number(resolvedParams.page ?? 1) || 1);
  let filtered = orders ?? [];

  if (query) {
    filtered = filtered.filter((order) => {
      const haystack = [
        order.name ?? "",
        order.notes ?? "",
        order.incoterm ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  if (resolvedParams.supplier) {
    filtered = filtered.filter(
      (order) => order.supplier_id === resolvedParams.supplier
    );
  }

  if (resolvedParams.payment) {
    filtered = filtered.filter(
      (order) => order.payment_method === resolvedParams.payment
    );
  }

  if (resolvedParams.incoterm) {
    filtered = filtered.filter((order) =>
      (order.incoterm ?? "").toLowerCase().includes(resolvedParams.incoterm!.toLowerCase())
    );
  }

  if (resolvedParams.shipmentStatus) {
    const selectedStatus = resolvedParams.shipmentStatus.toLowerCase();
    filtered = filtered.filter((order) => {
      const linkedShipments = shipmentsByOrder.get(order.id) ?? [];
      if (!linkedShipments.length) return false;

      if (selectedStatus === "geciken") {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        return linkedShipments.some((shipment) => {
          if (!shipment.eta_current || shipment.warehouse_delivery_date) return false;
          const eta = new Date(shipment.eta_current);
          eta.setHours(0, 0, 0, 0);
          return eta <= now;
        });
      }

      return linkedShipments.some(
        (shipment) => statusToken(shipment.status) === selectedStatus
      );
    });
  }

  if (resolvedParams.orderStatus) {
    const selectedStatus = resolvedParams.orderStatus.toLowerCase();
    filtered = filtered.filter(
      (order) => statusToken(order.order_status) === selectedStatus
    );
  }

  if (resolvedParams.readyFrom) {
    const from = new Date(resolvedParams.readyFrom);
    filtered = filtered.filter(
      (order) =>
        order.expected_ready_date &&
        new Date(order.expected_ready_date) >= from
    );
  }

  if (resolvedParams.readyTo) {
    const to = new Date(resolvedParams.readyTo);
    filtered = filtered.filter(
      (order) =>
        order.expected_ready_date &&
        new Date(order.expected_ready_date) <= to
    );
  }

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * perPage;
  const pageItems = filtered.slice(pageStart, pageStart + perPage);

  const returnParams = new URLSearchParams();
  Object.entries(resolvedParams).forEach(([key, value]) => {
    if (value && key !== "toast") {
      returnParams.set(key, value);
    }
  });
  const returnTo = `/orders${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  const buildPageHref = (page: number) => {
    const params = new URLSearchParams();
    Object.entries(resolvedParams).forEach(([key, value]) => {
      if (value && key !== "toast" && key !== "page") {
        params.set(key, value);
      }
    });
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    return `/orders?${params.toString()}`;
  };

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value === null || value === undefined) return "-";
    return `${value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const formatNumber = (
    value: number | null | undefined,
    maximumFractionDigits = 2
  ) => {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  };

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_8%,#eef2ff_14%,#f5f7fb_45%,#ffffff_100%)] px-3 pb-10 pt-6 md:px-6">
      <section className="space-y-8">
        <OrdersToast />

        {/* HERO */}
        <div className="relative overflow-hidden rounded-[32px] border border-white/30 bg-[linear-gradient(125deg,#2ec6ff,#4e6df6,#b25cff)] p-6 text-white shadow-[0_30px_80px_-40px_rgba(42,67,101,0.65)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_20%,rgba(255,255,255,0.28),transparent_35%),radial-gradient(circle_at_80%_12%,rgba(255,255,255,0.22),transparent_40%)]" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.32em] text-white/85">Siparisler</p>
              <h1 className="text-3xl font-semibold [font-family:var(--font-display)]">Order List</h1>
              <p className="mt-2 text-sm text-white/85">
                Siparisleri filtreleyin, izleyin veya yeni siparis olusturun.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative rounded-full bg-white/25 px-5 py-3 text-right shadow-lg backdrop-blur">
                <p className="text-[11px] uppercase tracking-[0.28em] text-white/85">Toplam</p>
                <p className="text-2xl font-bold">{orders?.length ?? 0}</p>
                <div className="absolute inset-0 rounded-full border border-white/30" />
              </div>
              {canEditPage ? (
                <Link
                  href="/orders/new"
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-black/15 transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  + New Order
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        {/* FILTERS */}
        <form className="rounded-[26px] border border-white/70 bg-white/85 p-6 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Arama ve Filtreleme</p>
              <h3 className="text-xl font-semibold text-slate-900">Filtreler</h3>
            </div>
            <div className="flex gap-2 text-sm font-semibold">
              <button className="rounded-full bg-[linear-gradient(135deg,#2ec6ff,#3f7cfb,#9b5cff)] px-5 py-2 text-white shadow-lg shadow-blue-500/25 transition hover:-translate-y-0.5 hover:shadow-xl">
                Filtrele
              </button>
              <Link
                href="/orders"
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-slate-700 transition hover:border-sky-300 hover:text-sky-600"
              >
                Temizle
              </Link>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <label className="text-sm font-semibold text-slate-800">
              Arama
              <input
                name="q"
                defaultValue={resolvedParams.q ?? ""}
                placeholder="Siparis adi, not, incoterm"
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Tedarikci
              <select
                name="supplier"
                defaultValue={resolvedParams.supplier ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              >
                <option value="">Hepsi</option>
                {suppliers?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Odeme
              <select
                name="payment"
                defaultValue={resolvedParams.payment ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              >
                <option value="">Hepsi</option>
                <option value="TT">TT</option>
                <option value="LC">LC</option>
                <option value="Diger">Diger</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Incoterm
              <input
                name="incoterm"
                defaultValue={resolvedParams.incoterm ?? ""}
                placeholder="FOB, CIF"
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Shipment durumu
              <select
                name="shipmentStatus"
                defaultValue={resolvedParams.shipmentStatus ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              >
                <option value="">Hepsi</option>
                <option value="planlandi">Planlandi</option>
                <option value="kalkis-limaninda">Kalkis Limaninda</option>
                <option value="denizde">Denizde</option>
                <option value="varis-limaninda">Varis Limaninda</option>
                <option value="gemiden-indi">Gemiden Indi</option>
                <option value="geciken">Geciken</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Siparis durumu
              <select
                name="orderStatus"
                defaultValue={resolvedParams.orderStatus ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              >
                <option value="">Hepsi</option>
                <option value="siparis-verildi">Siparis Verildi</option>
                <option value="proforma-geldi">Proforma Geldi</option>
                <option value="uretimde">Uretimde</option>
                <option value="hazir">Hazir</option>
                <option value="kalkis-limaninda">Kalkis Limaninda</option>
                <option value="denizde">Denizde</option>
                <option value="varis-limaninda">Varis Limaninda</option>
                <option value="gumrukte">Gumrukte</option>
                <option value="depoya-teslim-edildi">Depoya Teslim Edildi</option>
              </select>
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Hazir olus (baslangic)
              <input
                type="date"
                name="readyFrom"
                defaultValue={resolvedParams.readyFrom ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Hazir olus (bitis)
              <input
                type="date"
                name="readyTo"
                defaultValue={resolvedParams.readyTo ?? ""}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              />
            </label>

            <label className="text-sm font-semibold text-slate-800">
              Sayfada goster
              <select
                name="perPage"
                defaultValue={String(perPage)}
                className="mt-2 w-full rounded-[18px] border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-inner focus:border-sky-400 focus:outline-none"
              >
                {perPageOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>

        {/* TABLE */}
        <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#ffffff,#f6f7fb)] p-6 shadow-[0_40px_80px_-50px_rgba(12,45,52,0.7)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">Siparis panosu</p>
              <h3 className="text-lg font-semibold">Mevcut siparisler</h3>
            </div>
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/70 shadow-sm">
              {totalCount} kayit
            </span>
          </div>
          <div className="mt-4 space-y-3 text-sm">
            {pageItems.length ? (
              <div className="overflow-x-auto">
                <div className="min-w-[1120px] rounded-[30px] border border-black/10 bg-[linear-gradient(130deg,#f7f7fb,#eef1f7)] p-3 shadow-inner">
                  <table className="w-full border-separate border-spacing-y-4">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-[0.3em] text-black/50">
                        <th className="px-4 pt-2">Order ID</th>
                        <th className="px-4 pt-2">Siparis</th>
                        <th className="px-4 pt-2">Tarih</th>
                        <th className="px-4 pt-2">ETA</th>
                        <th className="px-4 pt-2">Shipment</th>
                        {canSeeFinance ? <th className="px-4 pt-2">Toplam</th> : null}
                        {canSeeFinance ? <th className="px-4 pt-2">Kalan</th> : null}
                        <th className="px-4 pt-2 text-right">Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageItems.map((order, index) => {
                        const paid = paidTotals[order.id] ?? 0;
                        const total = Number(order.total_amount ?? 0);
                        const remaining = Math.max(0, total - paid);
                        const missingDocs = canSeeFinance
                          ? missingOrderDocsByOrder.get(order.id) ?? []
                          : [];
                        const rowColors = rowColorsFromId(order.id);
                        const eta = (() => {
                          const list = shipmentsByOrder.get(order.id) ?? [];
                          const dates = list
                            .map((s) => s.eta_current)
                            .filter((v): v is string => Boolean(v))
                            .map((v) => new Date(v))
                            .filter((d) => !Number.isNaN(d.getTime()));
                          if (!dates.length) return null;
                          return new Date(Math.min(...dates.map((d) => d.getTime())));
                        })();
                        return (
                          <tr
                            key={order.id}
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
                                <div>
                                  <p className="text-[10px] uppercase tracking-[0.25em] text-black/40">Order</p>
                                  <p className="text-sm font-semibold">#{order.id.slice(0, 6).toUpperCase()}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm font-semibold text-black">{order.name ?? "-"}</div>
                              <div className="mt-1 text-xs text-black/55">
                                {formatNumber(order.packages, 0)} adet | {formatNumber(order.weight_kg, 2)} kg
                                {role === "Satis" ? "" : ` | ${order.incoterm ?? "-"}`}
                              </div>
                              <div className="mt-1 text-xs text-black/50">{order.notes ?? "-"}</div>
                              {missingDocs.length && role !== "Satis" ? (
                                <div className="group/tooltip mt-2 inline-flex flex-col items-start gap-2">
                                  <span className="rounded-full border border-red-200/70 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700/80">
                                    {missingDocs.length} eksik evrak
                                  </span>
                                  <div className="max-h-0 w-[220px] overflow-hidden rounded-2xl border border-black/10 bg-white px-3 py-2 text-[10px] text-black/70 shadow-[0_18px_32px_-20px_rgba(12,45,52,0.55)] opacity-0 transition-all duration-200 group-hover/tooltip:max-h-[1000px] group-hover/tooltip:opacity-100">
                                    <div className="text-[9px] font-semibold text-black/60">Eksik belgeler</div>
                                    <div className="mt-1 space-y-0.5">
                                      {missingDocs.map((doc) => (
                                        <div key={doc}>{doc}</div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-sm text-black/70">{order.expected_ready_date ?? "-"}</td>
                            <td className="px-4 py-4 text-sm text-black/70">
                              {eta ? eta.toISOString().slice(0, 10) : "-"}
                            </td>
                            <td className="px-4 py-4 text-sm text-black/70">
                              {(shipmentsByOrder.get(order.id) ?? []).length ? (
                                <div className="flex flex-wrap gap-2">
                                  {(shipmentsByOrder.get(order.id) ?? []).map((s) => (
                                    <span
                                      key={s.id}
                                      className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-[#1f3c88] shadow-sm"
                                    >
                                      {s.file_no ?? s.id.slice(0, 6).toUpperCase()}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-black/40">-</span>
                              )}
                            </td>
                            {canSeeFinance ? (
                              <td className="px-4 py-4 text-sm font-semibold text-black">
                                <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/75">
                                  {formatMoney(total, order.currency)}
                                </span>
                              </td>
                            ) : null}
                            {canSeeFinance ? (
                              <td className="px-4 py-4 font-semibold text-black">
                                <span className="rounded-full border border-black/10 bg-[#edf3ff] px-3 py-1 text-xs font-semibold text-[#2b4f9e]">
                                  {formatMoney(remaining, order.currency)}
                                </span>
                              </td>
                            ) : null}
                            <td className="px-4 py-4 text-right">
                              <Link
                                href={`/orders/${order.id}`}
                                className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold text-black/70 transition group-hover:border-black/40"
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
                Henuz siparis yok.
              </div>
            )}
          </div>
          {totalPages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs font-semibold text-black/70">
              {Array.from({ length: totalPages }).map((_, idx) => {
                const page = idx + 1;
                const isActive = page === safePage;
                return (
                  <Link
                    key={page}
                    href={buildPageHref(page)}
                    className={`rounded-full px-3 py-1.5 ${
                      isActive
                        ? "bg-black text-white"
                        : "border border-black/20 bg-white text-black/70 hover:border-black/40"
                    }`}
                  >
                    {page}
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

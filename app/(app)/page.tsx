import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { getCurrentUserRole, canViewFinance } from "@/lib/roles";

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { monday, sunday };
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const isSales = role === "Satis";
  if (isSales) {
    return (
      <meta httpEquiv="refresh" content="0; url=/products" />
    );
  }
  const canSeeFinance = canViewFinance(role);
  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, is_critical, applies_to");

  const shipmentDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "shipment" || !type.applies_to
  );
  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );
  const requiredOrderTypes = orderDocumentTypes.filter(
    (type) => type.is_required
  );

  const { data: shipments } = await supabase
    .from("shipments")
    .select(
      "id, file_no, status, eta_current, atd_actual, warehouse_delivery_date, archived_at"
    )
    .is("archived_at", null);

  const { data: orders } = await supabase
    .from("orders")
    .select("id, name, expected_ready_date, order_status, total_amount, currency, suppliers(name)")
    .order("created_at", { ascending: false });

  const { data: orderPayments } = canSeeFinance
    ? await supabase
        .from("order_payments")
        .select("order_id, amount, status, payment_date, currency")
    : { data: [] };

  const shipmentIds = shipments?.map((item) => item.id) ?? [];
  const { data: documents } = shipmentIds.length
    ? await supabase
        .from("documents")
        .select("shipment_id, document_type_id, status")
        .in("shipment_id", shipmentIds)
    : { data: [] };

  const { data: shipmentOrders } = shipmentIds.length
    ? await supabase
        .from("shipment_orders")
        .select("shipment_id, orders(id)")
        .in("shipment_id", shipmentIds)
    : { data: [] };

  const orderIds = shipmentOrders
    ?.flatMap((row) => {
      const orderList = row.orders
        ? Array.isArray(row.orders)
          ? row.orders
          : [row.orders]
        : [];
      return orderList.map((order) => order.id);
    })
    .filter(Boolean);

  const allOrderIds = orders?.map((order) => order.id) ?? [];
  const { data: orderDocuments } = allOrderIds.length
    ? await supabase
        .from("order_documents")
        .select("order_id, document_type_id, status")
        .in("order_id", allOrderIds)
    : { data: [] };

  const documentsByShipment = new Map<string, typeof documents>();
  documents?.forEach((doc) => {
    if (!doc.shipment_id) return;
    const list = documentsByShipment.get(doc.shipment_id) ?? [];
    list.push(doc);
    documentsByShipment.set(doc.shipment_id, list);
  });

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
  });

  const orderMissingByShipment = new Map<string, number>();
  shipmentOrders?.forEach((row) => {
    const orderList = row.orders
      ? Array.isArray(row.orders)
        ? row.orders
        : [row.orders]
      : [];
    let missingCount = 0;
    orderList.forEach((order) => {
      const docs = orderDocumentsByOrder.get(order.id) ?? [];
      const missing = requiredOrderTypes.filter((type) => {
        const hasReceived = docs.some(
          (doc) =>
            doc.document_type_id === type.id && doc.status === "Geldi"
        );
        return !hasReceived;
      });
      missingCount += missing.length;
    });
    orderMissingByShipment.set(
      row.shipment_id,
      (orderMissingByShipment.get(row.shipment_id) ?? 0) + missingCount
    );
  });

  const flags = shipments?.map((shipment) => {
    const shipmentDocs = documentsByShipment.get(shipment.id) ?? [];
    return {
      shipment,
      flags: getShipmentFlags(
        {
          eta_current: shipment.eta_current,
          warehouse_delivery_date: shipment.warehouse_delivery_date,
        },
        shipmentDocs,
        shipmentDocumentTypes
      ),
      orderMissingCount: orderMissingByShipment.get(shipment.id) ?? 0,
    };
  });

  const totalOpen = shipments?.length ?? 0;
  const delayed = flags?.filter((item) => item.flags.overdue).length ?? 0;
  const problematicDocs = flags?.filter((item) => item.flags.hasProblematic).length ?? 0;

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

  const shipmentStatusCounts = (shipments ?? []).reduce(
    (acc, shipment) => {
      const status = normalizeStatus(shipment.status);
      if (status === "planlandi") acc.planlandi += 1;
      if (status === "kalkis limaninda") acc.kalkisLimaninda += 1;
      if (status === "denizde") acc.denizde += 1;
      if (status === "varis limaninda") acc.varisLimaninda += 1;
      if (status === "gemiden indi") acc.gemidenIndi += 1;
      return acc;
    },
    {
      planlandi: 0,
      kalkisLimaninda: 0,
      denizde: 0,
      varisLimaninda: 0,
      gemidenIndi: 0,
    }
  );
  const orderStatusCounts = (orders ?? []).reduce(
    (acc, order) => {
      const status = normalizeStatus(order.order_status);
      if (status === "siparis verildi") acc.siparisVerildi += 1;
      if (status === "proforma geldi") acc.proformaGeldi += 1;
      if (status === "uretimde") acc.uretimde += 1;
      if (status === "hazir") acc.hazir += 1;
      if (status === "kalkis limaninda") acc.kalkisLimaninda += 1;
      if (status === "denizde") acc.denizde += 1;
      if (status === "varis limaninda") acc.varisLimaninda += 1;
      if (status === "gumrukte") acc.gumrukte += 1;
      if (status === "depoya teslim edildi") acc.depoTeslim += 1;
      return acc;
    },
    {
      siparisVerildi: 0,
      proformaGeldi: 0,
      uretimde: 0,
      hazir: 0,
      kalkisLimaninda: 0,
      denizde: 0,
      varisLimaninda: 0,
      gumrukte: 0,
      depoTeslim: 0,
    }
  );
  const liveStatusStrip = [
    {
      label: "Planlandi",
      value: shipmentStatusCounts.planlandi,
      tone: "from-slate-500/20 to-slate-200/50",
      filter: "planlandi",
    },
    {
      label: "Kalkis Limaninda",
      value: shipmentStatusCounts.kalkisLimaninda,
      tone: "from-amber-500/20 to-amber-200/50",
      filter: "kalkis-limaninda",
    },
    {
      label: "Denizde",
      value: shipmentStatusCounts.denizde,
      tone: "from-sky-600/20 to-sky-200/50",
      filter: "denizde",
    },
    {
      label: "Varis Limaninda",
      value: shipmentStatusCounts.varisLimaninda,
      tone: "from-indigo-600/20 to-indigo-200/50",
      filter: "varis-limaninda",
    },
    {
      label: "Gemiden Indi",
      value: shipmentStatusCounts.gemidenIndi,
      tone: "from-emerald-600/20 to-emerald-200/50",
      filter: "gemiden-indi",
    },
    {
      label: "Geciken",
      value: delayed,
      tone: "from-rose-600/20 to-rose-200/50",
      filter: "geciken",
    },
  ];
  const orderLiveStatusStrip = [
    {
      label: "Siparis Verildi",
      value: orderStatusCounts.siparisVerildi,
      tone: "from-slate-500/20 to-slate-200/50",
      filter: "siparis-verildi",
    },
    {
      label: "Proforma Geldi",
      value: orderStatusCounts.proformaGeldi,
      tone: "from-amber-500/20 to-amber-200/50",
      filter: "proforma-geldi",
    },
    {
      label: "Uretimde",
      value: orderStatusCounts.uretimde,
      tone: "from-rose-500/20 to-rose-200/50",
      filter: "uretimde",
    },
    {
      label: "Hazir",
      value: orderStatusCounts.hazir,
      tone: "from-emerald-600/20 to-emerald-200/50",
      filter: "hazir",
    },
    {
      label: "Kalkis Limaninda",
      value: orderStatusCounts.kalkisLimaninda,
      tone: "from-sky-600/20 to-sky-200/50",
      filter: "kalkis-limaninda",
    },
    {
      label: "Denizde",
      value: orderStatusCounts.denizde,
      tone: "from-indigo-600/20 to-indigo-200/50",
      filter: "denizde",
    },
    {
      label: "Varis Limaninda",
      value: orderStatusCounts.varisLimaninda,
      tone: "from-violet-600/20 to-violet-200/50",
      filter: "varis-limaninda",
    },
    {
      label: "Gumrukte",
      value: orderStatusCounts.gumrukte,
      tone: "from-orange-600/20 to-orange-200/50",
      filter: "gumrukte",
    },
    {
      label: "Depoya Teslim",
      value: orderStatusCounts.depoTeslim,
      tone: "from-emerald-700/20 to-emerald-200/50",
      filter: "depoya-teslim-edildi",
    },
  ];

  const { monday, sunday } = getWeekRange();
  const etaThisWeek =
    shipments?.filter((item) => {
      if (!item.eta_current) return false;
      const eta = new Date(item.eta_current);
      return eta >= monday && eta <= sunday;
    }).length ?? 0;

  const orderMissingByOrder = new Map<string, string[]>();
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
    orderMissingByOrder.set(order.id, missing);
  });

  const allOrdersWithMissing = (orders ?? [])
    .map((order) => ({
      order,
      missing: orderMissingByOrder.get(order.id) ?? [],
    }))
    .filter((item) => item.missing.length > 0)
    .sort((a, b) => {
      const aDate = a.order.expected_ready_date
        ? new Date(a.order.expected_ready_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      const bDate = b.order.expected_ready_date
        ? new Date(b.order.expected_ready_date).getTime()
        : Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    });
  const ordersWithMissing = allOrdersWithMissing;
  const missingDocs = allOrdersWithMissing.length;
  const nowMonth = new Date();
  const monthStart = new Date(nowMonth.getFullYear(), nowMonth.getMonth(), 1);
  const monthEnd = new Date(nowMonth.getFullYear(), nowMonth.getMonth() + 1, 0);
  monthStart.setHours(0, 0, 0, 0);
  monthEnd.setHours(23, 59, 59, 999);

  const paymentAmount = (value: unknown) => Number(value ?? 0) || 0;
  const paidByOrder = new Map<string, number>();
  if (canSeeFinance) {
    (orderPayments ?? []).forEach((payment) => {
      if (payment.status !== "Odendi") return;
      const current = paidByOrder.get(payment.order_id) ?? 0;
      paidByOrder.set(payment.order_id, current + paymentAmount(payment.amount));
    });
  }

  const monthlyPaid = canSeeFinance
    ? (orderPayments ?? []).reduce((acc, payment) => {
        if (payment.status !== "Odendi" || !payment.payment_date) return acc;
        const paymentDate = new Date(payment.payment_date);
        if (paymentDate < monthStart || paymentDate > monthEnd) return acc;
        return acc + paymentAmount(payment.amount);
      }, 0)
    : 0;

  const pendingPayments = canSeeFinance
    ? (orderPayments ?? []).reduce((acc, payment) => {
        if (payment.status !== "Bekleniyor") return acc;
        return acc + paymentAmount(payment.amount);
      }, 0)
    : 0;

  const remainingPayments = (orders ?? []).reduce((acc, order) => {
    const total = Number(order.total_amount ?? 0) || 0;
    const paid = paidByOrder.get(order.id) ?? 0;
    return acc + Math.max(0, total - paid);
  }, 0);

  const formatMoney = (value: number) =>
    value.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const normalize = (d: string | null | undefined) => {
    if (!d) return null;
    const dt = new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
  };
  const producedStatuses = ["hazir"];
  const missingReadyOrders = (orders ?? []).filter(
    (order) => !order.expected_ready_date
  );
  const producedOrders = (orders ?? []).filter((order) =>
    producedStatuses.includes((order.order_status ?? "").toLowerCase())
  );
  const inProductionOrders = (orders ?? []).filter((order) => {
    if (!order.expected_ready_date) return false;
    if (
      producedStatuses.includes((order.order_status ?? "").toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const withCountdown = inProductionOrders.map((order) => {
    const ready = normalize(order.expected_ready_date);
    const diffDays =
      ready !== null
        ? Math.round((ready.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
    return { order, diffDays };
  });

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Dashboard
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Genel gorunum ve risk merkezi
        </h2>
      </div>

      {/* Uretim odakli kartlar - tek satir */}
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)]/50 p-4">
              <p className="text-xs uppercase tracking-widest text-black/50">
                Hazir tarihi girilmemis
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {missingReadyOrders.length}
              </p>
              <div className="mt-3 space-y-1 text-xs text-black/70 max-h-40 overflow-y-auto">
                {missingReadyOrders.slice(0, 6).map((o) => (
                  <div key={o.id} className="rounded-xl bg-white/70 px-3 py-2">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-semibold text-black hover:underline"
                    >
                      {o.name ?? "Siparis"}
                    </Link>
                    {!isSales ? (
                      <p className="text-[11px] text-black/60">
                        {(Array.isArray((o as any).suppliers)
                          ? (o as any).suppliers[0]?.name
                          : (o as any).suppliers?.name) ?? "Tedarikci yok"}
                      </p>
                    ) : null}
                  </div>
                ))}
                {missingReadyOrders.length === 0 ? (
                  <div className="rounded-xl bg-white/70 px-3 py-2 text-[11px] text-black/60">
                    Hepsi girilmis.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-4">
              <p className="text-xs uppercase tracking-widest text-black/50">
                Uretimde (tarih girildi)
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {inProductionOrders.length}
              </p>
              <div className="mt-3 space-y-1 text-xs text-black/70 max-h-40 overflow-y-auto">
                {withCountdown
                  .sort((a, b) => (a.diffDays ?? 999) - (b.diffDays ?? 999))
                  .slice(0, 6)
                  .map(({ order, diffDays }) => (
                    <div key={order.id} className="rounded-xl bg-white/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-semibold text-black hover:underline"
                        >
                          {order.name ?? "Siparis"}
                        </Link>
                        <span className="text-[11px] text-black/60">
                          {diffDays === null
                            ? "-"
                            : diffDays > 0
                              ? `${diffDays} gun`
                              : diffDays === 0
                                ? "Bugun"
                                : `${Math.abs(diffDays)} gun gecikti`}
                        </span>
                      </div>
                    <p className="text-[11px] text-black/60">
                      {order.expected_ready_date ?? "-"}
                      {!isSales
                        ? ` | ${
                            (Array.isArray((order as any).suppliers)
                              ? (order as any).suppliers[0]?.name
                              : (order as any).suppliers?.name) ?? "Tedarikci yok"
                          }`
                        : ""}
                    </p>
                    </div>
                  ))}
                {inProductionOrders.length === 0 ? (
                  <div className="rounded-xl bg-white/70 px-3 py-2 text-[11px] text-black/60">
                    Liste bos.
                  </div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-black/10 bg-[var(--sky)]/60 p-4">
              <p className="text-xs uppercase tracking-widest text-black/50">
                Uretim tamamlanmis
              </p>
              <p className="mt-2 text-2xl font-semibold">
                {producedOrders.length}
              </p>
              <div className="mt-3 space-y-1 text-xs text-black/70 max-h-40 overflow-y-auto">
                {producedOrders.slice(0, 6).map((o) => (
                  <div key={o.id} className="rounded-xl bg-white/70 px-3 py-2">
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-semibold text-black hover:underline"
                    >
                      {o.name ?? "Siparis"}
                    </Link>
                    <p className="text-[11px] text-black/60">
                      {o.expected_ready_date ?? "-"}
                      {!isSales
                        ? ` | ${
                            (Array.isArray((o as any).suppliers)
                              ? (o as any).suppliers[0]?.name
                              : (o as any).suppliers?.name) ?? "Tedarikci yok"
                          }`
                        : ""}
                    </p>
                  </div>
                ))}
                {producedOrders.length === 0 ? (
                  <div className="rounded-xl bg-white/70 px-3 py-2 text-[11px] text-black/60">
                    Hicbiri tamamlanmamis.
                  </div>
                ) : null}
              </div>
            </div>
        </div>
      </div>

      {!isSales ? (
        <div className="rounded-3xl border border-black/10 bg-white/95 p-4 shadow-sm animate-[fade-up_700ms_ease-out]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.28em] text-black/45">
              Canli Durum Seridi - Shipment
            </p>
            <span className="rounded-full border border-black/15 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
              Toplam shipment: {totalOpen}
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
            {liveStatusStrip.map((item, idx) => (
              <Link
                key={item.label}
                href={`/orders?shipmentStatus=${item.filter}`}
                className={`rounded-2xl border border-black/10 bg-gradient-to-br ${item.tone} p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-md`}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/75">
                    {item.label}
                  </p>
                  <p className="text-xl font-bold text-black">{item.value}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-black/10 bg-white/95 p-4 shadow-sm animate-[fade-up_700ms_ease-out]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.28em] text-black/45">
            Canli Durum Seridi - Siparis
          </p>
          <span className="rounded-full border border-black/15 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
            Toplam siparis: {orders?.length ?? 0}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {orderLiveStatusStrip.map((item, idx) => (
            <Link
              key={item.label}
              href={`/orders?orderStatus=${item.filter}`}
              className={`rounded-2xl border border-black/10 bg-gradient-to-br ${item.tone} p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-md`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-black/75">
                  {item.label}
                </p>
                <p className="text-xl font-bold text-black">{item.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {!isSales ? (
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Toplam acik shipment", value: totalOpen },
                { label: "Bu hafta ETA", value: etaThisWeek },
                { label: "Evrak eksik", value: missingDocs },
                { label: "Evrak sorunlu", value: problematicDocs },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-black/10 bg-[var(--sky)] p-4"
                >
                  <p className="text-xs uppercase tracking-widest text-black/50">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
            {canSeeFinance ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Bu ay yapilan odeme",
                    value: `${formatMoney(monthlyPaid)} USD`,
                    tone: "bg-emerald-50",
                  },
                  {
                    label: "Bekleyen odeme",
                    value: `${formatMoney(pendingPayments)} USD`,
                    tone: "bg-amber-50",
                  },
                  {
                    label: "Kalan odeme",
                    value: `${formatMoney(remainingPayments)} USD`,
                    tone: "bg-rose-50",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-2xl border border-black/10 ${item.tone} p-4`}
                  >
                    <p className="text-xs uppercase tracking-widest text-black/50">
                      {item.label}
                    </p>
                    <p className="mt-3 text-xl font-semibold">{item.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { label: "Toplam siparis", value: orders?.length ?? 0 },
                { label: "Eksik evrakli siparis", value: missingDocs },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-black/10 bg-[var(--mint)]/60 p-4"
                >
                  <p className="text-xs uppercase tracking-widest text-black/50">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold">Operasyon Notlari</p>
          <div className="mt-4 rounded-2xl border border-rose-200/60 bg-gradient-to-br from-rose-50 to-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                <p className="text-sm font-semibold text-black">Eksik evrakli siparisler</p>
                <span className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                  {ordersWithMissing.length}
                </span>
              </div>
              <Link
                href="/orders"
                className="text-xs font-semibold text-[var(--ocean)] hover:underline"
              >
                Tum siparisler
              </Link>
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-xs text-black/70">
              {ordersWithMissing.length ? (
                ordersWithMissing.map((item) => (
                  <div
                    key={item.order.id}
                    className="rounded-xl border border-rose-200/70 bg-white px-3 py-3 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/orders/${item.order.id}`}
                        className="font-semibold text-black hover:text-[var(--ocean)] hover:underline"
                      >
                        {item.order.name ?? "Siparis"}
                      </Link>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                          {item.missing.length} eksik
                        </span>
                        <span className="text-[10px] text-black/55">
                          {item.order.expected_ready_date ?? "-"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.missing.slice(0, 3).map((name) => (
                        <span
                          key={`${item.order.id}-${name}`}
                          className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700"
                        >
                          {name}
                        </span>
                      ))}
                      {item.missing.length > 3 ? (
                        <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 text-[10px] font-semibold text-black/70">
                          +{item.missing.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-[11px] text-black/60">
                  Eksik evraki olan siparis bulunamadi.
                </div>
              )}
            </div>
          </div>
          <div className="mt-6">
            <Link
              href="/shipments"
              className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
            >
              Shipments listesine git
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}



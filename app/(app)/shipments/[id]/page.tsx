import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { getCurrentUserRole, canEdit } from "@/lib/roles";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import { selectForwarderQuote, updateForwarderQuote, deleteForwarderQuote, createForwarderQuoteForShipment } from "@/app/actions/forwarder-quotes";
import { deleteShipment } from "@/app/actions/shipments";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: shipment } = await supabase
    .from("shipments")
    .select("name, code")
    .eq("id", id)
    .maybeSingle();
  const title = shipment?.name || shipment?.code || "Shipment";
  return { title: `Shipment | ${title}` };
}
import AlertSummaryCard from "@/components/AlertSummaryCard";

export default async function ShipmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  if (role === "Satis") {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/70 shadow-sm">
        Bu modulu goruntuleme yetkiniz yok.
      </section>
    );
  }
  const { data: shipment } = await supabase
    .from("shipments")
    .select(
      "*, forwarders(id, name), origin_port:ports!origin_port_id(id, name), destination_port:ports!destination_port_id(id, name)"
    )
    .eq("id", resolvedParams.id)
    .single();

  if (!shipment) {
    notFound();
  }

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("id, name, is_required, is_critical, applies_to")
    .order("name");

  const shipmentDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "shipment" || !type.applies_to
  );
  const orderDocumentTypes = (documentTypes ?? []).filter(
    (type) => type.applies_to === "order"
  );
  const requiredOrderTypes = orderDocumentTypes.filter(
    (type) => type.is_required
  );
  const requiredShipmentTypes = shipmentDocumentTypes.filter(
    (type) => type.is_required
  );

  const { data: documents } = await supabase
    .from("documents")
    .select("*, document_types(name)")
    .eq("shipment_id", shipment.id)
    .order("uploaded_at", { ascending: false });

  const { data: forwarderQuotes } = await supabase
    .from("forwarder_quotes")
    .select(
      "id, amount, currency, container_size, free_time_days, route_option, transit_days, valid_until, notes, is_selected, forwarder_id, forwarders(name)"
    )
    .eq("shipment_id", shipment.id)
    .order("created_at", { ascending: false });

  const { data: forwarders } = await supabase
    .from("forwarders")
    .select("id, name")
    .order("name");

  const forwarderById = new Map(
    (forwarders ?? []).map((item) => [item.id, item.name ?? "-"])
  );

  const { data: shipmentOrders } = await supabase
    .from("shipment_orders")
    .select("order_id, orders(id, name, packages, weight_kg, total_amount, currency)")
    .eq("shipment_id", shipment.id);

  const orderIds = shipmentOrders
    ?.map((item) => item.order_id)
    .filter(Boolean);
  const { data: orderDocuments } = orderIds?.length
    ? await supabase
        .from("order_documents")
        .select("order_id, document_type_id, status")
        .in("order_id", orderIds)
    : { data: [] };

  const { data: etaHistory } = await supabase
    .from("eta_history")
    .select("*")
    .eq("shipment_id", shipment.id)
    .order("changed_at", { ascending: false });

  const flags = getShipmentFlags(
    {
      eta_current: shipment.eta_current,
      warehouse_delivery_date: shipment.warehouse_delivery_date,
    },
    documents ?? [],
    shipmentDocumentTypes
  );

  let suggestedStatus = shipment.status ?? "Planlandi";
  if (shipment.ata_actual) {
    suggestedStatus = "Varış Limanında";
  } else if (shipment.atd_actual) {
    suggestedStatus = "Denizde";
  } else if (shipment.etd_planned) {
    suggestedStatus = "Kalkış Limanında";
  }

  const selectedOrders =
    shipmentOrders?.flatMap((item) => item.orders ?? []) ?? [];
  const totalOrders = selectedOrders.reduce(
    (acc, item) => {
      acc.packages += Number(item.packages ?? 0);
      acc.weight += Number(item.weight_kg ?? 0);
      acc.amount += Number(item.total_amount ?? 0);
      return acc;
    },
    { packages: 0, weight: 0, amount: 0 }
  );

  const cheapestAmount =
    forwarderQuotes?.reduce<number | null>((min, quote) => {
      const value = Number(quote.amount ?? 0);
      if (!Number.isFinite(value) || value <= 0) return min;
      if (min === null) return value;
      return value < min ? value : min;
    }, null) ?? null;

  const colorFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 92%)`;
  };

  const documentStatusByType = new Map<
    string,
    { received: boolean; problem: boolean; date?: string | null }
  >();

  documents?.forEach((doc) => {
    if (!doc.document_type_id) return;
    const current =
      documentStatusByType.get(doc.document_type_id) ?? {
        received: false,
        problem: false,
        date: null,
      };
    const received = current.received || doc.status === "Geldi";
    const problem = current.problem || doc.status === "Sorunlu";
    const date = current.date ?? doc.received_at ?? null;
    documentStatusByType.set(doc.document_type_id, {
      received,
      problem,
      date,
    });
  });

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
  });

  const missingShipmentTypes = requiredShipmentTypes.filter((type) => {
    const hasReceived = documents?.some(
      (doc) => doc.document_type_id === type.id && doc.status === "Geldi"
    );
    return !hasReceived;
  });

  const missingOrderTypesByOrder = new Map<string, string[]>();
  selectedOrders.forEach((order) => {
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
    missingOrderTypesByOrder.set(order.id, missing);
  });

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

  const formatMoney = (
    value: number | null | undefined,
    currency: string | null | undefined
  ) => {
    if (value === null || value === undefined) return "-";
    return `${Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString("tr-TR");
  };

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">
              Shipment detay
            </p>
            <h2 className="text-3xl font-semibold [font-family:var(--font-display)]">
              {shipment.file_no}
            </h2>
            <p className="mt-2 text-sm text-black/60">
              Konşimento No: {shipment.reference ?? "-"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-xs font-semibold">
              Durum: {shipment.status ?? "Planlandi"}
            </span>
            <span className="rounded-full border border-black/10 bg-[var(--sky)] px-3 py-1 text-xs font-semibold">
              Risk: {flags.risk}
            </span>
            <span className="rounded-full border border-black/10 bg-[var(--peach)] px-3 py-1 text-xs font-semibold">
              Evrak eksik: {flags.missingRequiredCount}
            </span>
            {canEditPage ? (
              <ConfirmActionForm
                action={deleteShipment}
                confirmText="Bu shipment silinsin mi? Bu islem geri alinamaz."
                buttonText="Shipment sil"
              >
                <input type="hidden" name="shipment_id" value={shipment.id} />
              </ConfirmActionForm>
            ) : null}
            {canEditPage ? (
              <Link
                href={`/shipments/${shipment.id}/edit`}
                className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
              >
                Düzenle
              </Link>
            ) : null}
            <Link
              href="/shipments"
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            >
              Listeye don
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {[
            { label: "ETA", value: formatDate(shipment.eta_current) },
            { label: "ATD", value: formatDate(shipment.atd_actual) },
            { label: "ATA", value: formatDate(shipment.ata_actual) },
            { label: "Depo teslim", value: formatDate(shipment.warehouse_delivery_date) },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-black/10 bg-[var(--mint)] px-4 py-3 text-sm"
            >
              <p className="text-xs uppercase tracking-widest text-black/50">
                {item.label}
              </p>
              <p className="mt-2 text-lg font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-black/60">
          <span>
            Konteyner: {shipment.container_no ?? "-"} | Seal: {shipment.seal_no ?? "-"}
          </span>
          <span>Tip: {shipment.container_type ?? "-"}</span>
          <span>Çıkış: {shipment.origin_port?.name ?? "-"}</span>
          <span>Varış: {shipment.destination_port?.name ?? "-"}</span>
        </div>
      </div>

      {resolvedSearchParams.error === "bl-required" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          BL gelmeden Gumrukte durumuna gecilemez.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Genel bilgiler</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2 text-sm">
            {[
              { label: "Forwarder", value: shipment.forwarders?.name ?? "-" },
              { label: "Çıkış limanı", value: shipment.origin_port?.name ?? "-" },
              { label: "Varış limanı", value: shipment.destination_port?.name ?? "-" },
              { label: "ETD (plan)", value: formatDate(shipment.etd_planned) },
              { label: "ATD (gercek)", value: formatDate(shipment.atd_actual) },
              { label: "ETA (guncel)", value: formatDate(shipment.eta_current) },
              { label: "ATA (gercek)", value: formatDate(shipment.ata_actual) },
              { label: "Gümrük giriş", value: formatDate(shipment.customs_entry_date) },
              { label: "Depo teslim", value: formatDate(shipment.warehouse_delivery_date) },
              { label: "Etiketler", value: shipment.tags?.join(", ") ?? "-" },
              { label: "Not", value: shipment.notes ?? "-" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-black/10 bg-[var(--sky)] px-4 py-3"
              >
                <p className="text-xs uppercase tracking-widest text-black/50">
                  {item.label}
                </p>
                <p className="mt-2 font-semibold text-black">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Durum</h3>
            <p className="mt-1 text-sm text-black/60">
              BL gelmeden Gumrukte durumuna gecilemez. Kapandi manuel yapilir.
            </p>
            <p className="mt-2 text-sm text-black/70">
              Sistem onerisi: <span className="font-semibold">{suggestedStatus}</span>
            </p>
            <p className="mt-3 text-xs text-black/60">
              Durum degisiklikleri icin duzenleme ekranini kullanin.
            </p>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Uyarilar</h3>
            <p className="mt-1 text-sm text-black/60">
              Cut-off, free time, ETA ve dokuman eksik uyarilari burada ozetlenir.
            </p>
            <div className="mt-3">
              <AlertSummaryCard pending={0} sentToday={0} errors={0} />
            </div>
          </div>
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">ETA gecmisi</h3>
            <div className="mt-4 space-y-2 text-sm">
              {etaHistory?.length ? (
                etaHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-2xl border border-black/10 bg-[var(--sand)] px-4 py-2"
                  >
                    <span>{item.eta_date}</span>
                    <span className="text-xs text-black/60">
                      Degisiklik: {item.changed_at}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                  ETA gecmisi bulunamadi.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Shipment siparisleri</h3>
          <span className="text-xs text-black/60">
            Toplam: {formatNumber(totalOrders.packages, 0)} koli | {formatNumber(totalOrders.weight)} kg | {formatMoney(totalOrders.amount, "USD")}
          </span>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          {selectedOrders.length ? (
            selectedOrders.map((order) => {
              const missingOrderDocs = missingOrderTypesByOrder.get(order.id) ?? [];
              return (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="block rounded-2xl border border-black/10 bg-[var(--sky)] p-4 transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-[0_16px_30px_-24px_rgba(15,61,62,0.5)]"
                >
                  <p className="font-semibold">{order.name ?? "-"}</p>
                  <p className="mt-2 text-xs text-black/60">
                    {formatNumber(order.packages ?? null, 0)} koli | {formatNumber(order.weight_kg)} kg | {formatMoney(order.total_amount ?? null, order.currency)}
                  </p>
                  {missingOrderDocs.length ? (
                    <span className="mt-3 inline-flex rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold text-red-700">
                      Eksik belgeler: {missingOrderDocs.join(", ")}
                    </span>
                  ) : null}
                </Link>
              );
            })
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz siparis secilmedi.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Forwarder teklifleri</h3>
        <p className="mt-1 text-sm text-black/60">
          Bu shipment icin girilen tum teklifleri burada gorebilirsiniz.
        </p>
        <div className="mt-4 space-y-3 text-sm">
          {forwarderQuotes?.length ? (
            forwarderQuotes.map((quote) => {
              const forwarderName = forwarderById.get(quote.forwarder_id) ?? (quote as any).forwarders?.name ?? "-";
              return (
                <div
                  key={quote.id}
                  className={`rounded-2xl border border-black/10 p-4 ${
                    quote.is_selected ? "text-white" : ""
                  }`}
                  style={{
                    backgroundColor: quote.is_selected ? "#0f3d3e" : colorFromId(quote.id),
                  }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {forwarderName} - {formatMoney(quote.amount ? Number(quote.amount) : null, quote.currency ?? "USD")}
                      </p>
                      <p
                        className={`text-xs ${
                          quote.is_selected ? "text-white/80" : "text-black/60"
                        }`}
                      >
                        Konteyner: {quote.container_size ?? "-"} | Free time: {quote.free_time_days ?? "-"} gun | Rota:{" "}
                        {quote.route_option ?? "-"} | Transit: {quote.transit_days ?? "-"} gun
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {cheapestAmount !== null && Number(quote.amount ?? 0) === cheapestAmount ? (
                        <span className="rounded-full bg-[var(--ocean)] px-3 py-1 text-xs text-white">En ucuz</span>
                      ) : null}
                      {quote.is_selected ? (
                        <span className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold text-black/70">
                          Seçili
                        </span>
                      ) : (
                        <form action={selectForwarderQuote}>
                          <input type="hidden" name="quote_id" value={quote.id} />
                          <input type="hidden" name="shipment_id" value={shipment.id} />
                          <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                          <button className="rounded-full border border-black/10 bg-white/70 px-3 py-1 text-xs font-semibold text-black/70">
                            Sec
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div
                    className={`mt-2 text-xs ${
                      quote.is_selected ? "text-white/80" : "text-black/60"
                    }`}
                  >
                    Gecerlilik: {quote.valid_until ?? "-"} | Not: {quote.notes ?? "-"}
                  </div>

                  <details className="mt-3 rounded-2xl border border-black/10 bg-white/80 p-3 text-black" open={false}>
                    <summary className="cursor-pointer select-none text-xs font-semibold text-black/70">
                      Düzenle / Sil
                    </summary>
                    <form action={updateForwarderQuote} className="mt-3 grid gap-2 text-sm lg:grid-cols-3">
                      <input type="hidden" name="quote_id" value={quote.id} />
                      <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                      <input type="hidden" name="shipment_id" value={shipment.id} />
                      <label className="flex flex-col gap-1">
                        Tutar
                        <input
                          name="amount"
                          defaultValue={quote.amount ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Para birimi
                        <input
                          name="currency"
                          defaultValue={quote.currency ?? "USD"}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Konteyner
                        <input
                          name="container_size"
                          defaultValue={quote.container_size ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Free time (gün)
                        <input
                          name="free_time_days"
                          defaultValue={quote.free_time_days ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Rota
                        <select
                          name="route_option"
                          defaultValue={quote.route_option ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        >
                          <option value="">Seçiniz</option>
                          <option value="Suveys">Suveys</option>
                          <option value="Umit Burnu">Umit Burnu</option>
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        Transit (gün)
                        <input
                          name="transit_days"
                          defaultValue={quote.transit_days ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        Geçerlilik
                        <input
                          type="date"
                          name="valid_until"
                          defaultValue={quote.valid_until ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <label className="flex flex-col gap-1 lg:col-span-3">
                        Not
                        <input
                          name="notes"
                          defaultValue={quote.notes ?? ""}
                          className="rounded-xl border border-black/10 px-3 py-2"
                        />
                      </label>
                      <div className="lg:col-span-3 flex flex-wrap gap-2">
                        <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
                          Kaydet
                        </button>
                      </div>
                    </form>
                    <form action={deleteForwarderQuote} className="mt-2 flex gap-2">
                      <input type="hidden" name="quote_id" value={quote.id} />
                      <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                      <input type="hidden" name="shipment_id" value={shipment.id} />
                      <button className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold">
                        Sil
                      </button>
                    </form>
                  </details>
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz teklif girilmedi. Forwarder detay sayfasindan teklif ekleyin.
            </div>
          )}
        </div>

        <details className="mt-6 rounded-2xl border border-black/10 bg-white/70">
          <summary className="cursor-pointer select-none list-none rounded-2xl px-4 py-3 text-sm font-semibold text-black/80 transition hover:bg-[var(--sky)]/40">
            Yeni teklif ekle
          </summary>
          <form
            action={createForwarderQuoteForShipment}
            className="grid gap-3 rounded-2xl border-t border-black/10 bg-[var(--sky)]/40 p-4 text-sm lg:grid-cols-3"
          >
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <label className="flex flex-col gap-1">
              Forwarder
              <select
                name="forwarder_id"
                defaultValue={shipment.forwarder_id ?? ""}
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              >
                <option value="">Secin</option>
                {forwarders?.map((forwarder) => (
                  <option key={forwarder.id} value={forwarder.id}>
                    {forwarder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Tutar (USD)
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="Orn: 1250"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              Konteyner boyutu
              <input
                name="container_size"
                type="text"
                placeholder="20GP / 40HC"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              Free time (gun)
              <input
                name="free_time_days"
                type="text"
                inputMode="numeric"
                placeholder="Orn: 14"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              Rota
              <select
                name="route_option"
                defaultValue=""
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              >
                <option value="">Secin</option>
                <option value="Suveys">Suveys</option>
                <option value="Umit Burnu">Umit Burnu</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Transit (gun)
              <input
                name="transit_days"
                type="text"
                inputMode="numeric"
                placeholder="Orn: 35"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1">
              Gecerlilik
              <input
                name="valid_until"
                type="date"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 lg:col-span-2">
              Not
              <input
                name="notes"
                type="text"
                placeholder="Opsiyonel"
                className="rounded-xl border border-black/10 bg-white px-3 py-2"
              />
            </label>
            <div className="flex items-end">
              <button className="w-full rounded-full bg-[var(--ocean)] px-4 py-2 font-semibold text-white">
                Teklifi ekle
              </button>
            </div>
          </form>
        </details>
      </div>
    </section>
  );
}




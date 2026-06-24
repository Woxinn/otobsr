import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { getCurrentUserRole, canEdit } from "@/lib/roles";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import { selectForwarderQuote, updateForwarderQuote, deleteForwarderQuote, createForwarderQuoteForShipment } from "@/app/actions/forwarder-quotes";
import { deleteShipment } from "@/app/actions/shipments";
import { ShipmentArchiveButton } from "@/components/ShipmentArchiveButton";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Calendar,
  Ship,
  Anchor,
  Scale,
  Warehouse,
  ClipboardList,
  Tag,
  DollarSign,
  Route,
  CheckCircle2,
  AlertTriangle,
  Clock,
  AlertCircle,
  FileCheck,
  Plus,
  Compass,
  ArrowRight,
  MapPin,
  ChevronDown
} from "lucide-react";

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
    .select("order_id, orders(id, name, consignment_no, packages, weight_kg, total_amount, currency)")
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
      ata_actual: shipment.ata_actual,
      warehouse_delivery_date: shipment.warehouse_delivery_date,
      status: shipment.status,
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

  const normalizeStatus = (status: string | null) => (status ?? "").toLowerCase();

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

  const orderDocumentsByOrder = new Map<string, typeof orderDocuments>();
  orderDocuments?.forEach((doc) => {
    if (!doc.order_id) return;
    const list = orderDocumentsByOrder.get(doc.order_id) ?? [];
    list.push(doc);
    orderDocumentsByOrder.set(doc.order_id, list);
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

  const normStatus = normalizeStatus(shipment.status);
  const steps = [
    {
      label: "Planlandı",
      description: "Sevkiyat kaydı açıldı",
      active: true,
      date: formatDate(shipment.created_at),
      icon: ClipboardList
    },
    {
      label: "Kalkış Limanında",
      description: "Liman işlemleri başladı",
      active: Boolean(shipment.etd_planned || shipment.atd_actual),
      date: shipment.atd_actual ? `Fiili: ${formatDate(shipment.atd_actual)}` : shipment.etd_planned ? `Plan: ${formatDate(shipment.etd_planned)}` : undefined,
      icon: Anchor
    },
    {
      label: "Denizde",
      description: "Transit taşıma sürecinde",
      active: Boolean(shipment.atd_actual && !shipment.ata_actual) || normStatus === "denizde",
      date: shipment.atd_actual ? `Kalkış: ${formatDate(shipment.atd_actual)}` : undefined,
      icon: Ship
    },
    {
      label: "Varış Limanında",
      description: "Gemi limana yanaştı",
      active: Boolean(shipment.ata_actual) || ["gemiden indi", "gumrukte", "depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus),
      date: shipment.ata_actual ? `Fiili: ${formatDate(shipment.ata_actual)}` : shipment.eta_current ? `Plan: ${formatDate(shipment.eta_current)}` : undefined,
      icon: Compass
    },
    {
      label: "Gümrükte",
      description: "İthalat gümrük işlemleri",
      active: ["gumrukte", "depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus),
      date: shipment.customs_entry_date ? `Giriş: ${formatDate(shipment.customs_entry_date)}` : undefined,
      icon: Scale
    },
    {
      label: "Depoda / Teslim",
      description: "Depoya teslim edildi",
      active: Boolean(shipment.warehouse_delivery_date) || ["depoya teslim edildi", "teslim edildi", "tamamlandi"].includes(normStatus),
      date: shipment.warehouse_delivery_date ? `Teslim: ${formatDate(shipment.warehouse_delivery_date)}` : undefined,
      icon: Warehouse
    }
  ];

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Link href="/shipments" className="text-black/45 hover:text-black transition">
                Sevkiyatlar
              </Link>
              <span className="text-black/30">/</span>
              <span className="text-black/75 font-semibold">Detay</span>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-black/90 [font-family:var(--font-display)]">
                {shipment.file_no}
              </h2>
              {shipment.reference && (
                <span className="rounded-lg bg-slate-50 border border-black/8 px-2.5 py-0.5 text-xs font-mono font-bold text-black/60">
                  Konşimento: {shipment.reference}
                </span>
              )}
            </div>

            <p className="text-xs text-black/45 font-medium">
              Oluşturulma Tarihi: {formatDate(shipment.created_at)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/shipments"
              className="inline-flex items-center gap-1 rounded-xl border border-black/15 bg-white px-3.5 py-2 text-xs font-bold text-black/70 shadow-xs hover:bg-slate-50 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Listeye Dön
            </Link>
            
            {canEditPage && (
              <>
                <Link
                  href={`/shipments/${shipment.id}/edit`}
                  className="inline-flex items-center gap-1 rounded-xl border border-black/10 bg-white px-3.5 py-2 text-xs font-bold text-black/75 shadow-xs hover:bg-slate-50 transition"
                >
                  <Pencil className="h-3.5 w-3.5 text-black/50" />
                  Düzenle
                </Link>
                <ShipmentArchiveButton
                  shipmentId={shipment.id}
                  archived={Boolean(shipment.archived_at)}
                />
                <ConfirmActionForm
                  action={deleteShipment}
                  confirmText="Bu sevkiyatı silmek istediğinize emin misiniz? Bu işlem geri alınamaz."
                  buttonText="Sevkiyatı Sil"
                >
                  <input type="hidden" name="shipment_id" value={shipment.id} />
                </ConfirmActionForm>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-black/5 pt-5">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6 text-center">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className={`rounded-xl border p-3 flex flex-col items-center justify-between text-center transition-all ${
                    step.active
                      ? "bg-[var(--ocean)]/5 border-[var(--ocean)]/20 text-[var(--ocean)]"
                      : "bg-slate-50/40 border-black/5 text-black/35"
                  }`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-2xs border border-black/5">
                    <Icon className={`h-4 w-4 ${step.active ? "text-[var(--ocean)] font-bold" : "text-black/30"}`} />
                  </div>
                  
                  <div className="mt-2.5">
                    <p className={`text-[11px] font-extrabold tracking-tight ${step.active ? "text-[var(--ocean)]" : "text-black/60"}`}>
                      {step.label}
                    </p>
                    <p className="text-[9px] text-black/45 mt-0.5 font-medium leading-tight">
                      {step.description}
                    </p>
                  </div>

                  {step.date ? (
                    <span className="mt-2 rounded bg-white px-2 py-0.5 text-[9px] font-bold shadow-2xs border border-black/5 text-black/65 font-mono">
                      {step.date}
                    </span>
                  ) : (
                    <span className="mt-2 text-[9px] text-black/30 font-medium font-mono">-</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {resolvedSearchParams.error === "bl-required" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          Gümrük aşamasına geçebilmek için öncelikle BL belgesinin "Geldi" durumuna getirilmesi gerekmektedir.
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Planlanan ETD",
            value: formatDate(shipment.etd_planned),
            icon: Calendar,
            iconColor: "text-blue-500",
            bgColor: "bg-blue-50/50 border-blue-100",
            desc: "Planlanan yükleme tarihi"
          },
          {
            label: "Fiili ATD",
            value: formatDate(shipment.atd_actual),
            icon: Ship,
            iconColor: shipment.atd_actual ? "text-emerald-500" : "text-black/30",
            bgColor: shipment.atd_actual ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50 border-slate-100",
            desc: "Lojistik kalkış tarihi"
          },
          {
            label: "Güncel ETA",
            value: formatDate(shipment.eta_current),
            icon: Clock,
            iconColor: flags.overdue ? "text-red-500" : "text-amber-500",
            bgColor: flags.overdue ? "bg-red-50/50 border-red-100" : "bg-amber-50/50 border-amber-100",
            desc: "Tahmini varış tarihi"
          },
          {
            label: "Depo Teslim",
            value: formatDate(shipment.warehouse_delivery_date),
            icon: Warehouse,
            iconColor: shipment.warehouse_delivery_date ? "text-emerald-500" : "text-black/30",
            bgColor: shipment.warehouse_delivery_date ? "bg-emerald-50/50 border-emerald-100" : "bg-slate-50 border-slate-100",
            desc: "Depo fiili teslim tarihi"
          },
        ].map((item) => (
          <div
            key={item.label}
            className={`rounded-2xl border p-4 shadow-2xs transition-all duration-200 hover:shadow-xs ${item.bgColor}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-black/45">
                {item.label}
              </span>
              <item.icon className={`h-4.5 w-4.5 ${item.iconColor}`} />
            </div>
            <p className="mt-2 text-xl font-bold text-black/90">{item.value}</p>
            <p className="mt-1 text-[11px] text-black/45 font-medium">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              <ClipboardList className="h-4.5 w-4.5 text-[var(--ocean)]" />
              <h3 className="text-base font-bold text-black/85">Sevkiyat ve Konteyner Bilgileri</h3>
            </div>
            
            <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
              {[
                { label: "Dosya / Yük No", value: shipment.file_no ?? "-", full: false },
                { label: "Konşimento Ref", value: shipment.reference ?? "-", full: false },
                { label: "Konteyner No", value: shipment.container_no ?? "-", full: false },
                { label: "Mühür (Seal) No", value: shipment.seal_no ?? "-", full: false },
                { label: "Konteyner Tipi", value: shipment.container_type ?? "-", full: false },
                { label: "Taşıyıcı (Forwarder)", value: shipment.forwarders?.name ?? "-", full: false },
                { label: "Gemi Adı", value: shipment.vessel_name ?? "-", full: false },
                { label: "IMO No", value: shipment.vessel_imo ?? "-", full: false },
                { label: "Gemi Bayrağı", value: shipment.vessel_flag ?? "-", full: false },
                { label: "Çıkış Limanı", value: shipment.origin_port?.name ?? "-", full: false },
                { label: "Varış Limanı", value: shipment.destination_port?.name ?? "-", full: false },
                { label: "Gümrük Giriş Tarihi", value: formatDate(shipment.customs_entry_date), full: false },
                { label: "Etiketler", value: shipment.tags?.join(", ") ?? "-", full: true },
                { label: "Sevkiyat Notları", value: shipment.notes ?? "-", full: true },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-xl border border-black/5 bg-slate-50/40 px-3.5 py-2.5 ${
                    item.full ? "sm:col-span-2" : ""
                  }`}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">
                    {item.label}
                  </p>
                  <p className="mt-1 font-bold text-black/85">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4.5 w-4.5 text-[var(--ocean)]" />
                <h3 className="text-base font-bold text-black/85">İlişkili Siparişler</h3>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-black/60">
                Toplam: {formatNumber(totalOrders.packages, 0)} koli | {formatNumber(totalOrders.weight)} kg
              </span>
            </div>
            
            <div className="mt-4 space-y-3">
              {selectedOrders.length ? (
                selectedOrders.map((order) => {
                  const missingOrderDocs = missingOrderTypesByOrder.get(order.id) ?? [];
                  return (
                    <div
                      key={order.id}
                      className="group relative rounded-xl border border-black/8 bg-slate-50/40 p-4 transition-all duration-200 hover:border-[var(--ocean)]/30 hover:bg-white hover:shadow-xs"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-bold text-[var(--ocean)] hover:underline flex items-center gap-1 text-sm"
                          >
                            {order.name ?? "-"}
                            <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </Link>
                          <p className="mt-1 text-xs text-black/55 font-medium">
                            Konşimento No: <span className="font-bold text-black/75">{order.consignment_no ?? "-"}</span>
                          </p>
                          <p className="mt-1 text-xs text-black/45">
                            {formatNumber(order.packages ?? null, 0)} koli • {formatNumber(order.weight_kg)} kg • Değer: <span className="font-semibold text-black/70">{formatMoney(order.total_amount ?? null, order.currency)}</span>
                          </p>
                        </div>
                        
                        {missingOrderDocs.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold text-red-700 h-fit">
                            <AlertTriangle className="h-3 w-3" />
                            Eksik: {missingOrderDocs.join(", ")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 h-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            Evraklar Hazır
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-xl border border-dashed border-black/10 py-8 text-center text-sm text-black/40">
                  Bu sevkiyata bağlı herhangi bir sipariş bulunmuyor.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              <Compass className="h-4.5 w-4.5 text-[var(--ocean)]" />
              <h3 className="text-base font-bold text-black/85">Operasyon Durumu</h3>
            </div>
            <div className="mt-4 space-y-3 text-xs font-semibold">
              <div className="flex justify-between items-center rounded-xl bg-slate-50 border border-black/5 p-3">
                <span className="text-black/50">Güncel Durum:</span>
                <span className="rounded-full bg-[var(--ocean)] px-3 py-1 font-bold text-white text-xs">
                  {shipment.status ?? "Planlandı"}
                </span>
              </div>
              
              <div className="flex justify-between items-center rounded-xl bg-slate-50 border border-black/5 p-3">
                <span className="text-black/50">Sistem Önerisi:</span>
                <span className="rounded-full bg-[var(--sky)] px-3 py-1 font-bold text-[var(--ocean)] text-xs">
                  {suggestedStatus}
                </span>
              </div>
              
              {normStatus !== "gumrukte" && normStatus !== "depoya teslim edildi" && normStatus !== "teslim edildi" && flags.blMissing && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-medium text-amber-800 leading-relaxed">
                  <div className="flex items-center gap-1 font-bold mb-1">
                    <AlertCircle className="h-3.5 w-3.5" />
                    BL Belgesi Eksik
                  </div>
                  BL belgesi gelmeden gümrük aşamasına geçiş önerilmemektedir.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              <AlertTriangle className="h-4.5 w-4.5 text-[var(--ocean)]" />
              <h3 className="text-base font-bold text-black/85">Uyarılar & Alarmlar</h3>
            </div>
            <div className="mt-4">
              <AlertSummaryCard pending={0} sentToday={0} errors={0} />
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
            <div className="flex items-center gap-2 border-b border-black/5 pb-3">
              <Clock className="h-4.5 w-4.5 text-[var(--ocean)]" />
              <h3 className="text-base font-bold text-black/85">ETA Değişiklik Geçmişi</h3>
            </div>
            <div className="mt-4 relative pl-4 border-l border-black/10 space-y-4">
              {etaHistory?.length ? (
                etaHistory.map((item) => (
                  <div key={item.id} className="relative text-xs">
                    <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-[var(--ocean)] bg-white" />
                    
                    <p className="font-bold text-black/80">Yeni ETA: {item.eta_date}</p>
                    <p className="mt-0.5 text-[10px] text-black/45 font-medium">
                      Güncelleme: {formatDate(item.changed_at)}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-xs text-black/40 py-2 font-medium">
                  Tarih değişikliği yapılmadı.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-xs">
        <div className="flex items-center gap-2 border-b border-black/5 pb-3 mb-4">
          <DollarSign className="h-4.5 w-4.5 text-[var(--ocean)]" />
          <div>
            <h3 className="text-base font-bold text-black/85">Forwarder Lojistik Teklifleri</h3>
            <p className="text-xs text-black/45 font-medium mt-0.5">Bu sevkiyat için toplanan alternatif fiyatlar</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forwarderQuotes?.length ? (
            forwarderQuotes.map((quote) => {
              const forwarderName = forwarderById.get(quote.forwarder_id) ?? (quote as any).forwarders?.name ?? "-";
              const isCheapest = cheapestAmount !== null && Number(quote.amount ?? 0) === cheapestAmount;
              
              let cardBg = quote.is_selected ? "bg-[var(--ocean)] text-white shadow-md border-transparent" : "bg-slate-50/60 border-black/10 hover:bg-slate-50";
              let textMuted = quote.is_selected ? "text-white/80" : "text-black/55";

              return (
                <div
                  key={quote.id}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition-all duration-200 ${cardBg}`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-wider ${quote.is_selected ? "text-white/60" : "text-black/40"}`}>
                          {forwarderName}
                        </p>
                        <p className="text-xl font-black mt-1">
                          {formatMoney(quote.amount ? Number(quote.amount) : null, quote.currency ?? "USD")}
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-end gap-1">
                        {quote.is_selected && (
                          <span className="rounded-full bg-white/20 border border-white/20 px-2 py-0.5 text-[9px] font-bold text-white">
                            Seçili
                          </span>
                        )}
                        {isCheapest && (
                          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                            quote.is_selected ? "bg-white/30 text-white" : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            En Ucuz
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1 text-xs leading-relaxed font-semibold">
                      <div className="flex justify-between">
                        <span className={textMuted}>Konteyner:</span>
                        <span>{quote.container_size ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textMuted}>Serbest Süre:</span>
                        <span>{quote.free_time_days ?? "-"} gün</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textMuted}>Rota Opsiyonu:</span>
                        <span>{quote.route_option ?? "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={textMuted}>Transit Süre:</span>
                        <span>{quote.transit_days ?? "-"} gün</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between">
                    <span className={`text-[10px] ${textMuted}`}>
                      Vade: {quote.valid_until ?? "-"}
                    </span>

                    <div className="flex items-center gap-2">
                      {!quote.is_selected && (
                        <form action={selectForwarderQuote}>
                          <input type="hidden" name="quote_id" value={quote.id} />
                          <input type="hidden" name="shipment_id" value={shipment.id} />
                          <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                          <button className="rounded-lg bg-white/90 border border-black/10 px-2.5 py-1 text-xs font-bold text-black/70 hover:bg-white transition cursor-pointer">
                            Seç
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  <details className="mt-3 border-t border-black/5 pt-2">
                    <summary className={`cursor-pointer select-none text-[10px] font-bold ${
                      quote.is_selected ? "text-white/60 hover:text-white" : "text-black/40 hover:text-black"
                    }`}>
                      Teklifi Düzenle / Sil
                    </summary>
                    <div className="mt-3 rounded-lg bg-white p-3 text-black border border-black/5">
                      <form action={updateForwarderQuote} className="grid gap-2 text-xs grid-cols-2">
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                        <input type="hidden" name="shipment_id" value={shipment.id} />
                        
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Tutar
                          <input
                            name="amount"
                            defaultValue={quote.amount ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Döviz
                          <input
                            name="currency"
                            defaultValue={quote.currency ?? "USD"}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Konteyner
                          <input
                            name="container_size"
                            defaultValue={quote.container_size ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Free Time
                          <input
                            name="free_time_days"
                            defaultValue={quote.free_time_days ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Rota
                          <select
                            name="route_option"
                            defaultValue={quote.route_option ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          >
                            <option value="">Seçiniz</option>
                            <option value="Suveys">Suveys</option>
                            <option value="Umit Burnu">Umit Burnu</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 font-semibold text-black/50">
                          Transit (gün)
                          <input
                            name="transit_days"
                            defaultValue={quote.transit_days ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 col-span-2 font-semibold text-black/50">
                          Son Geçerlilik
                          <input
                            type="date"
                            name="valid_until"
                            defaultValue={quote.valid_until ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        <label className="flex flex-col gap-1 col-span-2 font-semibold text-black/50">
                          Teklif Notu
                          <input
                            name="notes"
                            defaultValue={quote.notes ?? ""}
                            className="rounded-lg border border-black/10 bg-white px-2 py-1 text-black font-bold"
                          />
                        </label>
                        
                        <button className="col-span-2 mt-2 rounded-lg bg-[var(--ocean)] py-1.5 font-bold text-white hover:bg-black transition">
                          Güncelle
                        </button>
                      </form>
                      
                      <form action={deleteForwarderQuote} className="mt-1">
                        <input type="hidden" name="quote_id" value={quote.id} />
                        <input type="hidden" name="forwarder_id" value={quote.forwarder_id} />
                        <input type="hidden" name="shipment_id" value={shipment.id} />
                        <button className="w-full rounded-lg border border-red-200 bg-red-50 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 transition">
                          Teklifi Sil
                        </button>
                      </form>
                    </div>
                  </details>
                </div>
              );
            })
          ) : (
            <div className="col-span-3 rounded-xl border border-dashed border-black/10 py-8 text-center text-sm text-black/40">
              Henüz bir forwarder teklifi girilmemiş.
            </div>
          )}
        </div>

        <details className="group mt-4 rounded-xl border border-black/10 bg-slate-50/40">
          <summary className="cursor-pointer select-none list-none rounded-xl px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--ocean)] hover:bg-slate-50 transition flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>Yeni Teklif Ekle</span>
            </div>
            <span className="transition-transform group-open:rotate-180">
              <ChevronDown className="h-4 w-4" />
            </span>
          </summary>
          <form
            action={createForwarderQuoteForShipment}
            className="grid gap-3 border-t border-black/5 p-4 text-xs lg:grid-cols-3 bg-white"
          >
            <input type="hidden" name="shipment_id" value={shipment.id} />
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Forwarder
              <select
                name="forwarder_id"
                defaultValue={shipment.forwarder_id ?? ""}
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              >
                <option value="">Seçin</option>
                {forwarders?.map((forwarder) => (
                  <option key={forwarder.id} value={forwarder.id}>
                    {forwarder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Tutar (USD)
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="Örn: 1250"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Konteyner Boyutu
              <input
                name="container_size"
                type="text"
                placeholder="20GP / 40HC"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Serbest Süre (gün)
              <input
                name="free_time_days"
                type="text"
                inputMode="numeric"
                placeholder="Örn: 14"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Rota
              <select
                name="route_option"
                defaultValue=""
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              >
                <option value="">Seçin</option>
                <option value="Suveys">Suveys</option>
                <option value="Umit Burnu">Umit Burnu</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Transit Süre (gün)
              <input
                name="transit_days"
                type="text"
                inputMode="numeric"
                placeholder="Örn: 35"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold text-black/55">
              Geçerlilik Tarihi
              <input
                name="valid_until"
                type="date"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <label className="flex flex-col gap-1 lg:col-span-2 font-semibold text-black/55">
              Özel Not
              <input
                name="notes"
                type="text"
                placeholder="Opsiyonel not ekleyin"
                className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-bold text-black"
              />
            </label>
            <div className="flex items-end">
              <button className="w-full rounded-lg bg-[var(--ocean)] px-4 py-2 font-bold text-white hover:bg-black transition cursor-pointer">
                Teklifi Kaydet
              </button>
            </div>
          </form>
        </details>
      </div>
    </div>
  );
}


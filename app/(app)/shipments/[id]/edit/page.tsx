import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getShipmentFlags } from "@/lib/shipments";
import { getCurrentUserRole, canEdit } from "@/lib/roles";
import {
  updateShipment,
  updateShipmentStatus,
  updateShipmentOrders,
} from "@/app/actions/shipments";
import { updateDocument, deleteDocument } from "@/app/actions/documents";
import DocumentUploader from "@/components/DocumentUploader";
import DocumentDownloadButton from "@/components/DocumentDownloadButton";
import ShipmentOrdersSelector from "@/components/ShipmentOrdersSelector";
import ConfirmActionForm from "@/components/ConfirmActionForm";

const statusOptions = [
  "Planlandi",
  "Kalkis Limaninda",
  "Denizde",
  "Varis Limaninda",
  "Gemiden Indi",
];

export default async function ShipmentEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ordersError?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  if (!canEditPage) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/70 shadow-sm">
        Bu sayfayi duzenleme yetkiniz yok.
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

  const { data: documents } = await supabase
    .from("documents")
    .select("*, document_types(name)")
    .eq("shipment_id", shipment.id)
    .order("uploaded_at", { ascending: false });

  const { data: shipmentOrders } = await supabase
    .from("shipment_orders")
    .select("order_id, orders(id, name, packages, weight_kg, total_amount, currency)")
    .eq("shipment_id", shipment.id);

  const { data: selectedQuote } = await supabase
    .from("forwarder_quotes")
    .select("transit_days")
    .eq("shipment_id", shipment.id)
    .eq("is_selected", true)
    .maybeSingle();

  const { data: forwarders } = await supabase
    .from("forwarders")
    .select("id, name")
    .order("name");
  const { data: ports } = await supabase
    .from("ports")
    .select("id, name")
    .order("name");

  const { data: orders } = await supabase
    .from("orders")
    .select("id, name, reference_name, packages, weight_kg, total_amount, currency, notes")
    .order("created_at", { ascending: false });

  const { data: orderLinks } =
    orders?.length
      ? await supabase
          .from("shipment_orders")
          .select("order_id, shipment_id, shipments(file_no)")
          .in(
            "order_id",
            orders.map((order) => order.id)
          )
      : { data: [] };

  const disabledById = new Map<string, { reason: string }>();
  orderLinks?.forEach((link) => {
    if (!link.order_id || link.shipment_id === shipment.id) return;
    const shipmentFileNo = Array.isArray((link as any).shipments)
      ? (link as any).shipments[0]?.file_no
      : (link as any).shipments?.file_no;
    const label = shipmentFileNo
      ? `Baska shipmentte: ${shipmentFileNo}`
      : "Baska shipmentte";
    disabledById.set(link.order_id, { reason: label });
  });

  const flags = getShipmentFlags(
    {
      eta_current: shipment.eta_current,
      warehouse_delivery_date: shipment.warehouse_delivery_date,
    },
    documents ?? [],
    shipmentDocumentTypes
  );

  const selectedOrders =
    shipmentOrders?.flatMap((item) => item.orders ?? []) ?? [];
  const selectedOrderIds = new Set(
    shipmentOrders?.map((item) => item.order_id) ?? []
  );
  const totalOrders = selectedOrders.reduce(
    (acc, item) => {
      acc.packages += Number(item.packages ?? 0);
      acc.weight += Number(item.weight_kg ?? 0);
      acc.amount += Number(item.total_amount ?? 0);
      return acc;
    },
    { packages: 0, weight: 0, amount: 0 }
  );

  const transitDays = Number(selectedQuote?.transit_days ?? 0);
  const baseEtaDate = shipment.atd_actual ?? shipment.etd_planned ?? null;
  const suggestedEta =
    baseEtaDate && transitDays > 0
      ? new Date(
          new Date(baseEtaDate).setDate(
            new Date(baseEtaDate).getDate() + transitDays
          )
        )
          .toISOString()
          .slice(0, 10)
      : null;

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

  return (
    <section className="space-y-8">
      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-black/40">
              Shipment duzenle
            </p>
            <h2 className="text-3xl font-semibold [font-family:var(--font-display)]">
              {shipment.file_no}
            </h2>
            <p className="mt-2 text-sm text-black/60">
              Risk: {flags.risk} | Evrak eksik: {flags.missingRequiredCount}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/shipments/${shipment.id}`}
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            >
              Detaya don
            </Link>
            <Link
              href="/shipments"
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
            >
              Listeye don
            </Link>
          </div>
        </div>
      </div>

      {resolvedSearchParams.error === "bl-required" ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          BL gelmeden Gumrukte durumuna gecilemez.
        </div>
      ) : null}
      {resolvedSearchParams.ordersError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Siparis kaydi yapilirken hata olustu. Tekrar deneyin.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form
          action={updateShipment}
          className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="shipment_id" value={shipment.id} />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Genel</h3>
              <label className="block text-sm font-medium">
                Dosya No
                <input
                  name="file_no"
                  defaultValue={shipment.file_no ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                KonÅŸimento No
                <input
                  name="reference"
                  defaultValue={shipment.reference ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Etiketler (virgul ile)
                <input
                  name="tags"
                  defaultValue={shipment.tags?.join(", ") ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Genel not
                <textarea
                  name="notes"
                  defaultValue={shipment.notes ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Taraflar</h3>
              <label className="block text-sm font-medium">
                Forwarder
                <select
                  name="forwarder_id"
                  defaultValue={shipment.forwarders?.id ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seciniz</option>
                  {forwarders?.map((forwarder) => (
                    <option key={forwarder.id} value={forwarder.id}>
                      {forwarder.name}
                    </option>
                  ))}
                </select>
              </label>

              <h3 className="pt-2 text-lg font-semibold">Liman & Konteyner</h3>
              <label className="block text-sm font-medium">
                Çıkış limani
                <select
                  name="origin_port_id"
                  defaultValue={shipment.origin_port?.id ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seciniz</option>
                  {ports?.map((port) => (
                    <option key={port.id} value={port.id}>
                      {port.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Varis limani
                <select
                  name="destination_port_id"
                  defaultValue={shipment.destination_port?.id ?? ""}
                  className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Seciniz</option>
                  {ports?.map((port) => (
                    <option key={port.id} value={port.id}>
                      {port.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 lg:grid-cols-3">
                <label className="block text-sm font-medium">
                  Tip
                  <input
                    name="container_type"
                    defaultValue={shipment.container_type ?? ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Konteyner no
                  <input
                    name="container_no"
                    defaultValue={shipment.container_no ?? ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Seal no
                  <input
                    name="seal_no"
                    defaultValue={shipment.seal_no ?? ""}
                    className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <label className="block text-sm font-medium">
              ETD (plan)
              <input
                type="date"
                name="etd_planned"
                defaultValue={shipment.etd_planned ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              ATD (gercek)
              <input
                type="date"
                name="atd_actual"
                defaultValue={shipment.atd_actual ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              ETA (guncel)
              <input
                type="date"
                name="eta_current"
                defaultValue={shipment.eta_current ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              ATA (gercek)
              <input
                type="date"
                name="ata_actual"
                defaultValue={shipment.ata_actual ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Gumruk giris tarihi
              <input
                type="date"
                name="customs_entry_date"
                defaultValue={shipment.customs_entry_date ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Depo teslim tarihi
              <input
                type="date"
                name="warehouse_delivery_date"
                defaultValue={shipment.warehouse_delivery_date ?? ""}
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--peach)] p-3 text-sm text-black/70">
            ETA degisiklikleri otomatik kaydedilir.
          </div>
          {suggestedEta ? (
            <div className="mt-3 rounded-2xl border border-black/10 bg-[var(--sky)]/50 p-3 text-sm text-black/70">
              Seçili forwarder transit suresi ile otomatik ETA onerisi:{" "}
              <span className="font-semibold text-black">{suggestedEta}</span>
            </div>
          ) : null}

          <button className="mt-6 rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white">
            Degisiklikleri kaydet
          </button>
        </form>

        <div className="space-y-6">
          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold">Durum</h3>
            <p className="mt-1 text-sm text-black/60">
              BL gelmeden Gumrukte durumuna gecilemez. Kapandi manuel yapilir.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <form key={option} action={updateShipmentStatus}>
                  <input type="hidden" name="shipment_id" value={shipment.id} />
                  <input type="hidden" name="status" value={option} />
                  <button
                    className={`rounded-full border px-4 py-2 text-xs font-semibold ${
                      shipment.status === option
                        ? "border-[var(--ocean)] bg-[var(--ocean)] text-white"
                        : "border-black/20 bg-white"
                    }`}
                  >
                    {option}
                  </button>
                </form>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Shipment siparisleri</h3>
              <span className="text-xs text-black/60">
                Toplam: {formatNumber(totalOrders.packages, 0)} adet |{" "}
                {formatNumber(totalOrders.weight)} kg |{" "}
                {formatMoney(totalOrders.amount, "USD")}
              </span>
            </div>
            <form action={updateShipmentOrders} className="mt-4 space-y-4 text-sm">
              <input type="hidden" name="shipment_id" value={shipment.id} />
              <ShipmentOrdersSelector
                orders={orders ?? []}
                selectedIds={[...selectedOrderIds]}
                disabledById={Object.fromEntries(disabledById)}
              />
              <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
                Siparisleri kaydet
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Evrak checklist</h3>
          <p className="mt-1 text-sm text-black/60">
            Zorunlu evrak eksikse uyarilar gorunur. Sorunlu evrak sureci
            durdurmaz.
          </p>
          <div className="mt-4 space-y-3">
            {documents?.length ? (
              documents.map((doc) => (
                <form
                  key={doc.id}
                  action={updateDocument}
                  className="rounded-2xl border border-black/10 bg-[var(--sky)] p-4 text-sm"
                >
                  <input type="hidden" name="document_id" value={doc.id} />
                  <input type="hidden" name="shipment_id" value={shipment.id} />
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {doc.document_types?.name ?? "Evrak"}
                    </p>
                    <div className="flex items-center gap-2">
                      {doc.file_name ? (
                        <span className="text-xs text-black/60">
                          {doc.file_name}
                        </span>
                      ) : null}
                      {doc.storage_path ? (
                        <DocumentDownloadButton
                          storagePath={doc.storage_path}
                          label="Goruntule"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      name="document_type_id"
                      defaultValue={doc.document_type_id ?? ""}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      {shipmentDocumentTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="status"
                      defaultValue={doc.status ?? "Bekleniyor"}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    >
                      <option value="Bekleniyor">Bekleniyor</option>
                      <option value="Geldi">Geldi</option>
                      <option value="Sorunlu">Sorunlu</option>
                    </select>
                    <input
                      type="date"
                      name="received_at"
                      defaultValue={doc.received_at ?? ""}
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="notes"
                      defaultValue={doc.notes ?? ""}
                      placeholder="Not"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="rounded-full bg-[var(--ocean)] px-4 py-1 text-xs font-semibold text-white">
                      Güncelle
                    </button>
                      <ConfirmActionForm
                        action={deleteDocument}
                        confirmText="Belge silinsin mi?"
                        buttonText="Sil"
                        className="inline"
                      >
                        <input type="hidden" name="document_id" value={doc.id} />
                        <input type="hidden" name="shipment_id" value={shipment.id} />
                      </ConfirmActionForm>
                    </div>
                </form>
              ))
            ) : (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Bu shipment icin henuz evrak yok.
              </div>
            )}
          </div>
          <div className="mt-4">
            <DocumentUploader
              shipmentId={shipment.id}
              documentTypes={shipmentDocumentTypes}
            />
          </div>
        </div>
      </div>
    </section>
  );
}


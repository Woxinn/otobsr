"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

type ShipmentOption = {
  id: string;
  file_no: string | null;
  origin_port:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
  destination_port:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
};

type Quote = {
  id: string;
  shipment_id: string | null;
  amount: number | string | null;
  currency: string | null;
  container_size: string | null;
  free_time_days: number | string | null;
  route_option: string | null;
  transit_days: number | string | null;
  valid_until: string | null;
  notes: string | null;
  is_selected: boolean | null;
};

type Props = {
  forwarderId: string;
  shipments: ShipmentOption[];
  quotes: Quote[];
};

const normalizeNumber = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(",", ".");
};

export default function ForwarderQuotesClient({
  forwarderId,
  shipments,
  quotes,
}: Props) {
  const badgeBaseClass =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold leading-5";

  const formatMoney = (
    value: number | string | null | undefined,
    currency: string | null | undefined
  ) => {
    if (value === null || value === undefined || value === "") return "0.00 USD";
    const num = Number(value);
    if (!Number.isFinite(num)) return `${value} ${currency ?? "USD"}`;
    return `${num.toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [shipmentId, setShipmentId] = useState("");
  const [quotesState, setQuotesState] = useState<Quote[]>(quotes);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadQuotes = async () => {
      const { data, error } = await supabase
        .from("forwarder_quotes")
        .select(
          "id, shipment_id, amount, currency, container_size, free_time_days, route_option, transit_days, valid_until, notes, is_selected"
        )
        .eq("forwarder_id", forwarderId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        addToast(`Teklifler cekilemedi: ${error.message}`, "error");
        return;
      }

      setQuotesState(data ?? []);
    };

    loadQuotes();
    return () => {
      isMounted = false;
    };
  }, [forwarderId, supabase]);

  const getShipmentLabel = (id: string | null) => {
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) return "Shipment silindi";
    return `${shipment.file_no ?? "-"}`;
  };

  const hasShipment = (id: string | null) =>
    Boolean(id) && shipments.some((item) => item.id === id);

  const getShipmentPort = (
    id: string | null,
    side: "origin_port" | "destination_port"
  ) => {
    const shipment = shipments.find((item) => item.id === id);
    if (!shipment) return "-";
    const port = shipment[side];
    if (Array.isArray(port)) return port[0]?.name ?? "-";
    return port?.name ?? "-";
  };

  const getContainerBadgeClass = (value: string | null) => {
    const token = String(value ?? "").toUpperCase();
    if (token.includes("40")) return "bg-indigo-50 text-indigo-700 border-indigo-200";
    if (token.includes("20")) return "bg-sky-50 text-sky-700 border-sky-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const getRouteBadgeClass = (value: string | null) => {
    const token = String(value ?? "").toLowerCase();
    if (token.includes("suveys")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (token.includes("umit")) return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const getValidityMeta = (value: string | null) => {
    if (!value) {
      return {
        label: "-",
        className: "bg-slate-50 text-slate-700 border-slate-200",
      };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validDate = new Date(value);
    validDate.setHours(0, 0, 0, 0);
    if (Number.isNaN(validDate.getTime())) {
      return {
        label: value,
        className: "bg-slate-50 text-slate-700 border-slate-200",
      };
    }
    if (validDate < today) {
      return {
        label: `${value} (suresi doldu)`,
        className: "bg-rose-50 text-rose-700 border-rose-200",
      };
    }
    return {
      label: value,
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setLoading(true);

    const formData = new FormData(form);
    const newShipmentId = String(formData.get("shipment_id") ?? "");
    const amount = normalizeNumber(formData.get("amount"));

    if (!newShipmentId || !amount) {
      addToast("Shipment ve tutar zorunlu.", "error");
      setLoading(false);
      return;
    }

    const { error } = await supabase.from("forwarder_quotes").insert({
      forwarder_id: forwarderId,
      shipment_id: newShipmentId,
      amount,
      currency: "USD",
      container_size: formData.get("container_size") || null,
      free_time_days: normalizeNumber(formData.get("free_time_days")),
      route_option: formData.get("route_option") || null,
      transit_days: normalizeNumber(formData.get("transit_days")),
      valid_until: formData.get("valid_until") || null,
      notes: formData.get("notes") || null,
    });

    setLoading(false);

    if (error) {
      addToast("Teklif kaydedilemedi.", "error");
      return;
    }

    form.reset();
    setShipmentId("");
    addToast("Teklif kaydedildi.", "success");
    router.refresh();
  };

  const handleUpdate = async (
    event: React.FormEvent<HTMLFormElement>,
    quoteId: string
  ) => {
    event.preventDefault();
    setLoading(true);
    const formData = new FormData(event.currentTarget);

    const { error } = await supabase
      .from("forwarder_quotes")
      .update({
        amount: normalizeNumber(formData.get("amount")),
        container_size: formData.get("container_size") || null,
        free_time_days: normalizeNumber(formData.get("free_time_days")),
        route_option: formData.get("route_option") || null,
        transit_days: normalizeNumber(formData.get("transit_days")),
        valid_until: formData.get("valid_until") || null,
        notes: formData.get("notes") || null,
      })
      .eq("id", quoteId);

    setLoading(false);

    if (error) {
      addToast("Teklif guncellenemedi.", "error");
      return;
    }

    setEditId(null);
    addToast("Teklif guncellendi.", "success");
    router.refresh();
  };

  const handleDelete = async (quoteId: string) => {
    setLoading(true);
    const { error } = await supabase
      .from("forwarder_quotes")
      .delete()
      .eq("id", quoteId);
    setLoading(false);
    if (error) {
      addToast("Teklif silinemedi.", "error");
      return;
    }
    addToast("Teklif silindi.", "success");
    router.refresh();
  };

  const handleSelect = async (quote: Quote) => {
    if (!quote.shipment_id) return;
    setLoading(true);
    const { error: resetError } = await supabase
      .from("forwarder_quotes")
      .update({ is_selected: false })
      .eq("shipment_id", quote.shipment_id);

    if (resetError) {
      setLoading(false);
      addToast("Teklif secilemedi.", "error");
      return;
    }

    const { error: selectError } = await supabase
      .from("forwarder_quotes")
      .update({ is_selected: true })
      .eq("id", quote.id);

    if (selectError) {
      setLoading(false);
      addToast("Teklif secilemedi.", "error");
      return;
    }

    const { error: assignError } = await supabase
      .from("shipments")
      .update({ forwarder_id: forwarderId })
      .eq("id", quote.shipment_id);

    setLoading(false);

    if (assignError) {
      addToast("Shipment forwarder atanamadi.", "error");
      return;
    }

    addToast("Teklif secildi ve shipment guncellendi.", "success");
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleCreate}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <h3 className="text-lg font-semibold">Yeni teklif gir</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Shipment
            <select
              name="shipment_id"
              required
              value={shipmentId}
              onChange={(event) => setShipmentId(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seciniz</option>
              {shipments.map((shipment) => (
                <option key={shipment.id} value={shipment.id}>
                  {shipment.file_no}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Teklif tutari (USD)
            <input
              name="amount"
              placeholder="USD"
              required
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Konteyner boyutu
            <input
              name="container_size"
              placeholder="Orn: 20DC, 40HC"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Free time (gun)
            <input
              name="free_time_days"
              placeholder="Orn: 7"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Rota
            <select
              name="route_option"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seciniz</option>
              <option value="Suveys">Suveys</option>
              <option value="Umit Burnu">Umit Burnu</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Transit gun
            <input
              name="transit_days"
              placeholder="Orn: 18"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Gecerlilik tarihi
            <input
              type="date"
              name="valid_until"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-3">
            Not
            <input
              name="notes"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            disabled={loading}
            className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Teklifi kaydet
          </button>
        </div>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">Mevcut teklifler</h3>
          <span className="text-xs text-black/50">
            Toplam: {quotesState.length}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-black/10">
          {quotesState.length ? (
            <table className="w-full min-w-[1380px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.18em] text-black/55">
                  <th className="px-3 py-3">Shipment</th>
                  <th className="px-3 py-3">Kalkis limani</th>
                  <th className="px-3 py-3">Varis limani</th>
                  <th className="px-3 py-3">Tutar (USD)</th>
                  <th className="px-3 py-3">Konteyner</th>
                  <th className="px-3 py-3">Free time</th>
                  <th className="px-3 py-3">Rota</th>
                  <th className="px-3 py-3">Transit</th>
                  <th className="px-3 py-3">Gecerlilik</th>
                  <th className="px-3 py-3">Not</th>
                  <th className="px-3 py-3 text-right">Islem</th>
                </tr>
              </thead>
              <tbody>
                {quotesState.map((quote) => {
                  const isEditing = editId === quote.id;
                  const formId = `quote-form-${quote.id}`;
                  const validity = getValidityMeta(quote.valid_until);
                  return (
                    <tr
                      key={quote.id}
                      className={`border-t border-black/10 transition-colors hover:bg-black/[0.02] ${
                        quote.is_selected
                          ? "bg-emerald-50/60"
                          : "bg-white"
                      }`}
                    >
                      <td className="px-3 py-3 font-semibold">
                        {quote.shipment_id && hasShipment(quote.shipment_id) ? (
                          <Link
                            href={`/shipments/${quote.shipment_id}`}
                            className={`${badgeBaseClass} border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100`}
                          >
                            {getShipmentLabel(quote.shipment_id)}
                          </Link>
                        ) : (
                          <span className={`${badgeBaseClass} border-rose-200 bg-rose-50 text-rose-700`}>
                            {getShipmentLabel(quote.shipment_id)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`${badgeBaseClass} border-black/10 bg-slate-50 text-slate-700`}>
                          {getShipmentPort(quote.shipment_id, "origin_port")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`${badgeBaseClass} border-black/10 bg-slate-50 text-slate-700`}>
                          {getShipmentPort(quote.shipment_id, "destination_port")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            name="amount"
                            defaultValue={quote.amount ?? ""}
                            form={formId}
                            className="w-28 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span className={`${badgeBaseClass} border-emerald-200 bg-emerald-50 text-emerald-700`}>
                            {formatMoney(quote.amount, quote.currency ?? "USD")}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            name="container_size"
                            defaultValue={quote.container_size ?? ""}
                            form={formId}
                            className="w-28 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span
                            className={`${badgeBaseClass} ${getContainerBadgeClass(
                              quote.container_size
                            )}`}
                          >
                            {quote.container_size ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            name="free_time_days"
                            defaultValue={quote.free_time_days ?? ""}
                            form={formId}
                            className="w-20 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span className={`${badgeBaseClass} border-violet-200 bg-violet-50 text-violet-700`}>
                            {quote.free_time_days !== null &&
                            quote.free_time_days !== undefined
                              ? `${quote.free_time_days} gun`
                              : "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <select
                            name="route_option"
                            defaultValue={quote.route_option ?? ""}
                            form={formId}
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">-</option>
                            <option value="Suveys">Suveys</option>
                            <option value="Umit Burnu">Umit Burnu</option>
                          </select>
                        ) : (
                          <span
                            className={`${badgeBaseClass} ${getRouteBadgeClass(
                              quote.route_option
                            )}`}
                          >
                            {quote.route_option ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            name="transit_days"
                            defaultValue={quote.transit_days ?? ""}
                            form={formId}
                            className="w-20 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span className={`${badgeBaseClass} border-black/10 bg-white text-black/70`}>
                            {quote.transit_days ?? "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            type="date"
                            name="valid_until"
                            defaultValue={quote.valid_until ?? ""}
                            form={formId}
                            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span className={`${badgeBaseClass} ${validity.className}`}>
                            {validity.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            name="notes"
                            defaultValue={quote.notes ?? ""}
                            form={formId}
                            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                          />
                        ) : (
                          <span className="text-black/70">{quote.notes ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <form
                          id={formId}
                          onSubmit={(event) => handleUpdate(event, quote.id)}
                          className="flex flex-wrap justify-end gap-2"
                        >
                          {quote.is_selected ? (
                            <span className="rounded-full bg-[var(--ocean)] px-3 py-1 text-xs text-white">
                              Seçili
                            </span>
                          ) : null}
                          {isEditing ? (
                            <>
                              <button
                                disabled={loading}
                                form={formId}
                                className="rounded-full bg-[var(--ocean)] px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
                              >
                                Kaydet
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
                                onClick={() => setEditId(null)}
                              >
                                Iptal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold"
                                onClick={() => setEditId(quote.id)}
                              >
                                Düzenle
                              </button>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={() => handleDelete(quote.id)}
                                className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold disabled:opacity-60"
                              >
                                Sil
                              </button>
                              <button
                                type="button"
                                disabled={loading || !hasShipment(quote.shipment_id)}
                                onClick={() => handleSelect(quote)}
                                className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold disabled:opacity-60"
                              >
                                Sec
                              </button>
                            </>
                          )}
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz teklif yok.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


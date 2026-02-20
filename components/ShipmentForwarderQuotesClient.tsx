"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ToastProvider";

type Quote = {
  id: string;
  forwarder_id: string;
  forwarder_name?: string | null;
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

type Forwarder = { id: string; name: string | null };

type Props = {
  shipmentId: string;
  initialQuotes: Quote[];
  forwarders: Forwarder[];
};

const normalizeNumber = (value: FormDataEntryValue | null) => {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.replace(",", ".");
};

export default function ShipmentForwarderQuotesClient({ shipmentId, initialQuotes, forwarders }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const { addToast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const forwarderLabel = (id: string | null | undefined) =>
    forwarders.find((f) => f.id === id)?.name ?? "-";

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data, error } = await supabase
        .from("forwarder_quotes")
        .select(
          "id, forwarder_id, amount, currency, container_size, free_time_days, route_option, transit_days, valid_until, notes, is_selected, forwarders(name)"
        )
        .eq("shipment_id", shipmentId)
        .order("created_at", { ascending: false });
      if (!mounted) return;
      if (error) {
        addToast(`Teklifler okunamadi: ${error.message}`, "error");
        return;
      }
      setQuotes(
        (data ?? []).map((q) => ({
          ...q,
          forwarder_name: (q as any).forwarders?.name ?? null,
        }))
      );
    };
    load();
    return () => {
      mounted = false;
    };
  }, [shipmentId, supabase, addToast]);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    const fd = new FormData(event.currentTarget);
    const forwarder_id = String(fd.get("forwarder_id") ?? "");
    const amount = normalizeNumber(fd.get("amount"));
    if (!forwarder_id || !amount) {
      addToast("Forwarder ve tutar zorunlu.", "error");
      setLoading(false);
      return;
    }
    const payload = {
      shipment_id: shipmentId,
      forwarder_id,
      amount,
      currency: (fd.get("currency") as string | null) || "USD",
      container_size: fd.get("container_size") || null,
      free_time_days: normalizeNumber(fd.get("free_time_days")),
      route_option: fd.get("route_option") || null,
      transit_days: normalizeNumber(fd.get("transit_days")),
      valid_until: fd.get("valid_until") || null,
      notes: fd.get("notes") || null,
    };
    const { error } = await supabase.from("forwarder_quotes").insert(payload);
    setLoading(false);
    if (error) {
      addToast("Teklif eklenemedi.", "error");
      return;
    }
    (event.target as HTMLFormElement).reset();
    setEditId(null);
    addToast("Teklif eklendi.", "success");
    router.refresh();
  };

  const handleUpdate = async (quoteId: string, fd: FormData) => {
    setLoading(true);
    const { error } = await supabase
      .from("forwarder_quotes")
      .update({
        amount: normalizeNumber(fd.get("amount")),
        currency: (fd.get("currency") as string | null) || "USD",
        container_size: fd.get("container_size") || null,
        free_time_days: normalizeNumber(fd.get("free_time_days")),
        route_option: fd.get("route_option") || null,
        transit_days: normalizeNumber(fd.get("transit_days")),
        valid_until: fd.get("valid_until") || null,
        notes: fd.get("notes") || null,
      })
      .eq("id", quoteId);
    setLoading(false);
    if (error) {
      addToast("Teklif güncellenemedi.", "error");
      return;
    }
    setEditId(null);
    addToast("Teklif güncellendi.", "success");
    router.refresh();
  };

  const handleDelete = async (quoteId: string) => {
    setLoading(true);
    const { error } = await supabase.from("forwarder_quotes").delete().eq("id", quoteId);
    setLoading(false);
    if (error) {
      addToast("Teklif silinemedi.", "error");
      return;
    }
    addToast("Teklif silindi.", "success");
    router.refresh();
  };

  const handleSelect = async (quote: Quote) => {
    setLoading(true);
    const reset = await supabase
      .from("forwarder_quotes")
      .update({ is_selected: false })
      .eq("shipment_id", shipmentId);
    if (reset.error) {
      setLoading(false);
      addToast("Seçim yapılamadı.", "error");
      return;
    }
    const update = await supabase
      .from("forwarder_quotes")
      .update({ is_selected: true })
      .eq("id", quote.id);
    if (update.error) {
      setLoading(false);
      addToast("Seçim yapılamadı.", "error");
      return;
    }
    await supabase.from("shipments").update({ forwarder_id: quote.forwarder_id }).eq("id", shipmentId);
    setLoading(false);
    addToast("Teklif seçildi.", "success");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
            <tr className="border-b border-black/10">
              <th className="px-3 py-2">Forwarder</th>
              <th className="px-3 py-2">Tutar</th>
              <th className="px-3 py-2">Konteyner</th>
              <th className="px-3 py-2">Free time</th>
              <th className="px-3 py-2">Rota</th>
              <th className="px-3 py-2">Transit</th>
              <th className="px-3 py-2">Geçerlilik</th>
              <th className="px-3 py-2">Not</th>
              <th className="px-3 py-2 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => {
              const isEditing = editId === quote.id;
              const formId = `quote-${quote.id}`;
              return (
                <tr
                  key={quote.id}
                  className={`border-b border-black/5 ${quote.is_selected ? "bg-[var(--mint)]/40" : "bg-white"}`}
                >
                  <td className="px-3 py-2 font-semibold">
                    {forwarderLabel(quote.forwarder_id) ?? quote.forwarder_name ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <input
                          name="amount"
                          form={formId}
                          defaultValue={quote.amount ?? ""}
                          className="w-28 rounded-xl border border-black/10 px-3 py-1 text-sm"
                        />
                        <input
                          name="currency"
                          form={formId}
                          defaultValue={quote.currency ?? "USD"}
                          className="w-16 rounded-xl border border-black/10 px-2 py-1 text-sm"
                        />
                      </div>
                    ) : (
                      `${quote.amount ?? "-"} ${quote.currency ?? "USD"}`
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        name="container_size"
                        form={formId}
                        defaultValue={quote.container_size ?? ""}
                        className="w-24 rounded-xl border border-black/10 px-3 py-1 text-sm"
                      />
                    ) : (
                      quote.container_size ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        name="free_time_days"
                        form={formId}
                        defaultValue={quote.free_time_days ?? ""}
                        className="w-20 rounded-xl border border-black/10 px-3 py-1 text-sm"
                      />
                    ) : (
                      quote.free_time_days ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <select
                        name="route_option"
                        form={formId}
                        defaultValue={quote.route_option ?? ""}
                        className="rounded-xl border border-black/10 px-3 py-1 text-sm"
                      >
                        <option value="">-</option>
                        <option value="Suveys">Suveys</option>
                        <option value="Umit Burnu">Umit Burnu</option>
                      </select>
                    ) : (
                      quote.route_option ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        name="transit_days"
                        form={formId}
                        defaultValue={quote.transit_days ?? ""}
                        className="w-16 rounded-xl border border-black/10 px-3 py-1 text-sm"
                      />
                    ) : (
                      quote.transit_days ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        type="date"
                        name="valid_until"
                        form={formId}
                        defaultValue={quote.valid_until ?? ""}
                        className="rounded-xl border border-black/10 px-3 py-1 text-sm"
                      />
                    ) : (
                      quote.valid_until ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <input
                        name="notes"
                        form={formId}
                        defaultValue={quote.notes ?? ""}
                        className="w-full rounded-xl border border-black/10 px-3 py-1 text-sm"
                      />
                    ) : (
                      quote.notes ?? "-"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form
                      id={formId}
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleUpdate(quote.id, new FormData(e.currentTarget));
                      }}
                      className="inline-flex flex-wrap justify-end gap-2"
                    >
                      {quote.is_selected ? (
                        <span className="rounded-full bg-[var(--ocean)] px-3 py-1 text-[11px] text-white">Seçili</span>
                      ) : null}
                      {isEditing ? (
                        <>
                          <button
                            className="rounded-full bg-[var(--ocean)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-60"
                            disabled={loading}
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold"
                            onClick={() => setEditId(null)}
                          >
                            İptal
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold"
                            onClick={() => setEditId(quote.id)}
                          >
                            Düzenle
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold"
                            onClick={() => handleDelete(quote.id)}
                            disabled={loading}
                          >
                            Sil
                          </button>
                          <button
                            type="button"
                            className="rounded-full border border-black/20 px-3 py-1 text-[11px] font-semibold"
                            onClick={() => handleSelect(quote)}
                            disabled={loading}
                          >
                            Seç
                          </button>
                        </>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
            {!quotes.length ? (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-sm text-black/60">
                  Henüz teklif yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white/90 p-4">
        <h4 className="text-sm font-semibold">Yeni teklif ekle</h4>
        <form onSubmit={handleCreate} className="mt-3 grid gap-3 lg:grid-cols-3 text-sm">
          <input type="hidden" name="shipment_id" value={shipmentId} />
          <label className="flex flex-col gap-1">
            Forwarder
            <select name="forwarder_id" className="rounded-xl border border-black/10 px-3 py-2">
              <option value="">Seçiniz</option>
              {forwarders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name ?? "-"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Tutar
            <input name="amount" className="rounded-xl border border-black/10 px-3 py-2" placeholder="USD" />
          </label>
          <label className="flex flex-col gap-1">
            Para birimi
            <input name="currency" defaultValue="USD" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            Konteyner
            <input name="container_size" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            Free time (gün)
            <input name="free_time_days" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            Rota
            <select name="route_option" className="rounded-xl border border-black/10 px-3 py-2">
              <option value="">Seçiniz</option>
              <option value="Suveys">Suveys</option>
              <option value="Umit Burnu">Umit Burnu</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Transit (gün)
            <input name="transit_days" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1">
            Geçerlilik
            <input type="date" name="valid_until" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 lg:col-span-3">
            Not
            <input name="notes" className="rounded-xl border border-black/10 px-3 py-2" />
          </label>
          <div className="lg:col-span-3 flex justify-end">
            <button
              className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={loading}
            >
              {loading ? "Kaydediliyor..." : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


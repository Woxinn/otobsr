"use client";

import { useEffect, useState } from "react";

type InboxItem = {
  id: string;
  subject: string | null;
  from_email: string | null;
  received_at: string | null;
  policy_attachment_count: number | null;
  import_status: string | null;
  imported_order_id: string | null;
};

export default function InsuranceInboxImporter({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/insurance-mail/inbox", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Liste yuklenemedi");
      setItems(data.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Liste yuklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const importToOrder = async (mailId: string) => {
    setBusyId(mailId);
    setMessage(null);
    try {
      const res = await fetch("/api/insurance-mail/inbox/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mailId, orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? data?.reason ?? "Import basarisiz");
      setMessage(`Yuklendi: ${data.uploadedCount ?? 0} dosya`);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import basarisiz");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Gelen sigorta mailleri (yari-otomatik)</p>
        <button
          type="button"
          onClick={load}
          className="rounded-full border border-black/15 px-3 py-1 text-xs font-semibold"
        >
          Yenile
        </button>
      </div>
      <p className="mt-1 text-xs text-black/60">
        Konusunda sigorta gecen ve Police_ eki olan mailleri listeler. Istegin siparise manuel baglar.
      </p>

      {message ? <p className="mt-2 text-xs text-black/70">{message}</p> : null}

      <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-black/10">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--sand)]/70 text-left text-black/60">
            <tr>
              <th className="px-3 py-2">Konu</th>
              <th className="px-3 py-2">Ek</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2 text-right">Islem</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-black/10">
                <td className="px-3 py-2">
                  <div className="font-medium text-black">{item.subject ?? "-"}</div>
                  <div className="text-[11px] text-black/55">
                    {item.from_email ?? "-"} | {item.received_at ? new Date(item.received_at).toLocaleString("tr-TR") : "-"}
                  </div>
                </td>
                <td className="px-3 py-2">{item.policy_attachment_count ?? 0}</td>
                <td className="px-3 py-2">{item.import_status ?? "-"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={busyId === item.id || item.imported_order_id === orderId}
                    onClick={() => importToOrder(item.id)}
                    className="rounded-full border border-black/15 px-3 py-1 font-semibold disabled:opacity-50"
                  >
                    {busyId === item.id ? "Yukleniyor..." : "Bu siparise yukle"}
                  </button>
                </td>
              </tr>
            ))}
            {!items.length ? (
              <tr>
                <td className="px-3 py-4 text-black/55" colSpan={4}>
                  {loading ? "Yukleniyor..." : "Uygun mail bulunamadi."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

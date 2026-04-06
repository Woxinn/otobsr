"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { InsuranceFormPayload } from "@/lib/insurance-form";

type Props = {
  orderId: string;
  orderLabel: string;
  initialPayload: InsuranceFormPayload;
  presets: Array<{ label: string; emails: string[] }>;
};

const fieldLabels: Array<{ key: keyof InsuranceFormPayload; label: string }> = [
  { key: "requestDate", label: "Talep tarihi" },
  { key: "insuredCompanyName", label: "Sigortali adi / unvani" },
  { key: "insuredAddress", label: "Adresi" },
  { key: "taxNo", label: "Vergi no" },
  { key: "mortgagee", label: "Daimi murtehin" },
  { key: "consignmentNo", label: "Konsimento no" },
  { key: "flotanNo", label: "Flotan no" },
  { key: "goodsValue", label: "Emtea bedeli" },
  { key: "lcNo", label: "Akreditif no" },
  { key: "goodsDescription", label: "Emtea cinsi" },
  { key: "goodsQtyTonnage", label: "Emtea adet/tonaji" },
  { key: "startLocation", label: "S. baslangic yeri" },
  { key: "vehicleDetail", label: "Vasita cinsi / detayi" },
  { key: "endLocation", label: "S. bitis yeri" },
  { key: "departureDate", label: "Cikis tarihi" },
  { key: "arrivalDate", label: "Varis tarihi (tahmini)" },
  { key: "insurancePrice", label: "Sigorta bedeli" },
];

export default function InsuranceMailComposer({
  orderId,
  orderLabel,
  initialPayload,
  presets,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<InsuranceFormPayload>(initialPayload);
  const [emailsText, setEmailsText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentEmails, setSentEmails] = useState<string[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const recipientPreview = useMemo(
    () =>
      Array.from(
        new Set(
          emailsText
            .split(/[,\n;]+/)
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
        )
      ),
    [emailsText]
  );

  const addPreset = (emails: string[]) => {
    const merged = Array.from(new Set([...recipientPreview, ...emails]));
    setEmailsText(merged.join(", "));
  };

  const onSend = async () => {
    if (sending) return;
    setError(null);
    setSending(true);
    const recipientsToSend = [...recipientPreview];
    try {
      const res = await fetch(`/api/orders/${orderId}/insurance-mail/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: recipientsToSend,
          form,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "E-posta gonderimi basarisiz.");
      } else {
        setSentEmails(recipientsToSend);
        setShowSuccessModal(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bilinmeyen hata");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-black/45">Sigorta e-posta hazirligi</p>
          <h2 className="text-2xl font-semibold text-black">{orderLabel}</h2>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/orders/${orderId}`)}
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Siparise don
        </button>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        {presets.length ? (
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/50">Hazir alicilar</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => addPreset(preset.emails)}
                  className="rounded-full border border-black/15 bg-[var(--sky)]/40 px-3 py-1 text-xs font-semibold text-black/75"
                >
                  {preset.label} ({preset.emails.length})
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="block text-sm font-medium text-black/70">
          Alici e-posta adresleri (virgul, satir sonu veya noktalivirgul)
          <textarea
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
            rows={3}
            placeholder="sigortaci@firma.com, operasyon@firma.com"
          />
        </label>
        <p className="mt-2 text-xs text-black/55">Alici sayisi: {recipientPreview.length}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {fieldLabels.map((field) => (
          <label key={field.key} className="text-sm font-medium text-black/70">
            {field.label}
            <input
              value={form[field.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
              className="mt-2 w-full rounded-xl border border-black/10 px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {error ? <p className="text-red-600">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={onSend}
          disabled={sending || recipientPreview.length === 0}
          className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Gonderiliyor..." : "E-posta gonder"}
        </button>
      </div>

      {showSuccessModal ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-black/10 bg-white p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.6)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-2xl font-bold text-emerald-700">✓</span>
            </div>
            <p className="text-center text-xs uppercase tracking-[0.2em] text-black/45">Gonderim basarili</p>
            <h3 className="mt-1 text-center text-2xl font-semibold text-black">E-posta iletildi</h3>
            <p className="mt-2 text-center text-sm text-black/65">
              Toplam <strong>{sentEmails.length}</strong> aliciya gonderildi.
            </p>
            <div className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-black/10 bg-[var(--paper)]/70 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-black/50">Gonderilen adresler</p>
              <ul className="space-y-1.5 text-sm text-black/75">
                {sentEmails.map((email) => (
                  <li key={email} className="rounded-lg border border-black/10 bg-white px-3 py-2">
                    {email}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/75"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

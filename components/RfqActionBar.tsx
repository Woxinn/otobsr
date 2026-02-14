"use client";

type Props = {
  rfqId: string;
  status: string;
};

const statusFlow = [
  { key: "draft", label: "Taslak" },
  { key: "sent", label: "Gönderildi" },
  { key: "waiting", label: "Yanıt bekleniyor" },
  { key: "answered", label: "Yanıtlandı" },
  { key: "closed", label: "Kapatıldı" },
];

export default function RfqActionBar({ rfqId, status }: Props) {
  const setStatus = async (next: string) => {
    await fetch("/api/rfq/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rfqId, status: next }),
    });
    window.location.reload();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
      {statusFlow.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setStatus(s.key)}
          className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
            status === s.key
              ? "bg-[var(--ocean)] text-white"
              : "border border-black/15 bg-black/5 text-black/70 hover:border-[var(--ocean)]/40"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

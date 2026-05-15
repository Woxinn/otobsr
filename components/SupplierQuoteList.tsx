"use client";

type SupplierRow = {
  id: string;
  name: string;
  hasQuote?: boolean;
  isSelected?: boolean;
  quoteId?: string | null;
};

export default function SupplierQuoteList({
  rfqId,
  suppliers,
  readOnly = false,
  onWinnerChange,
}: {
  rfqId: string;
  suppliers: SupplierRow[];
  readOnly?: boolean;
  onWinnerChange?: () => void;
}) {
  const handleDelete = async (supplierId: string) => {
    const ok = window.confirm("Bu tedarikcinin tum tekliflerini silmek istiyor musun?");
    if (!ok) return;
    try {
      await fetch("/api/rfq/quote", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfq_id: rfqId, supplier_id: supplierId }),
      });
      window.location.reload();
    } catch (e) {
      console.error("[supplier-quote-delete]", e);
      alert("Silme sirasinda hata olustu");
    }
  };

  if (!suppliers?.length) return <div className="text-sm text-black/40">Tanimli tedarikci yok</div>;

  return (
    <ul className="space-y-2 text-sm text-black/80">
      {suppliers.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 transition ${
            s.isSelected ? "border-emerald-200 bg-emerald-50" : "border-black/10 bg-slate-50 hover:bg-white"
          }`}
        >
          <div className="min-w-0">
            <span className="block truncate font-semibold">{s.name}</span>
            <span className="text-[11px] text-black/45">{s.id.slice(0, 8).toUpperCase()}</span>
          </div>
          {s.hasQuote ? (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={readOnly}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                  s.isSelected
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border border-black/10 bg-white text-black/70 hover:border-emerald-300 hover:text-emerald-700"
                } ${readOnly ? "pointer-events-none opacity-70" : ""}`}
                onClick={async () => {
                  if (readOnly || s.isSelected) return;
                  const res = await fetch("/api/rfq/select-winner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rfq_id: rfqId, supplier_id: s.id }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    alert(data?.error ?? "Secilemedi");
                    return;
                  }
                  onWinnerChange?.();
                  if (typeof window !== "undefined") window.location.reload();
                }}
              >
                {s.isSelected ? "Kazanan" : "Kazanan yap"}
              </button>
              {!readOnly ? (
                <button
                  type="button"
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                  onClick={() => handleDelete(s.id)}
                >
                  Teklifleri sil
                </button>
              ) : null}
            </div>
          ) : (
            <span className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black/45 ring-1 ring-black/10">
              Teklif yok
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

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
  onWinnerChange,
}: {
  rfqId: string;
  suppliers: SupplierRow[];
  onWinnerChange?: () => void;
}) {
  const handleDelete = async (supplierId: string) => {
    const ok = window.confirm("Bu tedarikçinin tüm tekliflerini silmek istiyor musun?");
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
      alert("Silme sırasında hata oluştu");
    }
  };

  if (!suppliers?.length) return <div className="text-black/40 text-sm">Tanımlı tedarikçi yok</div>;

  return (
    <ul className="space-y-2 text-sm text-black/80">
      {suppliers.map((s) => (
        <li
          key={s.id}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
            s.isSelected ? "border-[var(--ocean)] bg-[var(--ocean)]/10" : "border-black/5 bg-black/5"
          }`}
        >
          <div className="flex flex-col">
            <span className="font-semibold">{s.name}</span>
            <span className="text-xs text-black/50">{s.id}</span>
          </div>
          {s.hasQuote ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  s.isSelected
                    ? "border border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border border-black/10 bg-white text-black/70 hover:border-[var(--ocean)] hover:text-[var(--ocean)]"
                }`}
                onClick={async () => {
                  if (s.isSelected) return;
                  const res = await fetch("/api/rfq/select-winner", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ rfq_id: rfqId, supplier_id: s.id }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    alert(data?.error ?? "Seçilemedi");
                    return;
                  }
                  onWinnerChange?.();
                  if (typeof window !== "undefined") window.location.reload();
                }}
              >
                {s.isSelected ? "Kazanan" : "Kazanan yap"}
              </button>
              <button
                type="button"
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                onClick={() => handleDelete(s.id)}
              >
                Teklifleri sil
              </button>
            </div>
          ) : (
            <span className="rounded-full bg-black/5 px-3 py-1 text-[11px] text-black/50">Teklif yok</span>
          )}
        </li>
      ))}
    </ul>
  );
}

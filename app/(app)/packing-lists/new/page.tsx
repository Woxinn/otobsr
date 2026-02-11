// FEATURE: packing-list/import
import Link from "next/link";

export default function PackingListImportPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">Packing list</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Import (beta)</h1>
          <p className="text-sm text-black/60">
            Packing list dosyasını yükleyin, ürün ve kutu bilgilerini eşleştirin. (Şimdilik önizleme; işlem yapılmaz.)
          </p>
        </div>
        <Link
          href="/packing-lists"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye dön
        </Link>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-black/70 mb-3">Dosya yükle</p>
        <form className="space-y-4">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="block w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm"
          />
          <div className="rounded-2xl border border-dashed border-black/15 bg-[var(--sand)] px-4 py-3 text-xs text-black/60">
            Bu form henüz yalnızca taslak. Dosya seçimi önizleme amaçlı; sunucuya kaydedilmez. Eşleştirme sihirbazı eklenecek.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
            >
              Önizleme (yakında)
            </button>
            <button
              type="button"
              className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold text-black/70"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
// END FEATURE: packing-list/import

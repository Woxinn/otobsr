import Link from "next/link";
import { createGtip } from "@/app/actions/gtips";

export default function NewGtipPage() {
  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">GTIP</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">Yeni GTIP</h1>
        </div>
        <Link
          href="/gtips"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye dön
        </Link>
      </div>

      <form action={createGtip} className="space-y-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">
            Kod *
            <input
              required
              name="code"
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
              placeholder="Örn: 8482.10.90"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-1">
            Açıklama
            <input
              name="description"
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
              placeholder="Kısa açıklama"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            GV (%)
            <input
              name="customs_duty_rate"
              type="number"
              step="0.01"
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            İlave GV (%)
            <input
              name="additional_duty_rate"
              type="number"
              step="0.01"
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            KDV (%)
            <input
              name="vat_rate"
              type="number"
              step="0.01"
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="anti_dumping_applicable" className="h-4 w-4" />
            Anti-dumping var
          </label>
          <input
            name="anti_dumping_rate"
            type="number"
            step="0.0001"
            placeholder="Tutar/kg"
            className="w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" name="surveillance_applicable" className="h-4 w-4" />
            Gözetim var
          </label>
          <input
            name="surveillance_unit_value"
            type="number"
            step="0.0001"
            placeholder="Tutar/kg"
            className="w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>

        <div className="pt-2">
          <button className="rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white">
            Kaydet
          </button>
        </div>
      </form>
    </section>
  );
}

import { createShipment } from "@/app/actions/shipments";
import { getCurrentUserRole, canEdit } from "@/lib/roles";

export default async function NewShipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const resolvedParams = await searchParams;
  const { role } = await getCurrentUserRole();
  const canEditPage = canEdit(role);
  if (!canEditPage) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/70 shadow-sm">
        Bu sayfayi duzenleme yetkiniz yok.
      </section>
    );
  }
  const errorMessage =
    resolvedParams.error === "dosya-no"
      ? "Dosya No zorunludur."
      : resolvedParams.error === "dosya-no-unique"
      ? "Bu Dosya No zaten kullaniliyor."
      : null;

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Yeni shipment
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Dosya kaydi olustur
        </h2>
      </div>

      <form
        action={createShipment}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">
            Dosya No (zorunlu)
            <input
              name="file_no"
              required
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Konşimento No
            <input
              name="reference"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Etiketler (virgul ile)
            <input
              name="tags"
              placeholder="acil, problemli"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Genel not
            <textarea
              name="notes"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        {errorMessage ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}
        <button className="mt-6 rounded-full bg-[var(--ocean)] px-5 py-2 text-sm font-semibold text-white">
          Kaydi olustur
        </button>
      </form>
    </section>
  );
}

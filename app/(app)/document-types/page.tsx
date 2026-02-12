import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createDocumentType,
  updateDocumentType,
} from "@/app/actions/master-data";

export default async function DocumentTypesPage() {
  const supabase = await createSupabaseServerClient();
  const { data: types } = await supabase
    .from("document_types")
    .select("*")
    .order("name");

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-black/40">
          Evrak tipleri
        </p>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
          Checklist tanimlari
        </h2>
      </div>

      <form
        action={createDocumentType}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <h3 className="text-lg font-semibold">Yeni evrak tipi</h3>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <input
            name="code"
            placeholder="Kod (CO, BEYANNAME, PROFORMA)"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <input
            name="name"
            placeholder="Evrak adi (BL, CI, PL)"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          <select
            name="applies_to"
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            defaultValue="order"
          >
            <option value="order">Siparis</option>
            <option value="shipment">Shipment</option>
          </select>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_required" />
            Zorunlu
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_critical" />
            Kritik
          </label>
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
          Kaydet
        </button>
      </form>

      <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Mevcut evrak tipleri</h3>
        <div className="mt-4 space-y-3 text-sm">
          {types?.length ? (
            types.map((type) => (
              <form
                key={type.id}
                action={updateDocumentType}
                className="grid gap-3 rounded-2xl border border-black/10 bg-[var(--sky)] p-4 lg:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <input type="hidden" name="id" value={type.id} />
                <input
                  name="code"
                  defaultValue={type.code ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <input
                  name="name"
                  defaultValue={type.name ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                />
                <select
                  name="applies_to"
                  defaultValue={type.applies_to ?? ""}
                  className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs"
                >
                  <option value="">-</option>
                  <option value="order">Siparis</option>
                  <option value="shipment">Shipment</option>
                </select>
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_required"
                      defaultChecked={type.is_required ?? false}
                    />
                    Zorunlu
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_critical"
                      defaultChecked={type.is_critical ?? false}
                    />
                    Kritik
                  </label>
                </div>
                <button className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold">
                  Güncelle
                </button>
              </form>
            ))
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henüz evrak tipi yok.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



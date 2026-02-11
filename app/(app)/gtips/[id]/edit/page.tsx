import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateGtip } from "@/app/actions/gtips";
import CountrySelect from "@/components/CountrySelect";

const boolToChecked = (val: boolean | null | undefined) => (!!val ? true : false);

export default async function EditGtipPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: gtip } = await supabase
    .from("gtips")
    .select("*")
    .eq("id", id)
    .single();

  if (!gtip) notFound();

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">GTIP</p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {gtip.code} düzenle
          </h1>
        </div>
        <Link
          href={`/gtips/${gtip.id}`}
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Detaya dön
        </Link>
      </div>

      <form action={updateGtip} className="space-y-4 rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <input type="hidden" name="id" value={gtip.id} />
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="text-sm font-medium">
            Kod *
            <input
              required
              name="code"
              defaultValue={gtip.code ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-1">
            Açıklama
            <input
              name="description"
              defaultValue={gtip.description ?? ""}
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
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
              defaultValue={gtip.customs_duty_rate ?? 0}
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            İlave GV (%)
            <input
              name="additional_duty_rate"
              type="number"
              step="0.01"
              defaultValue={gtip.additional_duty_rate ?? 0}
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            KDV (%)
            <input
              name="vat_rate"
              type="number"
              step="0.01"
              defaultValue={gtip.vat_rate ?? 0}
              className="mt-2 w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
            />
          </label>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="anti_dumping_applicable"
              defaultChecked={boolToChecked(gtip.anti_dumping_applicable)}
              className="h-4 w-4"
            />
            Anti-dumping var
          </label>
          <input
            name="anti_dumping_rate"
            type="number"
            step="0.0001"
            defaultValue={gtip.anti_dumping_rate ?? 0}
            placeholder="Tutar/kg"
            className="w-full rounded-2xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="surveillance_applicable"
              defaultChecked={boolToChecked(gtip.surveillance_applicable)}
              className="h-4 w-4"
            />
            Gözetim var
          </label>
          <input
            name="surveillance_unit_value"
            type="number"
            step="0.0001"
            defaultValue={gtip.surveillance_unit_value ?? 0}
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

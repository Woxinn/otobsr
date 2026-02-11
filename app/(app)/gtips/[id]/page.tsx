import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ConfirmActionForm from "@/components/ConfirmActionForm";
import {
  deleteGtipCountryRate,
  upsertGtipCountryRate,
} from "@/app/actions/gtip-country-rates";

export default async function GtipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: gtipId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: gtip, error } = await supabase
    .from("gtips")
    .select("*")
    .eq("id", gtipId)
    .maybeSingle();
  if (error || !gtip) notFound();

  const { data: countryRates } = await supabase
    .from("gtip_country_rates")
    .select(
      "id, country, customs_duty_rate, additional_duty_rate, anti_dumping_applicable, anti_dumping_rate, surveillance_applicable, surveillance_unit_value, vat_rate"
    )
    .eq("gtip_id", gtipId)
    .order("country");

  const { data: products } = await supabase
    .from("products")
    .select("id, code, name, unit_price, netsis_stok_kodu, product_types(name)")
    .eq("gtip_id", gtipId)
    .order("code");

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
            GTIP detay
          </p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
            {gtip.code}
          </h1>
          <p className="text-sm text-black/60">{gtip.description ?? "Açıklama yok"}</p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/gtips/${gtip.id}/edit`}
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Düzenle
          </Link>
          <Link
            href="/gtips"
            className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
          >
            Listeye dön
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Oranlar</h3>
          <dl className="mt-3 space-y-1 text-sm text-black/70">
            <div className="flex justify-between">
              <dt>Gümrük vergisi</dt>
              <dd>{gtip.customs_duty_rate ?? 0}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>İlave GV</dt>
              <dd>{gtip.additional_duty_rate ?? 0}%</dd>
            </div>
            <div className="flex justify-between">
              <dt>Dumping</dt>
              <dd>
                {gtip.anti_dumping_applicable
                  ? `${gtip.anti_dumping_rate ?? 0} /kg`
                  : "Yok"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Gözetim</dt>
              <dd>
                {gtip.surveillance_applicable
                  ? `${gtip.surveillance_unit_value ?? 0} /kg`
                  : "Yok"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>KDV</dt>
              <dd>{gtip.vat_rate ?? 0}%</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Ülkeye göre oran ekle</h3>
          <form action={upsertGtipCountryRate} className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <input type="hidden" name="gtip_id" value={gtip.id} />
            <input
              name="country"
              placeholder="Ülke (örn. TR)"
              className="col-span-2 rounded-xl border border-black/10 px-3 py-2"
              required
            />
            <label className="flex items-center gap-2">
              GV %
              <input
                name="customs_duty_rate"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-black/10 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              İlave GV %
              <input
                name="additional_duty_rate"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-black/10 px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              Dumping /kg
              <input
                name="anti_dumping_rate"
                type="number"
                step="0.001"
                className="w-full rounded-xl border border-black/10 px-2 py-1"
              />
              <input type="checkbox" name="anti_dumping_applicable" className="h-4 w-4" />
            </label>
            <label className="flex items-center gap-2">
              Gözetim /kg
              <input
                name="surveillance_unit_value"
                type="number"
                step="0.001"
                className="w-full rounded-xl border border-black/10 px-2 py-1"
              />
              <input type="checkbox" name="surveillance_applicable" className="h-4 w-4" />
            </label>
            <label className="flex items-center gap-2">
              KDV %
              <input
                name="vat_rate"
                type="number"
                step="0.01"
                className="w-full rounded-xl border border-black/10 px-2 py-1"
              />
            </label>
            <div className="col-span-2">
              <button
                type="submit"
                className="rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white"
              >
                Kaydet
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Ülke bazlı GTIP oranları</h3>
        <div className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-slate-50 to-white shadow-inner">
          <table className="min-w-full text-xs text-black/70">
            <thead className="bg-[var(--sky)]/30 text-left text-[11px] uppercase tracking-[0.2em] text-black/60">
              <tr>
                <th className="py-2 pl-3 pr-2">Ülke</th>
                <th className="py-2 pr-2 text-right">GV %</th>
                <th className="py-2 pr-2 text-right">İlave GV %</th>
                <th className="py-2 pr-2 text-right">Dumping</th>
                <th className="py-2 pr-2 text-right">Gözetim</th>
                <th className="py-2 pr-3 text-right">KDV %</th>
                <th className="py-2 pr-3 text-right">Sil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {countryRates?.length ? (
                countryRates.map((r) => (
                  <tr key={r.id} className="hover:bg-[rgba(15,61,62,0.03)] transition">
                    <td className="py-2 pl-3 pr-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--sand)] px-2 py-1 font-semibold text-black/80">
                        {r.country ?? "Genel"}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold">{r.customs_duty_rate ?? 0}</td>
                    <td className="py-2 pr-2 text-right font-semibold">{r.additional_duty_rate ?? 0}</td>
                    <td className="py-2 pr-2 text-right">
                      {r.anti_dumping_applicable ? r.anti_dumping_rate ?? 0 : "-"}
                    </td>
                    <td className="py-2 pr-2 text-right">
                      {r.surveillance_applicable ? r.surveillance_unit_value ?? 0 : "-"}
                    </td>
                    <td className="py-2 pr-3 text-right font-semibold">{r.vat_rate ?? 0}</td>
                    <td className="py-2 pr-3 text-right">
                      <ConfirmActionForm
                        action={deleteGtipCountryRate}
                        confirmText="Bu oran kaydi silinsin mi?"
                        buttonText="Sil"
                        className="inline"
                      >
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="gtip_id" value={gtip.id} />
                      </ConfirmActionForm>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-3 pl-3 text-black/50" colSpan={7}>
                    Bu GTIP için ülke bazlı kayıt yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Bağlı ürünler</h3>
        <div className="mt-3 overflow-auto max-h-80">
          <table className="min-w-full text-xs text-black/70">
            <thead className="text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
              <tr>
                <th className="py-2 pr-2">Kod</th>
                <th className="py-2 pr-2">Ad</th>
                <th className="py-2 pr-2">Tip</th>
                <th className="py-2 pr-2 text-right">Fiyat</th>
                <th className="py-2 pr-2">Netsis</th>
                <th className="py-2 pr-2 text-right">Detay</th>
                <th className="py-2 pr-2 text-right">Maliyet</th>
              </tr>
            </thead>
            <tbody>
              {products?.length ? (
                products.map((p) => (
                  <tr key={p.id} className="border-b border-black/5">
                    <td className="py-1 pr-2 font-semibold">{p.code}</td>
                    <td className="py-1 pr-2">{p.name}</td>
                    <td className="py-1 pr-2">{(p as any).product_types?.name ?? "-"}</td>
                    <td className="py-1 pr-2 text-right">
                      {p.unit_price !== null && p.unit_price !== undefined
                        ? Number(p.unit_price).toLocaleString("tr-TR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "-"}
                    </td>
                    <td className="py-1 pr-2">{p.netsis_stok_kodu ?? "-"}</td>
                    <td className="py-1 pr-2 text-right">
                      <Link
                        href={`/products/${p.id}`}
                        className="rounded-full border border-black/15 px-2 py-1 text-[11px] font-semibold text-black/70"
                      >
                        Detay
                      </Link>
                    </td>
                    <td className="py-1 pr-2 text-right">
                      <Link
                        href={`/products/${p.id}/costs`}
                        className="rounded-full border border-black/15 px-2 py-1 text-[11px] font-semibold text-black/70"
                      >
                        Maliyet
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="py-2 text-black/50" colSpan={7}>
                    Bu GTIP ile ilişkilendirilmiş ürün yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

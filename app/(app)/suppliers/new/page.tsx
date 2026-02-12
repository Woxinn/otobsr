import Link from "next/link";
import { createSupplier } from "@/app/actions/master-data";
import CountrySelect from "@/components/CountrySelect";

export default function SupplierCreatePage() {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            Tedarikçi olustur
          </p>
          <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Yeni tedarikci
          </h2>
        </div>
        <Link
          href="/suppliers"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Listeye don
        </Link>
      </div>

      <form
        action={createSupplier}
        className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-medium">
            Tedarikçi adi
            <input
              name="name"
              placeholder="Tedarikçi adi"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Yetkili kisi
            <input
              name="contact_name"
              placeholder="Yetkili kisi"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            E-posta
            <input
              name="email"
              placeholder="E-posta"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Telefon
            <input
              name="phone"
              placeholder="Telefon"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Ulke
            <CountrySelect
              name="country"
              placeholder="Ãœlke seÃ§ veya yaz"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Sehir
            <input
              name="city"
              placeholder="Sehir"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-2">
            Adres
            <input
              name="address"
              placeholder="Adres"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium">
            Vergi no
            <input
              name="tax_no"
              placeholder="Vergi no"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-medium lg:col-span-3">
            Not
            <input
              name="notes"
              placeholder="Not"
              className="mt-2 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </label>
        </div>
        <button className="mt-4 rounded-full bg-[var(--ocean)] px-4 py-2 text-sm font-semibold text-white">
          Kaydet
        </button>
      </form>
    </section>
  );
}


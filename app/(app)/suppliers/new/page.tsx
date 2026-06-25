import Link from "next/link";
import { createSupplier } from "@/app/actions/master-data";
import { ArrowLeft, Plus } from "lucide-react";
import CountrySelect from "@/components/CountrySelect";
import SubmitButton from "@/components/SubmitButton";

export default function SupplierCreatePage() {
  return (
    <section className="space-y-6 animate-fade-up">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-black/8 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-black/45">
              Tedarikçi Oluştur
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-800 [font-family:var(--font-display)]">
              Yeni Tedarikçi Tanımla
            </h1>
            <p className="mt-1.5 text-xs text-slate-500 font-medium">
              Sisteme yeni bir üretici veya tedarikçi ekleyerek RFQ ve Proforma süreçlerini başlatın.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <Link
              href="/suppliers"
              className="inline-flex items-center gap-1.5 rounded-xl border border-black/15 bg-white px-4 py-2.5 text-black/70 hover:bg-slate-50 hover:border-black/30 transition shadow-2xs"
            >
              <ArrowLeft size={14} className="text-black/50" /> İletişim Listesi
            </Link>
          </div>
        </div>
      </div>

      {/* Form Container */}
      <div className="rounded-2xl border border-black/8 bg-white/90 p-5 shadow-sm space-y-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-black/35">
            Firma Kayıt Kartı
          </p>
          <h3 className="text-lg font-semibold text-slate-800">Tedarikçi Detayları</h3>
        </div>

        <form action={createSupplier} className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tedarikçi Adı</label>
              <input
                name="name"
                placeholder="Firma adı"
                required
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Yetkili Kişi</label>
              <input
                name="contact_name"
                placeholder="Ad Soyad"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-posta Adresi</label>
              <input
                name="email"
                type="email"
                placeholder="contact@company.com"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Telefon Numarası</label>
              <input
                name="phone"
                placeholder="+90 5xx..."
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ülke</label>
              <CountrySelect
                name="country"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Şehir</label>
              <input
                name="city"
                placeholder="Şehir"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Açık Adres</label>
              <input
                name="address"
                placeholder="Açık adres detayları..."
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vergi Numarası / Vergi Dairesi</label>
              <input
                name="tax_no"
                placeholder="Vergi no"
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs"
              />
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Notlar / Dahili Açıklama</label>
              <textarea
                name="notes"
                placeholder="Firma hakkında ek notlar..."
                rows={3}
                className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-black/30 transition shadow-2xs resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end border-t border-black/5 pt-4">
            <SubmitButton
              className="inline-flex items-center gap-1.5 rounded-xl bg-black px-6 py-2.5 text-xs font-bold text-white hover:bg-black/90 transition shadow-sm cursor-pointer"
              pendingLabel={<><Plus size={14} /> Kaydediliyor...</>}
            >
              <Plus size={14} /> Tedarikçiyi Kaydet
            </SubmitButton>
          </div>
        </form>
      </div>
    </section>
  );
}

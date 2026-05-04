// FEATURE: product-type-compliance UI
import Link from "next/link";
import {
  createProductType,
  deleteProductType,
  createCompliance,
  deleteCompliance,
  updateCompliance,
  extendComplianceValidTo,
  syncTypesFromAttributes,
  upsertTypeFromTipValue,
} from "@/app/actions/product-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProductTypesImportForm from "@/components/ProductTypesImportForm";
import ConfirmActionForm from "@/components/ConfirmActionForm";

export default async function ProductTypesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();

  const fetchAll = async (table: string, selectStr: string) => {
    const batchSize = 1000;
    let from = 0;
    const rows: any[] = [];
    while (true) {
      const { data, error } = await supabase
        .from(table)
        .select(selectStr)
        .range(from, from + batchSize - 1);
      if (error) {
        console.error("product-types fetchAll error", { table, error });
        break;
      }
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < batchSize) break;
      from += batchSize;
    }
    return rows;
  };

  const { data: types } = await supabase
    .from("product_types")
    .select(
      "id, name, product_type_compliance(id, country, tse_status, analiz_gecerlilik, tareks_no, rapor_no, valid_from, valid_to)"
    )
    .order("name");

  // Algılanan tip değerleri (nitelikler + ekstra nitelikler)
  const detectedAttrRows = await fetchAll(
    "product_attribute_values",
    "product_id, value_text, value_number, attribute:product_attributes(name)"
  );
  const detectedExtraRows = await fetchAll(
    "product_extra_attributes",
    "product_id, name, value_text, value_number"
  );

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/ü/g, "u")
      .replace(/ö/g, "o")
      .replace(/ı/g, "i")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .replace(/ç/g, "c");

  const tipSet = new Map<string, string>(); // lower -> display
  const collectTip = (name: string | null, val: string | null) => {
    if (!name || !val) return;
    const normName = normalize(name);
    // Yalnızca tip/type içeren alanlar; uzunluk/boy/genişlik vs. olanları alma
    if (!normName.includes("tip") && !normName.includes("type")) return;
    if (
      normName.includes("uzun") ||
      normName.includes("length") ||
      normName.includes("boy") ||
      normName.includes("genis") ||
      normName.includes("eni") ||
      normName.includes("agir") ||
      normName.includes("ağırlık") ||
      normName.includes("weight") ||
      normName.includes("kg")
    )
      return;
    const trimmed = val.trim();
    if (!trimmed) return;
    tipSet.set(trimmed.toLowerCase(), trimmed);
  };

  (detectedAttrRows ?? []).forEach((row: any) => {
    const attrName = row.attribute?.name ?? "";
    const val =
      row.value_text ??
      (row.value_number !== null && row.value_number !== undefined
        ? String(row.value_number)
        : "");
    collectTip(attrName, val);
  });
  (detectedExtraRows ?? []).forEach((row: any) => {
    const val =
      row.value_text ??
      (row.value_number !== null && row.value_number !== undefined
        ? String(row.value_number)
        : "");
    collectTip(row.name ?? "", val);
  });

  // Mevcut product_types içindeki adları da ekle (tekrar yok)
  (types ?? []).forEach((t: any) => {
    if (!t?.name) return;
    const trimmed = String(t.name).trim();
    if (!trimmed) return;
    tipSet.set(trimmed.toLowerCase(), trimmed);
  });

  const detectedTips = Array.from(tipSet.values()).sort((a, b) =>
    a.localeCompare(b, "tr")
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const addDays = (d: Date, n: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const soonLimit = addDays(today, 30);

  const getComplianceStatus = (c: any): "active" | "expiring" | "expired" | "undated" => {
    const from = c?.valid_from ? new Date(c.valid_from) : null;
    const to = c?.valid_to ? new Date(c.valid_to) : null;
    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(0, 0, 0, 0);
    if (!from && !to) return "undated";
    if (from && from > today) return "expired";
    if (to && to < today) return "expired";
    if (to && to >= today && to <= soonLimit) return "expiring";
    return "active";
  };

  const allComplianceRows = (types ?? []).flatMap(
    (t: any) => (t.product_type_compliance ?? []).map((c: any) => ({ ...c, _typeName: t.name }))
  );
  const totalCompliance = allComplianceRows.length;
  const activeCompliance = allComplianceRows.filter((c: any) => getComplianceStatus(c) === "active").length;
  const expiringCompliance = allComplianceRows.filter((c: any) => getComplianceStatus(c) === "expiring").length;
  const expiredCompliance = allComplianceRows.filter((c: any) => getComplianceStatus(c) === "expired").length;
  const undatedCompliance = allComplianceRows.filter((c: any) => getComplianceStatus(c) === "undated").length;

  const allCountries = new Set(
    allComplianceRows
      .map((c: any) => String(c.country ?? "").trim())
      .filter(Boolean)
      .map((v) => v.toLowerCase())
  );
  const typesWithNoCompliance = (types ?? []).filter(
    (t: any) => !(t.product_type_compliance ?? []).length
  ).length;

  const selectedStatus = String(resolvedSearchParams.status ?? "all");
  const searchQ = String(resolvedSearchParams.q ?? "").trim().toLowerCase();
  const statusFilters = [
    { key: "all", label: "Tum kayitlar" },
    { key: "active", label: "Sadece aktif" },
    { key: "expiring", label: "30 gunde bitecek" },
    { key: "expired", label: "Suresi gecmis" },
    { key: "undated", label: "Tarihsiz" },
    { key: "no-compliance", label: "Kayitsiz tipler" },
  ];

  const filteredTypes = (types ?? []).filter((type: any) => {
    const rows = type.product_type_compliance ?? [];
    const byStatus =
      selectedStatus === "all"
        ? true
        : selectedStatus === "no-compliance"
        ? rows.length === 0
        : rows.some((c: any) => getComplianceStatus(c) === selectedStatus);
    if (!byStatus) return false;
    if (!searchQ) return true;
    const inType = String(type.name ?? "").toLowerCase().includes(searchQ);
    const inRows = rows.some((c: any) => {
      const text = [
        c.country,
        c.tse_status,
        c.analiz_gecerlilik,
        c.tareks_no,
        c.rapor_no,
      ]
        .map((v: any) => String(v ?? "").toLowerCase())
        .join(" ");
      return text.includes(searchQ);
    });
    return inType || inRows;
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-black/40">
            Ürün tipleri
          </p>
          <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
            Tip &amp; Uyumluluk
          </h1>
        </div>
        <Link
          href="/products"
          className="rounded-full border border-black/20 px-4 py-2 text-sm font-semibold"
        >
          Ürünlere dön
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-3 rounded-2xl border border-black/10 bg-white p-3">
          <div className="flex flex-wrap items-center gap-2">
            {statusFilters.map((f) => (
              <Link
                key={f.key}
                href={f.key === "all" ? "/product-types" : `/product-types?status=${f.key}`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  selectedStatus === f.key
                    ? "border-[var(--ocean)] bg-[var(--ocean)]/10 text-[var(--ocean)]"
                    : "border-black/20 text-black/65"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
          <form className="mt-3" method="get">
            {selectedStatus !== "all" ? (
              <input type="hidden" name="status" value={selectedStatus} />
            ) : null}
            <input
              name="q"
              defaultValue={resolvedSearchParams.q ?? ""}
              placeholder="Tip / ulke / TSE / TAREKS ara..."
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            />
          </form>
        </div>

        <div className="lg:col-span-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Toplam tip</p>
            <p className="mt-1 text-xl font-semibold">{types?.length ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-emerald-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Aktif kayit</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{activeCompliance}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-amber-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">30 gunde bitecek</p>
            <p className="mt-1 text-xl font-semibold text-amber-700">{expiringCompliance}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-rose-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Suresi gecmis</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">{expiredCompliance}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-slate-50 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Tarihsiz kayit</p>
            <p className="mt-1 text-xl font-semibold text-slate-700">{undatedCompliance}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/45">Ulke kapsami</p>
            <p className="mt-1 text-xl font-semibold">{allCountries.size}</p>
            <p className="text-[11px] text-black/55 mt-1">
              Kayitsiz tip: {typesWithNoCompliance} | Toplam kayit: {totalCompliance}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold">Yeni tip ekle</p>
          <form action={createProductType} className="mt-3 space-y-3">
            <input
              name="name"
              placeholder="Tip adı (örn. Rulman)"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              required
            />
            <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
              Kaydet
            </button>
          </form>
          <form action={syncTypesFromAttributes} className="mt-4 space-y-2">
            <p className="text-xs text-black/60">
              Ürün niteliklerinde adı &quot;tip&quot; geçen değerleri otomatik tip olarak ekler
              ve tipi boş ürünleri bu değerlere bağlar.
            </p>
            <button className="w-full rounded-full border border-black/20 px-4 py-2 text-xs font-semibold transition hover:border-black/40">
              Niteliklerden tipleri çek
            </button>
          </form>

          <div className="mt-4 rounded-2xl border border-black/10 bg-[var(--sand)]/60 p-3">
            <p className="text-xs font-semibold text-black/70 mb-2">
              Niteliklerden algılanan tip değerleri
            </p>
            {detectedTips.length ? (
              <details className="space-y-2" open>
                <summary className="cursor-pointer text-sm font-semibold text-black/70">
                  {detectedTips.length} tip bulundu (listeyi aç/kapat)
                </summary>
                <form action={upsertTypeFromTipValue} className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-2">
                    {detectedTips.map((tip) => (
                      <label
                        key={tip}
                        className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          name="tip_values"
                          value={tip}
                          className="h-4 w-4 rounded border-black/30"
                        />
                        <span className="font-semibold">{tip}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
                      Seç ve ekle
                    </p>
                    <button className="rounded-full border border-black/20 px-4 py-2 text-xs font-semibold transition hover:border-black/40">
                      Seçilen tipleri ekle ve ürünleri bağla
                    </button>
                  </div>
                </form>
              </details>
            ) : (
              <p className="text-xs text-black/50">Algılanan tip değeri yok.</p>
            )}

            <div className="mt-4">
              <ProductTypesImportForm />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold mb-3">Tip listesi</p>
          <div className="space-y-4">
            {filteredTypes.map((type) => (
              <div
                key={type.id}
                className="rounded-2xl border border-black/10 bg-[var(--sand)]/60 p-3 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{type.name}</span>
                    <span className="rounded-full border border-black/10 bg-white px-2 py-1 text-[11px] font-semibold text-black/60">
                      {type.product_type_compliance?.length ?? 0} kayıt
                    </span>
                  </div>
                  <ConfirmActionForm
                    action={deleteProductType}
                    confirmText="Tip silinsin mi?"
                    buttonText="Sil"
                    className="inline"
                  >
                    <input type="hidden" name="id" value={type.id} />
                  </ConfirmActionForm>
                </div>

                <div className="rounded-xl border border-black/10 bg-white p-3">
                  <p className="text-xs font-semibold text-black/60">Uyumluluk kayıtları</p>
                  <div className="overflow-auto">
                    <table className="mt-2 w-full min-w-[600px] text-xs text-black/70">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-black/50">
                          <th className="px-2 py-1">Ülke</th>
                          <th className="px-2 py-1">TSE</th>
                          <th className="px-2 py-1">Analiz</th>
                          <th className="px-2 py-1">TAREKS</th>
                          <th className="px-2 py-1">Rapor</th>
                          <th className="px-2 py-1">Geçerlilik</th>
                          <th className="px-2 py-1 text-right">Hizli islemler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(type.product_type_compliance ?? [])
                          .slice()
                          .sort((a: any, b: any) => {
                            const rank = (x: any) => {
                              const s = getComplianceStatus(x);
                              if (s === "expired") return 0;
                              if (s === "expiring") return 1;
                              if (s === "active") return 2;
                              return 3;
                            };
                            return rank(a) - rank(b);
                          })
                          .map((c: any) => {
                            const status = getComplianceStatus(c);
                            const statusLabel =
                              status === "active"
                                ? "Aktif"
                                : status === "expiring"
                                ? "Yakinda bitecek"
                                : status === "expired"
                                ? "Suresi gecmis"
                                : "Tarihsiz";
                            const statusClass =
                              status === "active"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : status === "expiring"
                                ? "bg-amber-50 border-amber-200 text-amber-700"
                                : status === "expired"
                                ? "bg-rose-50 border-rose-200 text-rose-700"
                                : "bg-slate-50 border-black/15 text-black/60";
                            return (
                          <tr key={c.id} className="border-b border-black/5 align-top">
                            <td className="px-2 py-1">{c.country ?? "Genel"}</td>
                            <td className="px-2 py-1">{c.tse_status ?? ""}</td>
                            <td className="px-2 py-1">{c.analiz_gecerlilik ?? ""}</td>
                            <td className="px-2 py-1">{c.tareks_no ?? ""}</td>
                            <td className="px-2 py-1">{c.rapor_no ?? ""}</td>
                            <td className="px-2 py-1">
                              <div className="flex items-center gap-2">
                                <span>{[c.valid_from, c.valid_to].filter(Boolean).join(" — ") || "-"}</span>
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                                  {statusLabel}
                                </span>
                              </div>
                              <form action={updateCompliance} className="mt-2 grid gap-1 sm:grid-cols-2">
                                <input type="hidden" name="id" value={c.id} />
                                <input
                                  name="country"
                                  defaultValue={c.country ?? ""}
                                  placeholder="Ulke"
                                  className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                />
                                <input
                                  name="tse_status"
                                  defaultValue={c.tse_status ?? ""}
                                  placeholder="TSE"
                                  className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                />
                                <input
                                  type="date"
                                  name="analiz_gecerlilik"
                                  defaultValue={c.analiz_gecerlilik ?? ""}
                                  className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                />
                                <input
                                  name="tareks_no"
                                  defaultValue={c.tareks_no ?? ""}
                                  placeholder="TAREKS"
                                  className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                />
                                <input
                                  name="rapor_no"
                                  defaultValue={c.rapor_no ?? ""}
                                  placeholder="Rapor"
                                  className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                />
                                <div className="grid grid-cols-2 gap-1">
                                  <input
                                    type="date"
                                    name="valid_from"
                                    defaultValue={c.valid_from ?? ""}
                                    className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                  />
                                  <input
                                    type="date"
                                    name="valid_to"
                                    defaultValue={c.valid_to ?? ""}
                                    className="rounded border border-black/15 px-1.5 py-1 text-[11px]"
                                  />
                                </div>
                                <button className="rounded-full border border-[var(--ocean)] px-2 py-1 text-[11px] font-semibold text-[var(--ocean)] sm:col-span-2">
                                  Satiri kaydet
                                </button>
                              </form>
                            </td>
                            <td className="px-2 py-1 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <form action={extendComplianceValidTo}>
                                  <input type="hidden" name="id" value={c.id} />
                                  <input type="hidden" name="days" value="30" />
                                  <button className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                    +30 gun
                                  </button>
                                </form>
                                <form action={extendComplianceValidTo}>
                                  <input type="hidden" name="id" value={c.id} />
                                  <input type="hidden" name="days" value="90" />
                                  <button className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                    +90 gun
                                  </button>
                                </form>
                                <ConfirmActionForm
                                  action={deleteCompliance}
                                  confirmText="Uyumluluk kaydı silinsin mi?"
                                  buttonText="Sil"
                                  className="inline"
                                >
                                  <input type="hidden" name="id" value={c.id} />
                                </ConfirmActionForm>
                              </div>
                            </td>
                          </tr>
                        )})}
                        {!(type.product_type_compliance ?? []).length ? (
                          <tr>
                            <td
                              className="px-2 py-2 text-black/50"
                              colSpan={7}
                            >
                              Kayıt yok
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <form action={createCompliance} className="mt-3 grid gap-2 lg:grid-cols-3">
                    <input type="hidden" name="product_type_id" value={type.id} />
                    <input
                      name="country"
                      placeholder="Ülke (boş = genel)"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="tse_status"
                      placeholder="TSE durumu"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="date"
                      name="analiz_gecerlilik"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="tareks_no"
                      placeholder="TAREKS No"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      name="rapor_no"
                      placeholder="Rapor No"
                      className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        name="valid_from"
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                      />
                      <input
                        type="date"
                        name="valid_to"
                        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                      />
                    </div>
                    <button className="mt-1 rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white lg:col-span-3">
                      Uyumluluk ekle
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {!filteredTypes.length ? (
              <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
                Filtreye uygun tip/uyumluluk kaydi bulunamadi.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}


"use client";

import { useMemo, useState } from "react";

type DetailItem = {
  id: string;
  label: string;
  date: string | null;
  qty: number;
  amount: number;
  currency: string | null;
  status: string | null;
};

type ReportRow = {
  key: string;
  product_code: string;
  product_name: string;
  proforma_qty: number;
  proforma_amount: number;
  order_qty: number;
  order_amount: number;
  diff_qty: number;
  diff_amount: number;
  proforma_details: DetailItem[];
  order_details: DetailItem[];
};

const fmtNum = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 4 });

const fmtMoney = (value: number | null | undefined) =>
  Number(value ?? 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const fmtDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value);
  return dt.toLocaleDateString("tr-TR");
};

export default function SupplierProformaReportTable({ rows }: { rows: ReportRow[] }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeRow = useMemo(() => rows.find((r) => r.key === activeKey) ?? null, [rows, activeKey]);

  return (
    <>
      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="overflow-x-hidden">
          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="border-b border-black/10 text-left text-[10px] uppercase tracking-[0.14em] text-black/50">
                <th className="w-[14%] px-2 py-2">Urun kodu</th>
                <th className="w-[20%] px-2 py-2">Urun adi</th>
                <th className="w-[10%] px-2 py-2 text-right">Proforma adet</th>
                <th className="w-[10%] px-2 py-2 text-right">Siparis adet</th>
                <th className="w-[8%] px-2 py-2 text-right">Fark adet</th>
                <th className="w-[12%] px-2 py-2 text-right">Proforma tutar</th>
                <th className="w-[12%] px-2 py-2 text-right">Siparis tutar</th>
                <th className="w-[8%] px-2 py-2 text-right">Fark tutar</th>
                <th className="w-[6%] px-2 py-2 text-right">Detay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-black/5 hover:bg-black/5">
                  <td className="px-2 py-2 font-semibold text-black break-all">{row.product_code}</td>
                  <td className="px-2 py-2 text-black/80 break-words">{row.product_name}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtNum(row.proforma_qty)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtNum(row.order_qty)}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${row.diff_qty < 0 ? "text-red-700" : "text-black"}`}>
                    {fmtNum(row.diff_qty)}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtMoney(row.proforma_amount)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmtMoney(row.order_amount)}</td>
                  <td className={`px-2 py-2 text-right font-semibold ${row.diff_amount < 0 ? "text-red-700" : "text-black"}`}>
                    {fmtMoney(row.diff_amount)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setActiveKey(row.key)}
                      className="rounded-full border border-black/20 bg-white px-2 py-1 text-[11px] font-semibold text-black/75 hover:bg-black/5"
                    >
                      Ac
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length ? <div className="py-8 text-center text-sm text-black/60">Rapor satiri yok.</div> : null}
      </div>

      {activeRow ? (
        <>
          <button
            type="button"
            aria-label="Kapat"
            onClick={() => setActiveKey(null)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-3xl overflow-y-auto border-l border-black/10 bg-white shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-black/10 bg-white/95 p-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-black/45">Urun kaynak dagilimi</div>
                  <h3 className="mt-1 text-lg font-semibold text-black">{activeRow.product_code}</h3>
                  <div className="text-sm text-black/65">{activeRow.product_name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveKey(null)}
                  className="rounded-full border border-black/20 px-3 py-1 text-xs font-semibold text-black/75 hover:bg-black/5"
                >
                  Kapat
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Proforma: <span className="font-semibold">{fmtNum(activeRow.proforma_qty)}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  Siparis: <span className="font-semibold">{fmtNum(activeRow.order_qty)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 p-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-sky-800">Proforma tarafi</div>
                {activeRow.proforma_details.length ? (
                  <ul className="space-y-2">
                    {activeRow.proforma_details.map((item) => (
                      <li key={item.id} className="rounded-xl border border-sky-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-black/80">
                          <span>{item.label}</span>
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">{fmtDate(item.date)}</span>
                        </div>
                        <div className="mt-1 text-xs text-black/70">
                          Adet: <span className="font-semibold text-black">{fmtNum(item.qty)}</span>
                        </div>
                        <div className="text-xs text-black/70">
                          Tutar: <span className="font-semibold text-black">{fmtMoney(item.amount)} {item.currency ?? ""}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-black/55">Kaynak yok.</div>
                )}
              </section>

              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-emerald-800">Siparis tarafi</div>
                {activeRow.order_details.length ? (
                  <ul className="space-y-2">
                    {activeRow.order_details.map((item) => (
                      <li key={item.id} className="rounded-xl border border-emerald-100 bg-white p-3">
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-black/80">
                          <span>{item.label}</span>
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">{fmtDate(item.date)}</span>
                        </div>
                        <div className="mt-1 text-xs text-black/70">
                          Adet: <span className="font-semibold text-black">{fmtNum(item.qty)}</span>
                        </div>
                        <div className="text-xs text-black/70">
                          Tutar: <span className="font-semibold text-black">{fmtMoney(item.amount)} {item.currency ?? ""}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-xs text-black/55">Kaynak yok.</div>
                )}
              </section>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}

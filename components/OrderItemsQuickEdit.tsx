"use client";

import { useMemo, useState } from "react";

type QuickItem = {
  id: string;
  code: string | null;
  name: string | null;
  quantity: number | null;
  unit_price: number | null;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
};

type Props = {
  orderId: string;
  items: QuickItem[];
  action: (formData: FormData) => Promise<void>;
};

const toInput = (value: number | null | undefined) =>
  value === null || value === undefined || Number.isNaN(Number(value)) ? "" : String(value);

export default function OrderItemsQuickEdit({ orderId, items, action }: Props) {
  const [rows, setRows] = useState(
    items.map((item) => ({
      ...item,
      quantity: toInput(item.quantity),
      unit_price: toInput(item.unit_price),
      net_weight_kg: toInput(item.net_weight_kg),
      gross_weight_kg: toInput(item.gross_weight_kg),
    }))
  );

  const payload = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        unit_price: row.unit_price,
        net_weight_kg: row.net_weight_kg,
        gross_weight_kg: row.gross_weight_kg,
      })),
    [rows]
  );

  const setCell = (
    rowId: string,
    field: "quantity" | "unit_price" | "net_weight_kg" | "gross_weight_kg",
    value: string
  ) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row))
    );
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-[11px] uppercase tracking-[0.3em] text-black/45">Hizli duzenleme</p>
        <p className="text-sm text-black/65">
          Adet, birim fiyat, net kg ve brut kg alanlarini toplu duzenleyip tek seferde kaydedin.
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="order_id" value={orderId} />
        <input type="hidden" name="rows_json" value={JSON.stringify(payload)} />
        <div className="overflow-x-auto">
          <table className="min-w-[940px] w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.2em] text-black/45">
                <th className="px-2 py-2">Kod</th>
                <th className="px-2 py-2">Urun</th>
                <th className="px-2 py-2">Adet</th>
                <th className="px-2 py-2">Birim fiyat</th>
                <th className="px-2 py-2">Toplam net kg</th>
                <th className="px-2 py-2">Toplam brut kg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-black/10">
                  <td className="px-2 py-2 font-semibold text-black/75">{row.code ?? "-"}</td>
                  <td className="px-2 py-2 text-black/70">{row.name ?? "-"}</td>
                  <td className="px-2 py-2">
                    <input
                      value={row.quantity}
                      onChange={(e) => setCell(row.id, "quantity", e.target.value)}
                      className="w-28 rounded-xl border border-black/15 px-2 py-1.5"
                      inputMode="numeric"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.unit_price}
                      onChange={(e) => setCell(row.id, "unit_price", e.target.value)}
                      className="w-32 rounded-xl border border-black/15 px-2 py-1.5"
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.net_weight_kg}
                      onChange={(e) => setCell(row.id, "net_weight_kg", e.target.value)}
                      className="w-32 rounded-xl border border-black/15 px-2 py-1.5"
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={row.gross_weight_kg}
                      onChange={(e) => setCell(row.id, "gross_weight_kg", e.target.value)}
                      className="w-32 rounded-xl border border-black/15 px-2 py-1.5"
                      inputMode="decimal"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-end">
          <button className="rounded-full bg-[var(--ocean)] px-4 py-2 text-xs font-semibold text-white">
            Toplu kaydet
          </button>
        </div>
      </form>
    </div>
  );
}


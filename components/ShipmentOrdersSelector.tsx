"use client";

import { useMemo, useState } from "react";

type OrderOption = {
  id: string;
  name: string | null;
  reference_name?: string | null;
  packages?: number | null;
  weight_kg?: number | null;
  total_amount?: number | null;
  currency?: string | null;
};

type DisabledInfo = {
  reason: string;
};

type Props = {
  orders: OrderOption[];
  selectedIds: string[];
  disabledById: Record<string, DisabledInfo>;
};

export default function ShipmentOrdersSelector({
  orders,
  selectedIds,
  disabledById,
}: Props) {
  const formatNumber = (
    value: number | null | undefined,
    maximumFractionDigits = 2
  ) => {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 0,
      maximumFractionDigits,
    });
  };

  const formatMoney = (
    value: number | null | undefined,
    currency: string | null | undefined
  ) => {
    if (value === null || value === undefined) return "-";
    return `${Number(value).toLocaleString("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency ?? "USD"}`;
  };

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(selectedIds));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) => {
      const name = order.name?.toLowerCase() ?? "";
      const ref = order.reference_name?.toLowerCase() ?? "";
      return name.includes(q) || ref.includes(q);
    });
  }, [orders, query]);

  const selectedOrders = useMemo(
    () => orders.filter((order) => selected.has(order.id)),
    [orders, selected]
  );

  const toggle = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const colorFromId = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i += 1) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
      hash &= hash;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 92%)`;
  };

  return (
    <div className="space-y-3">
      {Array.from(selected).map((orderId) => (
        <input key={orderId} type="hidden" name="order_ids" value={orderId} />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold shadow-sm"
        >
          {open ? "Siparis secimini kapat" : "Siparis secimi ac"}
        </button>
        <span className="text-xs text-black/50">
          {selected.size} siparis secili
        </span>
      </div>

      {open ? (
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Siparis ara..."
              className="w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm lg:w-1/2"
            />
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full border border-black/10 px-3 py-1 text-xs font-semibold"
            >
              Temizle
            </button>
          </div>

          <div className="mt-4 max-h-64 space-y-2 overflow-auto pr-2">
            {filtered.length ? (
              filtered.map((order) => {
                const disabled = Boolean(disabledById[order.id]);
                const info = disabledById[order.id];
                const bgColor = disabled ? undefined : colorFromId(order.id);
                return (
                  <label
                    key={order.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${
                      disabled
                        ? "border-black/5 bg-black/5 text-black/40"
                        : "border-black/10"
                    }`}
                    style={bgColor ? { backgroundColor: bgColor } : undefined}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggle(order.id)}
                        disabled={disabled}
                      />
                      <div>
                        <p className="font-semibold">
                          {order.name ?? order.reference_name ?? "-"}
                        </p>
                        <p className="mt-1 text-[11px] text-black/60">
                          {formatNumber(order.packages ?? null, 0)} koli |{" "}
                          {formatNumber(order.weight_kg)} kg |{" "}
                          {formatMoney(order.total_amount ?? null, order.currency)}
                        </p>
                        {disabled ? (
                          <p className="mt-1 text-[11px] text-black/50">
                            {info?.reason ?? "Bu siparis baska shipmentte."}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="rounded-xl border border-black/10 bg-[var(--peach)] px-3 py-2 text-xs text-black/60">
                Eslesen siparis bulunamadi.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-black/10 bg-white p-4">
        <p className="font-semibold text-sm">Secili siparisler</p>
        <div className="mt-3 space-y-2">
          {selectedOrders.length ? (
            selectedOrders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-black/10 bg-[var(--sand)] px-3 py-2 text-xs"
              >
                <span className="font-semibold">
                  {order.name ?? order.reference_name ?? "-"}
                </span>
                <span className="text-black/60">
                  {formatNumber(order.packages ?? null, 0)} koli |{" "}
                  {formatNumber(order.weight_kg)} kg |{" "}
                  {formatMoney(order.total_amount ?? null, order.currency)}
                </span>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[var(--peach)] px-4 py-3 text-sm text-black/70">
              Henuz siparis secilmedi.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

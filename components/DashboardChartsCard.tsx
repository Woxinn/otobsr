"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import MonthlyOrdersChart from "./MonthlyOrdersChart";

type ChartDataPoint = {
  month: string;
  count: number;
};

type Props = {
  orderMonthlyData: ChartDataPoint[];
  paymentMonthlyData: ChartDataPoint[];
  canSeeFinance: boolean;
};

export default function DashboardChartsCard({
  orderMonthlyData,
  paymentMonthlyData,
  canSeeFinance,
}: Props) {
  const [activeTab, setActiveTab] = useState<"orders" | "payments">("orders");

  return (
    <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400 font-bold">
            Trend Analizi
          </p>
          <h2 className="mt-1 text-xl font-semibold [font-family:var(--font-display)] text-slate-800">
            Aylık Operasyon Göstergeleri
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {canSeeFinance && (
            <div className="flex rounded-lg bg-slate-50 p-1 border border-slate-100">
              <button
                onClick={() => setActiveTab("orders")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "orders"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Sipariş Trendi
              </button>
              <button
                onClick={() => setActiveTab("payments")}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  activeTab === "payments"
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                Ödeme Trendi
              </button>
            </div>
          )}
          <BarChart3 className="h-5 w-5 text-slate-350" />
        </div>
      </div>

      <div className="mt-5">
        {activeTab === "orders" ? (
          <div>
            <p className="mb-4 text-sm font-semibold text-slate-500">
              Aylık Sipariş Hacmi (Adet)
            </p>
            <MonthlyOrdersChart data={orderMonthlyData} />
          </div>
        ) : (
          <div>
            <p className="mb-4 text-sm font-semibold text-slate-500">
              Aylık Ödeme Hacmi (USD)
            </p>
            <MonthlyOrdersChart data={paymentMonthlyData} />
          </div>
        )}
      </div>
    </section>
  );
}

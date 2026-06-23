"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Search, Printer, ReceiptText, WalletCards, ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface StatementItem {
  id: string;
  dateStr: string;
  type: "order" | "payment";
  refNo: string;
  description: string;
  debit: number; // Borç (fatura tutarı / sipariş tutarı)
  credit: number; // Alacak (ödenen tutar)
  currency: string;
  runningBalance: number;
  link: string;
}

interface SupplierStatementProps {
  transactions: StatementItem[];
  supplierName: string;
}

export default function SupplierStatement({ transactions, supplierName }: SupplierStatementProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState<"all" | "30" | "90" | "2026">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Search filter
    if (searchTerm.trim()) {
      const query = searchTerm.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.refNo.toLowerCase().includes(query) ||
          tx.description.toLowerCase().includes(query)
      );
    }

    // Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      const cutoffDate = new Date();
      
      if (dateFilter === "30") {
        cutoffDate.setDate(now.getDate() - 30);
        result = result.filter((tx) => new Date(tx.dateStr) >= cutoffDate);
      } else if (dateFilter === "90") {
        cutoffDate.setDate(now.getDate() - 90);
        result = result.filter((tx) => new Date(tx.dateStr) >= cutoffDate);
      } else if (dateFilter === "2026") {
        const startOf2026 = new Date("2026-01-01T00:00:00");
        const endOf2026 = new Date("2026-12-31T23:59:59");
        result = result.filter((tx) => {
          const d = new Date(tx.dateStr);
          return d >= startOf2026 && d <= endOf2026;
        });
      }
    }

    // Return descending (newest first) for display
    return result.reverse();
  }, [transactions, searchTerm, dateFilter]);

  // Pagination
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;

  // Totals based on ALL transactions (ignoring display filter for cumulative totals)
  const totals = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;

    transactions.forEach((tx) => {
      totalDebit += tx.debit;
      totalCredit += tx.credit;
    });

    return {
      totalDebit,
      totalCredit,
      balance: totalDebit - totalCredit,
    };
  }, [transactions]);

  const formatMoney = (value: number) =>
    value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatDate = (dateStr: string) => {
    const dt = new Date(dateStr);
    if (Number.isNaN(dt.getTime())) return dateStr;
    return dt.toLocaleDateString("tr-TR");
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="rounded-[36px] border border-black/10 bg-[radial-gradient(circle_at_top_left,#ffffff,#f6f7fb)] p-6 shadow-sm statement-card">
      {/* Styles for printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Hide all UI elements */
          header, nav, footer, button, .no-print, input, .pagination-controls {
            display: none !important;
          }
          
          body, html {
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* Remove statement card borders/shadows for print */
          .statement-card {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
          }
          
          /* Ensure table expands nicely */
          .table-container {
            width: 100% !important;
            overflow: visible !important;
          }
          
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          
          tr {
            page-break-inside: avoid !important;
          }
          
          td, th {
            padding: 8px 12px !important;
            border: 1px solid #ddd !important;
            background: white !important;
            color: black !important;
          }
          
          /* Show print-only header */
          .print-only-header {
            display: block !important;
            margin-bottom: 20px !important;
          }
        }
      `}} />

      {/* Print-Only Header */}
      <div className="hidden print-only-header">
        <h1 className="text-2xl font-bold">{supplierName} - Cari Hesap Ekstresi</h1>
        <p className="text-sm text-black/60 mt-1">
          Oluşturulma Tarihi: {new Date().toLocaleDateString("tr-TR")} | Bakiye: {formatMoney(Math.abs(totals.balance))} USD {totals.balance > 0 ? "(Kalan)" : totals.balance < 0 ? "(Fazla)" : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 no-print">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-black/40">
            Muhasebe & Cari Takip
          </p>
          <h3 className="text-lg font-semibold">Cari Hesap Ekstresi</h3>
        </div>
        <button
          onClick={handlePrint}
          type="button"
          className="flex items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2 text-xs font-semibold text-black/70 shadow-sm transition hover:bg-black/5 hover:-translate-y-0.5"
        >
          <Printer className="h-3.5 w-3.5" />
          Yazdır / PDF Al
        </button>
      </div>

      {/* KPI Overview Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-2xl border border-black/10 bg-slate-50 p-4 shadow-inner flex items-center gap-4">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Toplam Borç (Siparişler)</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(totals.totalDebit)} USD</p>
          </div>
        </div>

        <div className="rounded-2xl border border-black/10 bg-slate-50 p-4 shadow-inner flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
            <WalletCards className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">Toplam Alacak (Ödemeler)</p>
            <p className="mt-1 text-lg font-semibold">{formatMoney(totals.totalCredit)} USD</p>
          </div>
        </div>

        <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
          totals.balance > 0 
            ? "border-rose-100 bg-rose-50/50" 
            : totals.balance < 0 
            ? "border-emerald-100 bg-emerald-50/50" 
            : "border-black/10 bg-slate-50"
        }`}>
          <div className={`rounded-xl p-3 ${
            totals.balance > 0 ? "bg-rose-100 text-rose-700" : totals.balance < 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
          }`}>
            <span className="text-xl font-bold leading-none">$</span>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-black/50">
              {totals.balance > 0 ? "Kalan Ödeme (Borcumuz)" : totals.balance < 0 ? "Fazla Ödeme (Alacağımız)" : "Bakiye"}
            </p>
            <p className={`mt-1 text-lg font-semibold ${
              totals.balance > 0 ? "text-rose-700" : totals.balance < 0 ? "text-emerald-700" : "text-black"
            }`}>
              {formatMoney(Math.abs(totals.balance))} USD
            </p>
          </div>
        </div>
      </div>

      {/* Filters and Search Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 no-print">
        {/* Search */}
        <div className="relative w-full max-w-sm">
          <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-black/45">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Belge no veya açıklama ara..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-full border border-black/10 bg-white pl-9 pr-4 py-2 text-xs focus:border-black/20 focus:outline-none shadow-sm transition"
          />
        </div>

        {/* Date Quick Filters */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/70 border border-black/5 rounded-full p-1 shadow-inner">
          <button
            onClick={() => { setDateFilter("all"); setCurrentPage(1); }}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              dateFilter === "all" ? "bg-white text-black shadow-sm" : "text-black/60 hover:text-black"
            }`}
          >
            Tüm Zamanlar
          </button>
          <button
            onClick={() => { setDateFilter("30"); setCurrentPage(1); }}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              dateFilter === "30" ? "bg-white text-black shadow-sm" : "text-black/60 hover:text-black"
            }`}
          >
            Son 30 Gün
          </button>
          <button
            onClick={() => { setDateFilter("90"); setCurrentPage(1); }}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              dateFilter === "90" ? "bg-white text-black shadow-sm" : "text-black/60 hover:text-black"
            }`}
          >
            Son 90 Gün
          </button>
          <button
            onClick={() => { setDateFilter("2026"); setCurrentPage(1); }}
            type="button"
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              dateFilter === "2026" ? "bg-white text-black shadow-sm" : "text-black/60 hover:text-black"
            }`}
          >
            2026 Yılı
          </button>
        </div>
      </div>

      {/* Transaction Table */}
      <div className="mt-6 overflow-x-auto table-container">
        {filteredTransactions.length ? (
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.25em] text-black/50">
                <th className="px-4 py-2">Tarih</th>
                <th className="px-4 py-2">İşlem Türü</th>
                <th className="px-4 py-2">Belge / Açıklama</th>
                <th className="px-4 py-2 text-right">Borç (Fatura Tutarı)</th>
                <th className="px-4 py-2 text-right">Alacak (Ödenen)</th>
                <th className="px-4 py-2 text-right">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map((tx) => {
                const balanceAbs = Math.abs(tx.runningBalance);
                const balanceClass = 
                  tx.runningBalance > 0 
                    ? "text-rose-700 font-semibold" 
                    : tx.runningBalance < 0 
                    ? "text-emerald-700 font-semibold" 
                    : "text-black/60";
                
                const typeBadge = 
                  tx.type === "order" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      <ArrowUpRight className="h-3 w-3" /> Fatura
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <ArrowDownRight className="h-3 w-3" /> Ödeme
                    </span>
                  );

                return (
                  <tr 
                    key={`${tx.type}-${tx.id}`}
                    className="group transition hover:-translate-y-0.5 [&>td]:border [&>td]:border-black/10 [&>td]:bg-white [&>td:first-child]:rounded-l-2xl [&>td:last-child]:rounded-r-2xl hover:[&>td]:bg-slate-50/80"
                  >
                    <td className="px-4 py-3.5 text-xs text-black/70">
                      {formatDate(tx.dateStr)}
                    </td>
                    <td className="px-4 py-3.5">
                      {typeBadge}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-medium">
                      {tx.type === "order" ? (
                        <Link 
                          href={tx.link}
                          className="text-[var(--ocean)] hover:underline flex items-center gap-1 font-semibold"
                        >
                          {tx.refNo}
                          <span className="text-black/40 font-normal no-print">({tx.description})</span>
                        </Link>
                      ) : (
                        <div className="text-black/80 flex flex-col">
                          <span className="font-semibold">{tx.refNo}</span>
                          {tx.description && <span className="text-[11px] text-black/50 mt-0.5">{tx.description}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-slate-800">
                      {tx.debit > 0 ? `${formatMoney(tx.debit)} ${tx.currency}` : "-"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-emerald-700">
                      {tx.credit > 0 ? `${formatMoney(tx.credit)} ${tx.currency}` : "-"}
                    </td>
                    <td className={`px-4 py-3.5 text-right text-xs ${balanceClass}`}>
                      {formatMoney(balanceAbs)} USD {tx.runningBalance > 0 ? "K" : tx.runningBalance < 0 ? "F" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="rounded-2xl border border-black/10 bg-slate-50 py-12 text-center text-sm text-black/50">
            Arama kriterlerine uygun işlem kaydı bulunamadı.
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {filteredTransactions.length > itemsPerPage && (
        <div className="mt-4 flex items-center justify-between no-print pagination-controls text-xs">
          <span className="text-black/50">
            Toplam {filteredTransactions.length} kayıttan {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} arası gösteriliyor
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              type="button"
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 font-semibold text-black/70 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white"
            >
              Önceki
            </button>
            <span className="px-3 font-semibold text-black/70">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              type="button"
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 font-semibold text-black/70 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white"
            >
              Sonraki
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

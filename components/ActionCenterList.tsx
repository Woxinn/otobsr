"use client";

import { useState } from "react";
import Link from "next/link";
import { Ship, FileWarning, CalendarClock, CircleDollarSign, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

const iconMap = {
  Ship,
  FileWarning,
  CalendarClock,
  CircleDollarSign,
};

type ActionItem = {
  key: string;
  title: string;
  description: string;
  meta: string;
  href: string;
  tone: "critical" | "warning" | "info" | "money";
  icon: "Ship" | "FileWarning" | "CalendarClock" | "CircleDollarSign";
};

type Props = {
  actionItems: ActionItem[];
  statusTone: {
    [key: string]: {
      shell: string;
      icon: string;
      pill: string;
      btn: string;
    };
  };
};

export default function ActionCenterList({ actionItems, statusTone }: Props) {
  const [showAll, setShowAll] = useState(false);

  const displayedItems = showAll ? actionItems : actionItems.slice(0, 5);

  if (!actionItems.length) {
    return (
      <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-5 text-sm font-medium text-emerald-800 text-center">
        Şu an kritik aksiyon görünmüyor.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3">
        {displayedItems.map((item) => {
          const Icon = iconMap[item.icon] || FileWarning;
          const tone = statusTone[item.tone] || statusTone.info;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`grid gap-3 rounded-lg border p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:grid-cols-[auto_1fr_auto] ${tone.shell}`}
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${tone.icon}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${tone.pill}`}>
                    {item.meta}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
              <span className={`self-center flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors duration-150 ${tone.btn}`}>
                <span>İncele</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          );
        })}
      </div>

      {actionItems.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50/50 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 hover:border-slate-200"
        >
          {showAll ? (
            <>
              <span>Daha Az Göster</span>
              <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              <span>Daha Fazla Göster ({actionItems.length - 5} adet)</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      )}
    </div>
  );
}

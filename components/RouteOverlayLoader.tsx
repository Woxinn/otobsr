"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Logo from "@/components/Logo";

export default function RouteOverlayLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!loading) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
      setLoading(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setLoading(false);
      }, 4000);
    };
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, []);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(15,61,62,0.12),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.75),rgba(247,244,235,0.88))] backdrop-blur-md">
      <div className="flex flex-col items-center gap-5 rounded-[28px] border border-black/10 bg-white/80 px-12 py-9 shadow-[0_40px_80px_-50px_rgba(12,45,52,0.65)] backdrop-blur">
        <Logo className="h-12 w-auto" alt="Logo" />
        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-black/60">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#0f3d3e]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#0f3d3e]/70" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#0f3d3e]/40" />
          Yukleniyor
        </div>
        <div className="h-1 w-56 overflow-hidden rounded-full bg-black/10">
          <div className="h-full w-1/3 animate-[loading-bar_0.9s_ease_infinite] rounded-full bg-[#0f3d3e]" />
        </div>
      </div>
    </div>
  );
}

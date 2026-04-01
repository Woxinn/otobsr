"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import BrandedLoadingScreen from "@/components/BrandedLoadingScreen";

const MIN_VISIBLE_MS = 900;
const MAX_VISIBLE_MS = 15000;
const COMPLETE_HIDE_DELAY_MS = 360;
const COMPLETE_RAMP_DELAY_MS = 170;

function getRouteLoadingCopy(route: string | null | undefined) {
  const clean = String(route ?? "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);

  if (clean === "/") return { label: "Yukleniyor", detail: "Dashboard hazirlaniyor" };

  if (parts[0] === "orders") {
    if (parts.length === 1) return { label: "Siparisler yukleniyor", detail: "Siparis kayitlari hazirlaniyor" };
    if (parts[2] === "packing-import") return { label: "Packing aciliyor", detail: "Koli ve agirlik verileri hazirlaniyor" };
    if (parts[2] === "beyanname") return { label: "Beyanname aciliyor", detail: "Masraf ve vergi hesaplari hazirlaniyor" };
    return { label: "Siparis aciliyor", detail: "Siparis detaylari ve belgeler getiriliyor" };
  }

  if (parts[0] === "products") {
    if (parts.length === 1) return { label: "Urunler yukleniyor", detail: "Urun listesi hazirlaniyor" };
    if (parts[1] === "import-update") return { label: "Urun aktarimi aciliyor", detail: "Import ekrani hazirlaniyor" };
    if (parts[1] === "netsis-import") return { label: "Stok kodu aktarimi aciliyor", detail: "Esleme verileri hazirlaniyor" };
    return { label: "Urun aciliyor", detail: "Kart ve canli veriler getiriliyor" };
  }

  if (parts[0] === "shipments") {
    if (parts.length === 1) return { label: "Sevkiyatlar yukleniyor", detail: "ETA ve operasyon kayitlari hazirlaniyor" };
    return { label: "Sevkiyat aciliyor", detail: "Rota ve belge detaylari getiriliyor" };
  }

  if (parts[0] === "rfqs") {
    if (parts.length === 1) return { label: "RFQ'lar yukleniyor", detail: "Teklif listesi hazirlaniyor" };
    return { label: "RFQ aciliyor", detail: "Teklif karsilastirmalari hazirlaniyor" };
  }

  if (parts[0] === "proformalar") {
    if (parts.length === 1) return { label: "Proformalar yukleniyor", detail: "Kayitlar hazirlaniyor" };
    return { label: "Proforma aciliyor", detail: "Kalemler ve tedarikci bilgileri getiriliyor" };
  }

  if (parts[0] === "siparis-plani") {
    return { label: "Siparis plani yukleniyor", detail: "Stok ve satis verileri hesapaniyor" };
  }

  if (parts[0] === "suppliers") {
    return parts.length === 1
      ? { label: "Tedarikciler yukleniyor", detail: "Tedarikci kayitlari hazirlaniyor" }
      : { label: "Tedarikci aciliyor", detail: "Siparis ve rapor verileri getiriliyor" };
  }

  if (parts[0] === "documents") {
    return { label: "Belgeler yukleniyor", detail: "Evrak kayitlari hazirlaniyor" };
  }

  if (parts[0] === "gtips") {
    return { label: "GTIP ekrani aciliyor", detail: "Vergi ve oran verileri getiriliyor" };
  }

  return { label: "Yukleniyor", detail: "Yeni ekran hazirlaniyor" };
}

export default function RouteOverlayLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRoute = useMemo(() => {
    const query = searchParams?.toString();
    return `${pathname ?? ""}${query ? `?${query}` : ""}`;
  }, [pathname, searchParams]);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [copy, setCopy] = useState(() => getRouteLoadingCopy(currentRoute));

  const currentRouteRef = useRef(currentRoute);
  const pendingRouteRef = useRef<string | null>(null);
  const holdCountRef = useRef(0);
  const startedAtRef = useRef(0);
  const progressTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const failSafeTimerRef = useRef<number | null>(null);
  const completeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (failSafeTimerRef.current) window.clearTimeout(failSafeTimerRef.current);
    if (completeTimerRef.current) window.clearTimeout(completeTimerRef.current);
    progressTimerRef.current = null;
    hideTimerRef.current = null;
    failSafeTimerRef.current = null;
    completeTimerRef.current = null;
  };

  const finishLoading = () => {
    clearTimers();
    pendingRouteRef.current = null;
    setProgress((prev) => Math.max(prev, 88));
    completeTimerRef.current = window.setTimeout(() => {
      setProgress(100);
    }, COMPLETE_RAMP_DELAY_MS);
    hideTimerRef.current = window.setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, COMPLETE_HIDE_DELAY_MS);
  };

  const scheduleFinish = () => {
    if (holdCountRef.current > 0) return;
    const elapsed = Date.now() - startedAtRef.current;
    const wait = Math.max(MIN_VISIBLE_MS - elapsed, 0);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      finishLoading();
    }, wait);
  };

  const beginLoading = (route: string | null) => {
    const targetRoute = route ?? "__pending__";
    if (targetRoute === currentRouteRef.current) return;
    if (pendingRouteRef.current === targetRoute && loading) return;

    clearTimers();
    pendingRouteRef.current = targetRoute;
    startedAtRef.current = Date.now();
    setCopy(getRouteLoadingCopy(route));
    setProgress(12);
    setLoading(true);

    progressTimerRef.current = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 86) return prev;
        if (prev < 28) return prev + 6;
        if (prev < 52) return prev + 4;
        if (prev < 72) return prev + 2;
        return prev + 1;
      });
    }, 160);

    failSafeTimerRef.current = window.setTimeout(() => {
      finishLoading();
    }, MAX_VISIBLE_MS);
  };

  useEffect(() => {
    currentRouteRef.current = currentRoute;
    if (!loading) return;
    const pendingRoute = pendingRouteRef.current;
    if (!pendingRoute) return;
    if (pendingRoute === "__pending__" || pendingRoute === currentRoute) {
      scheduleFinish();
    }
  }, [currentRoute, loading]);

  useEffect(() => {
    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      beginLoading(`${url.pathname}${url.search}`);
    };

    const onPopState = () => {
      beginLoading(null);
    };

    const onHold = (event: Event) => {
      const customEvent = event as CustomEvent<{ label?: string; detail?: string }>;
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      if (!loading && !pendingRouteRef.current) {
        beginLoading(null);
      }
      holdCountRef.current += 1;
      if (customEvent.detail?.label || customEvent.detail?.detail) {
        setCopy((prev) => ({
          label: customEvent.detail?.label ?? prev.label,
          detail: customEvent.detail?.detail ?? prev.detail,
        }));
      }
    };

    const onRelease = () => {
      holdCountRef.current = Math.max(holdCountRef.current - 1, 0);
      if (holdCountRef.current > 0) return;
      if (!loading) return;
      const pendingRoute = pendingRouteRef.current;
      if (pendingRoute && (pendingRoute === "__pending__" || pendingRoute === currentRouteRef.current)) {
        scheduleFinish();
      }
    };

    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("route-loader:hold", onHold as EventListener);
    window.addEventListener("route-loader:release", onRelease);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("route-loader:hold", onHold as EventListener);
      window.removeEventListener("route-loader:release", onRelease);
      clearTimers();
    };
  }, [loading]);

  if (!loading) return null;

  return (
    <BrandedLoadingScreen
      overlay
      label={copy.label}
      detail={copy.detail}
      progress={progress}
    />
  );
}

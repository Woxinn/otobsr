"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import BrandedLoadingScreen from "@/components/BrandedLoadingScreen";

const MIN_VISIBLE_MS = 900;
const MAX_VISIBLE_MS = 15000;
const COMPLETE_HIDE_DELAY_MS = 180;

function getRouteLoadingCopy(route: string | null | undefined) {
  const clean = String(route ?? "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
  const parts = clean.split("/").filter(Boolean);

  if (clean === "/") {
    return { label: "Yukleniyor", detail: "Dashboard hazirlaniyor" };
  }

  if (parts[0] === "orders") {
    if (parts.length === 1) return { label: "Siparisler yukleniyor", detail: "Siparis kayitlari hazirlaniyor" };
    if (parts[2] === "packing-import") return { label: "Packing aciliyor", detail: "Koli ve agirlik verileri hazirlaniyor" };
    if (parts[2] === "beyanname") return { label: "Beyanname aciliyor", detail: "Masraf ve vergi hesaplari hazirlaniyor" };
    return { label: "Siparis aciliyor", detail: "Siparis detaylari ve belgeler getiriliyor" };
  }

  if (parts[0] === "products") {
    if (parts.length === 1) return { label: "Urunler yukleniyor", detail: "Urun listesi hazirlaniyor" };
    if (parts[1] === "import-update") return { label: "Urun aktarimi aciliyor", detail: "Import ekranı hazirlaniyor" };
    if (parts[1] === "netsis-import") return { label: "Netsis aktarimi aciliyor", detail: "Esleme verileri hazirlaniyor" };
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
    return { label: "GTIP ekranı aciliyor", detail: "Vergi ve oran verileri getiriliyor" };
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
  const startedAtRef = useRef(0);
  const pendingRouteRef = useRef<string | null>(null);
  const currentRouteRef = useRef(currentRoute);
  const loadingRef = useRef(false);
  const scheduledRouteRef = useRef<string | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);
  const failSafeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimers = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (failSafeTimerRef.current) clearTimeout(failSafeTimerRef.current);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    hideTimerRef.current = null;
    failSafeTimerRef.current = null;
    progressTimerRef.current = null;
  };

  const stopLoading = () => {
    clearTimers();
    setProgress(100);
    pendingRouteRef.current = null;
    scheduledRouteRef.current = null;
    loadingRef.current = false;
    window.setTimeout(() => {
      setLoading(false);
      setProgress(0);
    }, COMPLETE_HIDE_DELAY_MS);
  };

  const scheduleStop = () => {
    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(MIN_VISIBLE_MS - elapsed, 0);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      stopLoading();
    }, delay);
  };

  const startLoading = (nextRoute?: string | null) => {
    const targetRoute = nextRoute ?? pendingRouteRef.current ?? "__pending__";
    if (targetRoute && targetRoute === currentRouteRef.current) return;
    if (loadingRef.current && (!targetRoute || targetRoute === pendingRouteRef.current)) return;
    if (scheduledRouteRef.current && scheduledRouteRef.current === targetRoute) return;
    scheduledRouteRef.current = targetRoute;
    window.setTimeout(() => {
      if (scheduledRouteRef.current !== targetRoute) return;
      scheduledRouteRef.current = null;
      if (targetRoute && targetRoute === currentRouteRef.current) return;
      if (loadingRef.current && targetRoute === pendingRouteRef.current) return;
      startedAtRef.current = Date.now();
      pendingRouteRef.current = targetRoute;
      loadingRef.current = true;
      setCopy(getRouteLoadingCopy(targetRoute));
      setProgress(12);
      setLoading(true);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      progressTimerRef.current = window.setInterval(() => {
        setProgress((prev) => {
          if (prev >= 86) return prev;
          if (prev < 35) return prev + 9;
          if (prev < 60) return prev + 5;
          if (prev < 76) return prev + 2;
          return prev + 1;
        });
      }, 220) as unknown as NodeJS.Timeout;
      if (failSafeTimerRef.current) clearTimeout(failSafeTimerRef.current);
      failSafeTimerRef.current = setTimeout(() => {
        stopLoading();
      }, MAX_VISIBLE_MS);
    }, 0);
  };

  useEffect(() => {
    currentRouteRef.current = currentRoute;
    if (!loading) return;
    const pendingRoute = pendingRouteRef.current;
    if (!pendingRoute) return;
    if (pendingRoute === "__pending__" || pendingRoute === currentRoute) {
      scheduleStop();
    }
  }, [currentRoute, loading]);

  useEffect(() => {
    const handleClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) return;

      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;

      const nextRoute = `${url.pathname}${url.search}`;
      startLoading(nextRoute);
    };

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = function pushState(...args) {
      const url = args[2];
      if (typeof url === "string") {
        const parsed = new URL(url, window.location.origin);
        startLoading(`${parsed.pathname}${parsed.search}`);
      }
      return originalPushState(...args);
    };

    window.history.replaceState = function replaceState(...args) {
      const url = args[2];
      if (typeof url === "string") {
        const parsed = new URL(url, window.location.origin);
        startLoading(`${parsed.pathname}${parsed.search}`);
      }
      return originalReplaceState(...args);
    };

    const handlePopState = () => {
      startLoading("__pending__");
    };

    document.addEventListener("click", handleClickCapture, true);
    window.addEventListener("popstate", handlePopState);

    return () => {
      document.removeEventListener("click", handleClickCapture, true);
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      clearTimers();
    };
  }, []);

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

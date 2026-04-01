"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import BrandedLoadingScreen from "@/components/BrandedLoadingScreen";

type LoadingState = {
  visible: boolean;
  label: string;
  detail: string;
  progress: number | null;
};

type LoadingOptions = Partial<Omit<LoadingState, "visible">>;

type LoadingContextValue = {
  startLoading: (options?: LoadingOptions) => void;
  updateLoading: (options?: LoadingOptions) => void;
  stopLoading: () => void;
};

const GlobalLoadingContext = createContext<LoadingContextValue | null>(null);

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) {
    throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  }
  return ctx;
}

export default function GlobalLoadingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const hideTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<LoadingState>({
    visible: false,
    label: "Yukleniyor",
    detail: "Islem suruyor",
    progress: null,
  });

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const api = useMemo<LoadingContextValue>(
    () => ({
      startLoading(options) {
        clearHideTimer();
        setState({
          visible: true,
          label: options?.label ?? "Yukleniyor",
          detail: options?.detail ?? "Islem suruyor",
          progress: options?.progress ?? 8,
        });
      },
      updateLoading(options) {
        setState((prev) => ({
          visible: true,
          label: options?.label ?? prev.label,
          detail: options?.detail ?? prev.detail,
          progress:
            typeof options?.progress === "number" || options?.progress === null
              ? options.progress
              : prev.progress,
        }));
      },
      stopLoading() {
        clearHideTimer();
        setState((prev) => ({ ...prev, progress: 100 }));
        hideTimerRef.current = window.setTimeout(() => {
          setState((prev) => ({ ...prev, visible: false, progress: 0 }));
        }, 180);
      },
    }),
    []
  );

  return (
    <GlobalLoadingContext.Provider value={api}>
      {children}
      {state.visible ? (
        <BrandedLoadingScreen
          overlay
          label={state.label}
          detail={state.detail}
          progress={state.progress}
        />
      ) : null}
    </GlobalLoadingContext.Provider>
  );
}

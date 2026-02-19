"use client";

import { useEffect } from "react";

// Some browsers / Next dev tools can throw when measure() receives bad marks.
// Guard to prevent runtime from breaking.
export default function PerfMeasureGuard() {
  useEffect(() => {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
    const orig = performance.measure.bind(performance);
    performance.measure = (name: string, start?: any, end?: any) => {
      try {
        // @ts-ignore
        return orig(name, start, end);
      } catch (err) {
        console.warn("[perf-guard]", err);
        return undefined as any;
      }
    };
    return () => {
      performance.measure = orig;
    };
  }, []);
  return null;
}

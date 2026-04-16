"use client";

import { useEffect } from "react";

const THROTTLE_MS = 5 * 60 * 1000;
const STORAGE_KEY = "task_sync_last_run_at";

export default function TaskSyncBoot() {
  useEffect(() => {
    try {
      const now = Date.now();
      const lastRun = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
      if (Number.isFinite(lastRun) && now - lastRun < THROTTLE_MS) return;
      localStorage.setItem(STORAGE_KEY, String(now));
      void fetch("/api/tasks/sync", { method: "POST", keepalive: true }).catch(() => null);
    } catch {
      // ignore
    }
  }, []);

  return null;
}


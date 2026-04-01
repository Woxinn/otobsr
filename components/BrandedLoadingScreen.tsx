import Logo from "@/components/Logo";

export default function BrandedLoadingScreen({
  fullscreen = true,
  overlay = false,
  label = "Yukleniyor",
  detail = "Veriler hazirlaniyor",
  progress,
}: {
  fullscreen?: boolean;
  overlay?: boolean;
  label?: string;
  detail?: string;
  progress?: number | null;
}) {
  const safeProgress = typeof progress === "number" && Number.isFinite(progress)
    ? Math.max(0, Math.min(100, progress))
    : null;

  return (
    <div
      className={
        fullscreen
          ? `min-h-screen w-full ${overlay ? "fixed inset-0 z-[9999]" : ""} flex items-center justify-center bg-[radial-gradient(circle_at_top,rgba(15,61,62,0.12),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,244,235,0.96))] px-6 py-10 backdrop-blur-md`
          : "flex items-center justify-center px-6 py-10"
      }
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-black/10 bg-white/85 px-10 py-10 shadow-[0_40px_90px_-50px_rgba(12,45,52,0.65)] backdrop-blur">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[var(--ocean)]/35 to-transparent" />
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="rounded-[28px] border border-black/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,244,239,0.88))] px-8 py-6 shadow-[0_24px_50px_-36px_rgba(15,61,62,0.55)]">
            <Logo className="h-16 w-auto" alt="Oto Basar" />
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[var(--ocean)]/80">
              {label}
            </div>
            <div className="text-sm text-black/55">{detail}</div>
          </div>

          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--ocean)]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--ocean)]/70 [animation-delay:120ms]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--clay)]/80 [animation-delay:240ms]" />
          </div>

          <div className="w-full max-w-[16rem] space-y-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-black/8">
              {safeProgress == null ? (
                <div className="h-full w-1/3 animate-[loading-bar_0.95s_ease-infinite] rounded-full bg-[linear-gradient(90deg,var(--ocean),var(--clay))]" />
              ) : (
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--ocean),var(--clay))] transition-[width] duration-300 ease-out"
                  style={{ width: `${safeProgress}%` }}
                />
              )}
            </div>
            {safeProgress != null ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">
                %{Math.round(safeProgress)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

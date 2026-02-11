export default function AppLoading() {
  return (
    <div className="min-h-screen w-full bg-[radial-gradient(circle_at_top,rgba(15,61,62,0.08),transparent_55%),linear-gradient(180deg,#faf7f1,rgba(247,244,235,0.9))] px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-3xl border border-black/10 bg-white/80 p-10 shadow-[0_30px_60px_-40px_rgba(15,61,62,0.5)] backdrop-blur">
          <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-3">
              <div className="h-4 w-28 rounded-full bg-black/10" />
              <div className="h-8 w-64 rounded-2xl bg-black/10" />
              <div className="h-3 w-40 rounded-full bg-black/10" />
            </div>
            <div className="h-10 w-40 rounded-full bg-black/10" />
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div
                key={`card-${idx}`}
                className="h-28 rounded-2xl border border-black/10 bg-white/70 shadow-[0_20px_40px_-30px_rgba(15,61,62,0.45)]"
              />
            ))}
          </div>

          <div className="mt-10 space-y-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={`row-${idx}`}
                className="h-12 rounded-2xl border border-black/10 bg-white/70"
              />
            ))}
          </div>

          <div className="mt-10 flex items-center gap-3">
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#0f3d3e]" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#0f3d3e]/70" />
            <div className="h-2 w-2 animate-pulse rounded-full bg-[#0f3d3e]/40" />
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-black/50">
              Yukleniyor
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

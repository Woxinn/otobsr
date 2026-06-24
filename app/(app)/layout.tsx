import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUserRole } from "@/lib/roles";
import TaskPanel from "@/components/TaskPanel";
import { ToastProvider } from "@/components/ToastProvider";
import TaskSyncBoot from "@/components/TaskSyncBoot";
import Header from "@/components/Header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await getCurrentUserRole(supabase, user);

  const email = user?.email ?? "Admin";

  return (
    <div className="min-h-screen text-[var(--ink)] bg-slate-50/50">
      <Header email={email} role={role} />

      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:pt-8">
        <ToastProvider>
          <main>{children}</main>
        </ToastProvider>
      </div>
      {role !== "Satis" ? <TaskSyncBoot /> : null}
      {role !== "Satis" ? (
        <Suspense fallback={null}>
          <TaskPanel />
        </Suspense>
      ) : null}
    </div>
  );
}

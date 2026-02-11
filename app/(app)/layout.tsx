import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import { syncTasks } from "@/lib/tasks";
import SignOutButton from "@/components/SignOutButton";
import TaskPanel from "@/components/TaskPanel";
import { ToastProvider } from "@/components/ToastProvider";
import Logo from "@/components/Logo";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await syncTasks();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { role } = await getCurrentUserRole();

  return (
    <div className="min-h-screen text-[var(--ink)]">
      <div className="mx-auto max-w-7xl px-6 pb-24 pt-10">
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-32 items-center justify-center rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-sm">
              <Logo className="h-auto w-full object-contain" alt="Oto Basar" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-black/40">
                Ithalat Takip Sistemi
              </p>
              <h1 className="text-2xl font-semibold [font-family:var(--font-display)]">
                Deniz yolu ithalat operasyonu
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm text-black/60">
            <span>{user?.email ?? "Admin"}</span>
            <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
              {role}
            </span>
            <SignOutButton />
          </div>
        </header>

        <nav className="mb-10 flex flex-wrap gap-2 text-sm font-medium">
          {[
            { key: "dashboard", href: "/", label: "Dashboard" },
            { key: "shipments", href: "/shipments", label: "Shipments" },
            { key: "orders", href: "/orders", label: "Siparisler" },
            { key: "products", href: "/products", label: "Urunler" },
            { key: "product-groups", href: "/product-groups", label: "Urun Kategorileri" },
            { key: "gtips", href: "/gtips", label: "GTIP'ler" },
            { key: "product-types", href: "/product-types", label: "TSE Bilgileri" },
            { key: "documents", href: "/documents", label: "Belgeler" },
            { key: "suppliers", href: "/suppliers", label: "Tedarikciler" },
            { key: "forwarders", href: "/forwarders", label: "Forwarders" },
            { key: "ports", href: "/ports", label: "Limanlar" },
            { key: "document-types", href: "/document-types", label: "Evrak Tipleri" },
            { key: "users", href: "/users", label: "Kullanicilar" },
          ]
            .filter((item) => canViewModule(role, item.key))
            .map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full border border-black/10 bg-white px-4 py-2 transition hover:-translate-y-0.5 hover:bg-[var(--sand)]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ToastProvider>
          <main>{children}</main>
        </ToastProvider>
      </div>

      <TaskPanel />
    </div>
  );
}

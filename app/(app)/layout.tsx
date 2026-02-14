import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import { syncTasks } from "@/lib/tasks";
import SignOutButton from "@/components/SignOutButton";
import TaskPanel from "@/components/TaskPanel";
import { ToastProvider } from "@/components/ToastProvider";
import Logo from "@/components/Logo";

const roleLabel = (role: string) => {
  if (role === "Yonetim") return "Yönetim";
  if (role === "Satis") return "Satış";
  return "Admin";
};

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
        <header className="mb-10">
          <div className="md:hidden">
            <div className="mx-auto mb-3 flex h-16 w-40 items-center justify-center rounded-2xl border border-black/10 bg-white px-3 py-2 shadow-sm">
              <Logo className="mx-auto block h-full w-auto object-contain" alt="Oto Basar" />
            </div>
            <h1 className="header-cool-title text-center text-lg font-semibold [font-family:var(--font-display)]">
              İthalat Takip Sistemi
            </h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-black/60">
              <span className="max-w-[70vw] truncate">{user?.email ?? "Admin"}</span>
              <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
                {roleLabel(role)}
              </span>
              <SignOutButton />
            </div>
          </div>

          <div className="relative hidden min-h-[56px] items-center md:flex">
            <div className="pr-64">
              <h1 className="header-cool-title text-2xl font-semibold [font-family:var(--font-display)]">
                İthalat Takip Sistemi
              </h1>
            </div>
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <div className="flex h-20 w-56 items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 shadow-sm">
                <Logo className="mx-auto block h-full w-auto object-contain" alt="Oto Basar" />
              </div>
            </div>
            <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-3 text-sm text-black/60">
              <span>{user?.email ?? "Admin"}</span>
              <span className="rounded-full border border-black/10 bg-[var(--sand)] px-3 py-1 text-[11px] font-semibold text-black/70">
                {roleLabel(role)}
              </span>
              <SignOutButton />
            </div>
          </div>
        </header>

        <nav className="mb-10 flex flex-wrap gap-2 text-sm font-medium">
          {[
            { key: "dashboard", href: "/", label: "Dashboard" },
            { key: "shipments", href: "/shipments", label: "Shipments" },
            { key: "orders", href: "/orders", label: "Siparişler" },
            { key: "products", href: "/products", label: "Ürünler" },
            { key: "order-plan", href: "/siparis-plani", label: "Sipariş Planı" },
            { key: "rfqs", href: "/rfqs", label: "RFQ'lar" },
            { key: "product-groups", href: "/product-groups", label: "Ürün Kategorileri" },
            { key: "gtips", href: "/gtips", label: "GTIP'ler" },
            { key: "product-types", href: "/product-types", label: "TSE Bilgileri" },
            { key: "documents", href: "/documents", label: "Belgeler" },
            { key: "suppliers", href: "/suppliers", label: "Tedarikçiler" },
            { key: "forwarders", href: "/forwarders", label: "Forwarders" },
            { key: "ports", href: "/ports", label: "Limanlar" },
            { key: "document-types", href: "/document-types", label: "Evrak Tipleri" },
            { key: "users", href: "/users", label: "Kullanıcılar" },
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

import Link from "next/link";
import { Suspense } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canViewModule, getCurrentUserRole } from "@/lib/roles";
import SignOutButton from "@/components/SignOutButton";
import TaskPanel from "@/components/TaskPanel";
import { ToastProvider } from "@/components/ToastProvider";
import Logo from "@/components/Logo";
import AppVersionBadge from "@/components/AppVersionBadge";
import TaskSyncBoot from "@/components/TaskSyncBoot";
import {
  Anchor,
  BadgeCheck,
  Boxes,
  ClipboardList,
  FileStack,
  FileText,
  LayoutDashboard,
  MapPinned,
  Package,
  ScrollText,
  Settings,
  ShieldCheck,
  Ship,
  ShoppingCart,
  Tags,
  Truck,
  UserCog,
  Users,
} from "lucide-react";

type NavItem = {
  key?: string;
  href: string;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
};

const roleLabel = (role: string) => {
  if (role === "Yonetim") return "Yönetim";
  if (role === "Satis") return "Satış";
  return "Admin";
};

const primaryNav: NavItem[] = [
  {
    key: "dashboard",
    href: "/",
    label: "Dashboard",
    description: "Genel odak",
    icon: LayoutDashboard,
  },
  {
    key: "shipments",
    href: "/shipments",
    label: "Sevkiyatlar",
    description: "ETA ve dosya",
    icon: Ship,
  },
  {
    key: "orders",
    href: "/orders",
    label: "Siparişler",
    description: "Satınalma akışı",
    icon: ShoppingCart,
  },
  {
    key: "products",
    href: "/products",
    label: "Ürünler",
    description: "Kart ve stok",
    icon: Package,
  },
  {
    key: "order-plan",
    href: "/siparis-plani",
    label: "Sipariş Planı",
    description: "İhtiyaç hesabı",
    icon: ClipboardList,
  },
  {
    key: "rfqs",
    href: "/rfqs",
    label: "RFQ",
    description: "Teklif toplama",
    icon: FileText,
  },
  {
    key: "proformas",
    href: "/proformalar",
    label: "Proformalar",
    description: "Proforma takibi",
    icon: ScrollText,
  },
];

const planningNav: NavItem[] = [
  {
    key: "order-plan",
    href: "/konteyner-planlama",
    label: "Konteyner Planlama",
    description: "Yük ve hacim planı",
    icon: Boxes,
  },
];

const libraryNav: NavItem[] = [
  {
    key: "suppliers",
    href: "/suppliers",
    label: "Tedarikçiler",
    description: "Cari ve performans",
    icon: Users,
  },
  {
    key: "product-groups",
    href: "/product-groups",
    label: "Ürün Kategorileri",
    description: "Nitelik şablonları",
    icon: Tags,
  },
  {
    key: "gtips",
    href: "/gtips",
    label: "GTİP'ler",
    description: "Vergi ve maliyet",
    icon: BadgeCheck,
  },
  {
    key: "product-types",
    href: "/product-types",
    label: "TSE Bilgileri",
    description: "Uyumluluk kayıtları",
    icon: ShieldCheck,
  },
  {
    key: "documents",
    href: "/documents",
    label: "Belgeler",
    description: "Evrak arşivi",
    icon: FileStack,
  },
];

const operationSetupNav: NavItem[] = [
  {
    key: "forwarders",
    href: "/forwarders",
    label: "Lojistik Firmaları",
    description: "Forwarder kartları",
    icon: Truck,
  },
  {
    key: "ports",
    href: "/ports",
    label: "Limanlar",
    description: "Çıkış ve varış",
    icon: Anchor,
  },
  {
    key: "document-types",
    href: "/document-types",
    label: "Evrak Tipleri",
    description: "Checklist tanımları",
    icon: MapPinned,
  },
  {
    key: "users",
    href: "/users",
    label: "Kullanıcılar",
    description: "Rol yönetimi",
    icon: UserCog,
  },
  {
    href: "/device-requests",
    label: "Cihaz Onayları",
    description: "Güvenli erişim",
    icon: Settings,
    adminOnly: true,
  },
];

const navLinkClass =
  "group flex min-h-[68px] items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/15";

const compactNavLinkClass =
  "group flex items-center gap-3 rounded-lg border border-black/8 bg-white px-3 py-2 transition hover:-translate-y-0.5 hover:border-black/15 hover:shadow-sm";

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

  const visibleItems = (items: NavItem[]) =>
    items.filter((item) => {
      if (item.adminOnly && role !== "Admin") return false;
      if (!item.key) return true;
      return canViewModule(role, item.key);
    });

  const visiblePrimaryNav = visibleItems(primaryNav);
  const navGroups = [
    {
      label: "Planlama",
      description: "Konteyner ve operasyon araçları",
      items: visibleItems(planningNav),
    },
    {
      label: "Kütüphane",
      description: "Tedarikçi, ürün ve uyumluluk",
      items: visibleItems(libraryNav),
    },
    {
      label: "Ayarlar",
      description: "Tanımlar ve yönetim",
      items: visibleItems(operationSetupNav),
    },
  ].filter((group) => group.items.length > 0);

  const email = user?.email ?? "Admin";
  const initial = email.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="min-h-screen text-[var(--ink)]">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:pt-8">
        <header className="mb-8 space-y-3">
          <div className="rounded-lg border border-black/10 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <Link href="/" className="flex min-w-0 items-center gap-4">
                <span className="flex h-14 w-36 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-white px-3 py-2 shadow-sm">
                  <Logo className="h-full w-auto object-contain" alt="Oto Başar" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.28em] text-black/40">
                    Oto Başar
                  </span>
                  <span className="mt-1 block truncate text-2xl font-semibold leading-tight [font-family:var(--font-display)]">
                    İthalat Takip Sistemi
                  </span>
                  <span className="mt-1 block text-xs font-medium text-black/50">
                    Operasyon, satınalma ve sevkiyat kontrol merkezi
                  </span>
                </span>
              </Link>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 items-center gap-3 rounded-lg border border-black/10 bg-slate-50 px-3 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#101817] text-sm font-bold text-white">
                    {initial}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[260px] truncate text-sm font-semibold text-black/75">
                      {email}
                    </span>
                    <span className="mt-0.5 inline-flex rounded-md border border-black/10 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/50">
                      {roleLabel(role)}
                    </span>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <AppVersionBadge className="rounded-lg border-black/10 bg-slate-50 text-black/45" />
                  <Link
                    href="/account"
                    className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/65 transition hover:-translate-y-0.5 hover:bg-slate-50"
                  >
                    Hesap
                  </Link>
                  <SignOutButton className="rounded-lg border border-black/10 bg-[#101817] px-3 py-2 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-black" />
                </div>
              </div>
            </div>
          </div>

          <nav className="rounded-lg border border-black/10 bg-[#101817] p-2 shadow-sm">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {visiblePrimaryNav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={navLinkClass}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white transition group-hover:bg-white group-hover:text-[#101817]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-medium text-white/45">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>

            {navGroups.length ? (
              <div className="mt-2 grid gap-2 lg:grid-cols-3">
                {navGroups.map((group) => (
                  <details
                    key={group.label}
                    className="group rounded-lg border border-white/10 bg-white/[0.06]"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span>
                        <span className="block text-sm font-semibold text-white">
                          {group.label}
                        </span>
                        <span className="mt-0.5 block text-[11px] font-medium text-white/42">
                          {group.description}
                        </span>
                      </span>
                      <span className="rounded-md border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-bold text-white/65 transition group-open:bg-white group-open:text-[#101817]">
                        {group.items.length}
                      </span>
                    </summary>
                    <div className="grid gap-2 border-t border-white/10 bg-white/95 p-2 sm:grid-cols-2">
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={compactNavLinkClass}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-black/65 transition group-hover:bg-[#101817] group-hover:text-white">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-xs font-semibold text-black/75">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] font-medium text-black/45">
                                {item.description}
                              </span>
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            ) : null}
          </nav>
        </header>

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

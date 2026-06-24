"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import AppVersionBadge from "@/components/AppVersionBadge";
import SignOutButton from "@/components/SignOutButton";
import {
  LayoutDashboard,
  Ship,
  ShoppingCart,
  Package,
  ClipboardList,
  FileText,
  ScrollText,
  Boxes,
  Users,
  Tags,
  BadgeCheck,
  ShieldCheck,
  FileStack,
  Truck,
  Anchor,
  MapPinned,
  UserCog,
  Settings,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  LogOut,
  User as UserIcon,
} from "lucide-react";

interface HeaderProps {
  email: string;
  role: string;
}

const canViewModuleClient = (role: string, moduleKey: string) => {
  if (role === "Satis") {
    return moduleKey === "orders" || moduleKey === "products";
  }
  return true;
};

export default function Header({ email, role }: HeaderProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<"planlama" | "kutuphane" | "ayarlar" | "profile" | null>(null);

  // Mobile accordions
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  const roleLabel = (r: string) => {
    if (r === "Yonetim") return "Yönetim";
    if (r === "Satis") return "Satış";
    return "Admin";
  };

  const initial = email.trim().charAt(0).toUpperCase() || "A";

  // Navigation configurations
  const primaryNav = [
    { key: "dashboard", href: "/", label: "Dashboard", icon: LayoutDashboard },
    { key: "shipments", href: "/shipments", label: "Sevkiyatlar", icon: Ship },
    { key: "orders", href: "/orders", label: "Siparişler", icon: ShoppingCart },
    { key: "products", href: "/products", label: "Ürünler", icon: Package },
    { key: "order-plan", href: "/siparis-plani", label: "Sipariş Planı", icon: ClipboardList },
    { key: "rfqs", href: "/rfqs", label: "RFQ", icon: FileText },
    { key: "proformas", href: "/proformalar", label: "Proformalar", icon: ScrollText },
  ];

  const planningNav = [
    { key: "order-plan", href: "/konteyner-planlama", label: "Konteyner Planlama", description: "Yük ve hacim planı", icon: Boxes },
  ];

  const libraryNav = [
    { key: "suppliers", href: "/suppliers", label: "Tedarikçiler", description: "Cari ve performans", icon: Users },
    { key: "product-groups", href: "/product-groups", label: "Ürün Kategorileri", description: "Nitelik şablonları", icon: Tags },
    { key: "gtips", href: "/gtips", label: "GTİP'ler", description: "Vergi ve maliyet", icon: BadgeCheck },
    { key: "product-types", href: "/product-types", label: "TSE Bilgileri", description: "Uyumluluk kayıtları", icon: ShieldCheck },
    { key: "documents", href: "/documents", label: "Belgeler", description: "Evrak arşivi", icon: FileStack },
  ];

  const operationSetupNav = [
    { key: "forwarders", href: "/forwarders", label: "Lojistik Firmaları", description: "Forwarder kartları", icon: Truck },
    { key: "ports", href: "/ports", label: "Limanlar", description: "Çıkış ve varış", icon: Anchor },
    { key: "document-types", href: "/document-types", label: "Evrak Tipleri", description: "Checklist tanımları", icon: MapPinned },
    { key: "users", href: "/users", label: "Kullanıcılar", description: "Rol yönetimi", icon: UserCog },
    { key: "device-requests", href: "/device-requests", label: "Cihaz Onayları", description: "Güvenli erişim", icon: Settings, adminOnly: true },
  ];

  // Filtering based on role
  const visiblePrimaryNav = primaryNav.filter((item) => canViewModuleClient(role, item.key));
  const visiblePlanningNav = planningNav.filter((item) => canViewModuleClient(role, item.key));
  const visibleLibraryNav = libraryNav.filter((item) => canViewModuleClient(role, item.key));
  const visibleSettingsNav = operationSetupNav.filter((item) => {
    if (item.adminOnly && role !== "Admin") return false;
    return canViewModuleClient(role, item.key);
  });

  // Click outside dropdowns to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }, [isMobileMenuOpen]);

  const toggleDropdown = (name: "planlama" | "kutuphane" | "ayarlar" | "profile") => {
    setActiveDropdown(activeDropdown === name ? null : name);
  };

  const isLinkActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    return pathname.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/75 shadow-sm backdrop-blur-md no-print">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4" ref={dropdownRef}>
          {/* Logo Section */}
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="flex h-8 w-20 items-center justify-center rounded-lg border border-black/10 bg-white px-2 py-1 shadow-sm transition duration-150 hover:scale-[1.03]">
                <Logo className="h-full w-auto object-contain" alt="Oto Başar" />
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span className="text-sm font-semibold tracking-tight text-slate-800 leading-none">
                İthalat Takip
              </span>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {visiblePrimaryNav.map((item) => {
              const Icon = item.icon;
              const active = isLinkActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-950 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            {/* Dropdowns for Groups */}
            {visiblePlanningNav.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => toggleDropdown("planlama")}
                  type="button"
                  className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                    activeDropdown === "planlama" ? "bg-slate-100 text-slate-955" : "text-slate-600 hover:text-slate-955 hover:bg-slate-100"
                  }`}
                >
                  Planlama
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${activeDropdown === "planlama" ? "rotate-180" : ""}`} />
                </button>

                {activeDropdown === "planlama" && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_-12px_rgba(0,0,0,0.12)] animate-[fade-in_0.15s_ease-out]">
                    {visiblePlanningNav.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition group-hover:scale-105">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800 transition group-hover:text-blue-700">{item.label}</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-normal">{item.description}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {visibleLibraryNav.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => toggleDropdown("kutuphane")}
                  type="button"
                  className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                    activeDropdown === "kutuphane" ? "bg-slate-100 text-slate-955" : "text-slate-600 hover:text-slate-955 hover:bg-slate-100"
                  }`}
                >
                  Kütüphane
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${activeDropdown === "kutuphane" ? "rotate-180" : ""}`} />
                </button>

                {activeDropdown === "kutuphane" && (
                  <div className="absolute top-[calc(100%+6px)] left-0 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_-12px_rgba(0,0,0,0.12)] animate-[fade-in_0.15s_ease-out]">
                    {visibleLibraryNav.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 transition group-hover:scale-105">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800 transition group-hover:text-emerald-700">{item.label}</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-normal">{item.description}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {visibleSettingsNav.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => toggleDropdown("ayarlar")}
                  type="button"
                  className={`flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-150 ${
                    activeDropdown === "ayarlar" ? "bg-slate-100 text-slate-955" : "text-slate-600 hover:text-slate-955 hover:bg-slate-100"
                  }`}
                >
                  Ayarlar
                  <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${activeDropdown === "ayarlar" ? "rotate-180" : ""}`} />
                </button>

                {activeDropdown === "ayarlar" && (
                  <div className="absolute top-[calc(100%+6px)] right-0 z-50 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_45px_-12px_rgba(0,0,0,0.12)] animate-[fade-in_0.15s_ease-out]">
                    {visibleSettingsNav.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setActiveDropdown(null)}
                          className="group flex items-start gap-3 rounded-xl p-2.5 transition hover:bg-slate-50"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition group-hover:scale-105">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-bold text-slate-800 transition group-hover:text-indigo-700">{item.label}</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5 leading-normal">{item.description}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Right Section: Profile & Mobile Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Desktop Profile Icon */}
            <div className="relative hidden lg:block">
              <button
                onClick={() => toggleDropdown("profile")}
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-950 text-xs font-bold text-white shadow-sm transition hover:scale-105 hover:ring-2 hover:ring-slate-300"
              >
                {initial}
              </button>

              {activeDropdown === "profile" && (
                <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_45px_-12px_rgba(0,0,0,0.12)] animate-[fade-in_0.15s_ease-out] text-sm">
                  <div className="border-b border-slate-100 pb-3">
                    <p className="font-semibold text-slate-850 truncate">{email}</p>
                    <span className="mt-1 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      {roleLabel(role)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-1">
                    <Link
                      href="/account"
                      onClick={() => setActiveDropdown(null)}
                      className="flex items-center gap-2 rounded-xl px-2..5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <UserIcon className="h-4 w-4 text-slate-400" />
                      Hesabım
                    </Link>
                    <div className="flex items-center justify-between px-2.5 py-2">
                      <span className="text-xs text-slate-400">Uygulama Sürümü</span>
                      <AppVersionBadge className="border-none bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[9px] font-semibold" />
                    </div>
                    <div className="border-t border-slate-100 pt-2 mt-2">
                      <SignOutButton className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 lg:hidden"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-sm cursor-pointer"
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col h-[100dvh] max-h-[100dvh] animate-[slide-left_0.25s_ease-out]">
            {/* Drawer Header */}
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <div className="flex items-center gap-2">
                <Logo className="h-7 w-auto object-contain" alt="Oto Başar" />
                <span className="text-sm font-semibold tracking-tight text-slate-800">
                  Menü
                </span>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
              {/* Primary Links */}
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 px-2 mb-2">
                  Ana Sayfalar
                </p>
                {visiblePrimaryNav.map((item) => {
                  const Icon = item.icon;
                  const active = isLinkActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-all duration-150 ${
                        active
                          ? "bg-slate-100 text-slate-900"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="h-4.5 w-4.5 text-slate-500" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>

              {/* Accordion 1: Planlama */}
              {visiblePlanningNav.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setIsPlanningOpen(!isPlanningOpen)}
                    type="button"
                    className="flex w-full items-center justify-between px-2 text-xs font-bold uppercase tracking-[0.25em] text-slate-400"
                  >
                    <span>Planlama</span>
                    {isPlanningOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {isPlanningOpen && (
                    <div className="mt-2 space-y-1 pl-2">
                      {visiblePlanningNav.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Icon className="h-4 w-4 text-slate-400" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Accordion 2: Kütüphane */}
              {visibleLibraryNav.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setIsLibraryOpen(!isLibraryOpen)}
                    type="button"
                    className="flex w-full items-center justify-between px-2 text-xs font-bold uppercase tracking-[0.25em] text-slate-400"
                  >
                    <span>Kütüphane</span>
                    {isLibraryOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {isLibraryOpen && (
                    <div className="mt-2 space-y-1 pl-2">
                      {visibleLibraryNav.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Icon className="h-4 w-4 text-slate-400" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Accordion 3: Ayarlar */}
              {visibleSettingsNav.length > 0 && (
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    type="button"
                    className="flex w-full items-center justify-between px-2 text-xs font-bold uppercase tracking-[0.25em] text-slate-400"
                  >
                    <span>Ayarlar</span>
                    {isSettingsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                  {isSettingsOpen && (
                    <div className="mt-2 space-y-1 pl-2">
                      {visibleSettingsNav.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Icon className="h-4 w-4 text-slate-400" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {/* User Profile & Sign Out (Scrollable) */}
              <div className="border-t border-slate-100 pt-6 mt-6 space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-bold text-white shadow-sm">
                    {initial}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800 leading-none">
                      {email}
                    </p>
                    <span className="mt-1.5 inline-flex rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500 leading-none">
                      {roleLabel(role)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1 text-xs">
                  <Link
                    href="/account"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                  >
                    Hesabım
                  </Link>
                  <AppVersionBadge className="border-none bg-transparent text-slate-400 px-1 py-0.5 text-[9px] font-semibold" />
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <SignOutButton className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-black" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

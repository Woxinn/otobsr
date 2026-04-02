import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import RouteOverlayLoader from "@/components/RouteOverlayLoader";
import PerfMeasureGuard from "@/components/PerfMeasureGuard";
import GlobalLoadingProvider from "@/components/GlobalLoadingProvider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "İthalat Takip Sistemi",
  description: "Çin deniz ithalat operasyon takibi için web tabanlı sistem",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${spaceGrotesk.variable} ${fraunces.variable} antialiased`}
      >
        <GlobalLoadingProvider>
          <Suspense fallback={null}>
            <RouteOverlayLoader />
          </Suspense>
          <PerfMeasureGuard />
          {children}
        </GlobalLoadingProvider>
      </body>
    </html>
  );
}


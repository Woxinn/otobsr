import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import RouteOverlayLoader from "@/components/RouteOverlayLoader";

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
        <Suspense fallback={null}>
          <RouteOverlayLoader />
        </Suspense>
        {children}
      </body>
    </html>
  );
}

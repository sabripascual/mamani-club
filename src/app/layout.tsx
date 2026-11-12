import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/pwa/service-worker";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "MAMANÍ CLUB",
  description: "La cuenta de nuestras juntadas.",
  applicationName: "MAMANÍ CLUB",
  appleWebApp: { capable: true, title: "Mamaní Club", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#F8F5F0",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR" className={`${fraunces.variable} ${manrope.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

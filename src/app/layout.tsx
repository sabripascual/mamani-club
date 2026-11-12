import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/pwa/service-worker";

// Tipografías redondeadas, en armonía con el logo: Fredoka (títulos) y Nunito (interfaz).
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-title", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

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
    <html lang="es-AR" className={`${fredoka.variable} ${nunito.variable}`}>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Las pantallas ya visitadas se reusan 30 s al volver (atrás, cambiar de pestaña):
    // la navegación es instantánea. Cargar o editar algo las refresca igual (revalidatePath).
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [
      {
        // El service worker nunca se cachea, así las actualizaciones llegan enseguida.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;

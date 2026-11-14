/*
 * Service worker de MAMANÍ CLUB.
 * - Archivos estáticos con hash (/_next/static, /icons): primero caché.
 * - Páginas: siempre red (nunca cacheamos datos financieros ni fotos privadas);
 *   si no hay conexión, se muestra /offline.html.
 * - Supabase y cualquier otro origen: no se tocan.
 * - Notificaciones push: título + texto + ícono; al tocarla abre la pantalla de esa
 *   notificación (gasto, juntada, evento…), aunque la app ya esté abierta.
 * Cambiar VERSION fuerza a que las instalaciones viejas limpien su caché.
 */
const VERSION = "v6";
const STATIC_CACHE = `mamani-static-${VERSION}`;
// La pantalla sin conexión, con sus fuentes y el logo (tienen que estar antes de perder la red).
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/fonts/fredoka-latin.woff2", "/fonts/nunito-latin.woff2", "/brand/wordmark-sm.png"];

self.addEventListener("install", (event) => {
  // Se activa enseguida: así las notificaciones las maneja siempre la versión nueva.
  // Es seguro porque este service worker solo cachea archivos estáticos.
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "MAMANÍ CLUB", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "MAMANÍ CLUB", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || "/" },
    }),
  );
});

// Si la app ya está abierta, la lleva a la pantalla de la notificación. iPhone no permite
// navigate() desde el service worker: en ese caso le pedimos a la app que navegue ella.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (wins) => {
      const win = wins.find((w) => "focus" in w);
      if (!win) return self.clients.openWindow(url);
      const focused = (await win.focus().catch(() => null)) || win;
      if (focused.url === url) return;
      try {
        if (!("navigate" in focused)) throw new Error("sin navigate");
        const res = await focused.navigate(url);
        if (!res) throw new Error("no navegó");
      } catch {
        focused.postMessage({ type: "mc:navigate", url });
      }
    }),
  );
});

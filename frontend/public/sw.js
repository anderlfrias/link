// Service worker mínimo, solo para Web Push — no cachea nada ni intercepta
// `fetch` (no es un "offline-first PWA sw", ver frontend/src/features/notifications/README.md).
// Vive en /public (no pasa por el bundler) porque el navegador lo pide como
// script plano en la raíz del sitio, con ese scope exacto.

self.addEventListener("install", () => {
  // No esperar a que se cierren las pestañas viejas: sin esto, recién se
  // activaría en la próxima carga completa, y el usuario que acaba de
  // aceptar notificaciones no recibiría push hasta recargar.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const { title, body, url, tag, kind, ringMs } = payload;

  if (kind === "call") {
    event.waitUntil(showCallNotification({ title, body, url, tag, ringMs }));
    return;
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      data: { url },
    }),
  );
});

// Cuánto se deja visible una llamada entrante si el push no dice cuánto suena.
// Normalmente lo dice (`ringMs`, el mismo tiempo que el servidor la deja sonar):
// una notificación de llamada que sigue ahí cuando ya terminó engaña.
const DEFAULT_CALL_NOTIFICATION_MS = 30000;

async function showCallNotification({ title, body, url, tag, ringMs }) {
  // App en primer plano: el modal de llamada entrante ya la anuncia con tono,
  // una notificación del sistema encima sería duplicada.
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clients.some((client) => client.focused)) return;

  await self.registration.showNotification(title, {
    body,
    tag,
    icon: "/icons/icon-192.png",
    data: { url, kind: "call" },
    requireInteraction: true,
    renotify: true,
    vibrate: [300, 150, 300, 150, 300],
  });

  // Mantiene vivo el SW y retira la notificación si nadie la atendió.
  const visibleMs = typeof ringMs === "number" && ringMs > 0 ? ringMs : DEFAULT_CALL_NOTIFICATION_MS;
  await new Promise((resolve) => setTimeout(resolve, visibleMs));
  const stale = await self.registration.getNotifications({ tag });
  stale.forEach((notification) => notification.close());
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data ?? {};

  event.waitUntil(openOrFocusApp(data.url ?? "/", data.kind));
});

async function openOrFocusApp(targetUrl, kind) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  if (kind === "call") {
    // El modal de llamada entrante es global (se ve en cualquier ruta): alcanza con
    // traer al frente una ventana de la app. Navegarla la recargaría (y cortaría lo
    // que esté haciendo la persona); abrir otra duplicaría la conexión y la llamada
    // sonaría en las dos. Sin ninguna abierta, la app que se abre pregunta al
    // servidor por la llamada que suena (`call:sync`) y la muestra.
    const open = clients.find((client) => client.focused) ?? clients.find((client) => client.visibilityState === "visible") ?? clients[0];
    if (open) return open.focus();
    return self.clients.openWindow(targetUrl);
  }

  const existing = clients.find((client) => new URL(client.url).pathname === targetUrl);
  if (existing) return existing.focus();
  return self.clients.openWindow(targetUrl);
}

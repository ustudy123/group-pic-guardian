// Service worker do Portal do Encarregado (Macro Ambiental).
// Responsável por: (1) tornar o portal instalável como aplicativo (PWA) e
// (2) exibir notificações push (avisos de foto reprovada etc.).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    /* push sem payload (ou payload não-JSON) usa a mensagem padrão */
  }
  const title = data.title || "Macro Ambiental";
  const body =
    data.body || "Você tem novos avisos no portal. Toque para abrir e conferir.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/portal-192.png",
      badge: "/icons/portal-192.png",
      vibrate: [180, 80, 180],
      tag: data.tag || "portal-aviso",
      renotify: true,
      data: { url: data.url || "/portal" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/portal";
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if (w.url.includes("/portal") && "focus" in w) return w.focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});

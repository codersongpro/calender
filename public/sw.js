// Intentionally does not cache anything: this app always needs fresh data,
// so the only job of this service worker is to satisfy the "installable"
// requirement some browsers check before allowing an add-to-home-screen /
// desktop shortcut prompt (beforeinstallprompt silently never fires
// without one).
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// A registered fetch handler is itself part of Chrome's installability
// check on many versions - without one, beforeinstallprompt can simply
// never fire even though the service worker is otherwise active, which
// silently forces "바로가기 추가" to always fall back to manual
// instructions. This passes every request straight through to the
// network, so it changes nothing about how requests are served.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

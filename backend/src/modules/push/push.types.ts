export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface SubscribeInput {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

/// Payload que recibe el service worker en el evento `push` (ver
/// frontend/public/sw.js) — el JSON ya elegido por nosotros, no el sobre
/// cifrado que viaja por la red (eso lo arma `web-push`).
export interface PushPayload {
  title: string;
  body: string;
  /// Ruta (no URL completa) a la que navegar al clickear la notificación.
  url: string;
  /// Mismo `tag` reemplaza la notificación anterior de esa conversación en
  /// vez de apilarlas — igual criterio que ya usaba `showNotification` en
  /// el frontend (ver utils/browser-notifications.ts).
  tag: string;
  /// "call": llamada entrante — el service worker la muestra con vibración/persistente y
  /// la omite si la app ya está en primer plano (el modal de llamada ya la anuncia).
  kind?: "message" | "call";
  /// Solo en `kind: "call"`: cuánto sigue sonando la llamada, en ms desde que se
  /// envió el push. Relativo y no una hora absoluta, para no depender de que el
  /// reloj del dispositivo coincida con el del servidor. El service worker deja la
  /// notificación visible ese tiempo.
  ringMs?: number;
}

/// Cómo entregar un push, además de su contenido (`web-push`: `TTL` y `urgency`).
export interface PushDeliveryOptions {
  /// Cuánto lo guarda el servicio push si el dispositivo no está disponible. Sin
  /// esto es el default de `web-push`: 4 semanas.
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

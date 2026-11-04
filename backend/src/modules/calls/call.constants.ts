/// Cuánto suena una llamada antes de darla por no contestada. Es el mismo valor
/// para todo: el worker que la vence (`call-ring-timeout.worker.ts`), el `TTL`
/// del push de llamada entrante y lo que el service worker deja visible la
/// notificación. Una llamada que nadie atiende no puede quedar sonando para
/// siempre: mientras lo hace, llamante y receptor figuran "ocupados" para
/// cualquier otra llamada (`findActiveCallForUser` cuenta `RINGING`).
export const CALL_RING_TIMEOUT_MS = 45_000;

/// Largo máximo de la respuesta rápida con la que se rechaza una llamada ("No
/// puedo hablar ahora..."). Es un texto corto de un renglón, no un mensaje
/// cualquiera.
export const CALL_REPLY_MAX_LENGTH = 200;

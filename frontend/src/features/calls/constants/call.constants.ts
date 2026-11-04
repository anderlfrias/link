/** Cuánto suena una llamada antes de que el servidor la dé por no contestada: el mismo valor que
 * `CALL_RING_TIMEOUT_MS` del backend (backend/src/modules/calls/call.constants.ts). Si dejaran de
 * coincidir, lo único que cambia es cuándo salta el temporizador de seguridad de abajo. */
export const CALL_RING_TIMEOUT_MS = 45_000;

/** Tope de seguridad de una llamada que sigue "sonando" en pantalla: el timeout del servidor más el
 * intervalo del worker que la vence (5 s) y un margen. Si el aviso de que terminó se perdió (la
 * pestaña estaba en segundo plano, o el socket se cayó justo entonces), la pantalla no puede quedar
 * "Llamando..." para siempre. */
export const CALL_RING_SAFETY_MS = CALL_RING_TIMEOUT_MS + 10_000;

/** Largo máximo de la respuesta rápida al rechazar una llamada: el mismo que valida el backend
 * (`CALL_REPLY_MAX_LENGTH`). */
export const CALL_REPLY_MAX_LENGTH = 200;

/** Cuánto queda a la vista el resultado de una llamada que no se conectó ("Sin respuesta"). */
export const CALL_OUTCOME_DISMISS_MS = 8_000;

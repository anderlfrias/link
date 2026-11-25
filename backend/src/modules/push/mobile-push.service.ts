import env from "../../config/env";
import { getLogger } from "../../config/request-context";
import { NotFoundError } from "../../utils/errors";
import * as MobilePushRepository from "./mobile-push.repository";

/// Servicio de push de Expo (reparte a FCM y APNs). El host es fijo y está acá, no
/// sale de ningún dato del cliente: no hay riesgo de SSRF como en Web Push, donde
/// la URL de destino la elige quien se suscribe.
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
/// Expo recibe hasta 100 mensajes por pedido.
const EXPO_BATCH_SIZE = 100;
const EXPO_TIMEOUT_MS = 10_000;
/// Un aviso viejo no sirve: si el teléfono no está disponible en este tiempo, se descarta.
const NOTIFICATION_TTL_SECONDS = 60 * 60;

export function isMobilePushEnabled(): boolean {
  return env.MOBILE_PUSH_ENABLED;
}

/// A propósito GENÉRICO: este camino pasa en claro por Expo, Google y Apple, así
/// que el aviso no lleva el texto del mensaje, ni quién lo escribe, ni el nombre
/// del grupo. La app, ya autenticada, trae el contenido desde este servidor.
const GENERIC_BODY: Record<string, string> = {
  es: "Tienes un mensaje nuevo",
  en: "You have a new message",
};
const TITLE = "LINK";
const GENERIC_CALL_BODY: Record<string, string> = {
  es: "Tienes una llamada entrante",
  en: "You have an incoming call",
};

function bodyFor(language: string): string {
  return GENERIC_BODY[language] ?? GENERIC_BODY.es;
}

export async function registerDevice(userId: string, token: string, platform: "ios" | "android"): Promise<void> {
  if (!isMobilePushEnabled()) {
    throw new NotFoundError("Las notificaciones móviles no están habilitadas", "mobile_push_disabled");
  }
  await MobilePushRepository.upsertDevice(userId, token, platform);
}

/// Como en Web Push: solo borra un dispositivo de la propia cuenta, y no hay error si
/// no existe (el resultado, que ese teléfono no reciba avisos, es el mismo).
export async function unregisterDevice(userId: string, token: string): Promise<void> {
  await MobilePushRepository.deleteDeviceForUser(token, userId);
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { type: "message" | "call"; conversationId: string };
  sound: "default" | null;
  priority: "high";
  ttl: number;
  channelId: "messages" | "calls";
}

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}

/// Avisa de un mensaje nuevo a los dispositivos de `userIds`. Lo llama `messages` para
/// quien no tiene ESA conversación abierta, igual que Web Push. Nunca lanza ni hace
/// falta esperarlo: un push caído no debe demorar ni tumbar el envío del mensaje.
///
/// Solo viajan el id de la conversación (para abrirla al tocar el aviso) y un texto
/// genérico. Nunca se loguean tokens ni contenido.
export async function notifyNewMessage(userIds: string[], conversationId: string): Promise<void> {
  await notify(userIds, conversationId, "message");
}

/// Avisa de una llamada entrante. Igual de genérico que un mensaje: ni quién llama ni el tipo de
/// llamada. Vive lo que suena la llamada (`ttlSeconds`): un aviso vencido no sirve. La app, al
/// abrirse, pregunta con `call:sync` cuál es la llamada que suena (ver calls/README.md).
export async function notifyIncomingCall(userId: string, conversationId: string, ttlSeconds: number): Promise<void> {
  await notify([userId], conversationId, "call", ttlSeconds);
}

async function notify(
  userIds: string[],
  conversationId: string,
  kind: "message" | "call",
  ttlSeconds: number = NOTIFICATION_TTL_SECONDS,
): Promise<void> {
  if (!isMobilePushEnabled() || userIds.length === 0) return;
  try {
    const devices = await MobilePushRepository.findForUsers(userIds);
    if (devices.length === 0) return;

    const messages: ExpoMessage[] = devices.map((device) => ({
      to: device.token,
      title: TITLE,
      body: (kind === "call" ? GENERIC_CALL_BODY : GENERIC_BODY)[device.user.language] ?? (kind === "call" ? GENERIC_CALL_BODY : GENERIC_BODY).es,
      data: { type: kind, conversationId },
      sound: device.user.notificationSoundEnabled ? "default" : null,
      priority: "high",
      ttl: ttlSeconds,
      channelId: kind === "call" ? "calls" : "messages",
    }));

    const invalid: string[] = [];
    for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
      const batch = messages.slice(start, start + EXPO_BATCH_SIZE);
      const tickets = await sendBatch(batch);
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          invalid.push(batch[index].to);
        }
      });
    }

    // Expo avisa que el token ya no sirve (se desinstaló la app, cambió el token): se
    // limpia para no reintentar con cada mensaje.
    if (invalid.length > 0) {
      await MobilePushRepository.deleteDevicesByTokens(invalid).catch(() => undefined);
    }
  } catch (error) {
    getLogger().warn({ err: error, conversationId }, "mobile push failed");
  }
}

async function sendBatch(batch: ExpoMessage[]): Promise<ExpoTicket[]> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(batch),
    signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
  });
  if (!response.ok) {
    getLogger().warn({ status: response.status }, "expo push service rejected the request");
    return [];
  }
  const json = (await response.json()) as { data?: unknown };
  return Array.isArray(json.data) ? (json.data as ExpoTicket[]) : [];
}

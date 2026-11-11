import { createHmac } from "node:crypto";
import env from "../../config/env";

/// Servidores ICE para las llamadas (STUN y, si la organización lo configuró, TURN).
///
/// Antes eran fijos en el código del frontend (STUN públicos de Google, sin TURN): en redes
/// móviles y detrás de NAT simétrico muchas llamadas no conectaban. Ahora los entrega el
/// servidor a cada cliente autenticado, para web y app móvil por igual.
///
/// Credenciales TURN, de más a menos preferida:
/// 1. `TURN_SHARED_SECRET`: credenciales temporales (coturn `use-auth-secret`, el esquema de la
///    "TURN REST API"). El servidor firma un usuario `<vencimiento>:<id de usuario>` con HMAC-SHA1
///    y coturn lo valida con el mismo secreto, sin base de datos. Cada pedido recibe credenciales
///    que vencen solas (`TURN_CREDENTIAL_TTL_SECONDS`): si una se filtra, deja de servir.
/// 2. `TURN_USERNAME` + `TURN_PASSWORD`: una credencial fija compartida (coturn `lt-cred-mech`).
///    Más simple, pero quien la obtenga puede usar el TURN hasta que se rote.

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServer[];
  /// Cuánto valen las credenciales TURN temporales; `null` si no vencen o no hay TURN.
  ttlSeconds: number | null;
}

/// STUN públicos que ya usaba el frontend. Siguen siendo el default: sin configurar nada, las
/// llamadas funcionan igual que antes.
export const DEFAULT_STUN_URLS = [
  "stun:stun.l.google.com:19302",
  "stun:stun1.l.google.com:19302",
  "stun:stun2.l.google.com:19302",
];

function splitUrls(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url !== "");
}

/// Solo esquemas ICE reales: lo que llegue de la configuración no puede colar otra cosa en lo que
/// el servidor entrega a los clientes.
const ICE_URL = /^(stun|stuns|turn|turns):[^\s]+$/i;

export function isValidIceUrl(url: string): boolean {
  return ICE_URL.test(url);
}

/// Usuario y credencial temporales para coturn (`use-auth-secret`).
export function buildTurnRestCredentials(
  userId: string,
  secret: string,
  ttlSeconds: number,
  now: Date = new Date(),
): { username: string; credential: string } {
  const expiresAt = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const username = `${expiresAt}:${userId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { username, credential };
}

export function getIceServers(userId: string, now: Date = new Date()): IceServersResponse {
  const stunUrls = splitUrls(env.STUN_URLS).filter(isValidIceUrl);
  const servers: IceServer[] = [{ urls: stunUrls.length > 0 ? stunUrls : DEFAULT_STUN_URLS }];

  const turnUrls = splitUrls(env.TURN_URLS).filter(isValidIceUrl);
  if (turnUrls.length === 0) return { iceServers: servers, ttlSeconds: null };

  if (env.TURN_SHARED_SECRET) {
    const ttl = env.TURN_CREDENTIAL_TTL_SECONDS;
    servers.push({ urls: turnUrls, ...buildTurnRestCredentials(userId, env.TURN_SHARED_SECRET, ttl, now) });
    return { iceServers: servers, ttlSeconds: ttl };
  }
  if (env.TURN_USERNAME && env.TURN_PASSWORD) {
    servers.push({ urls: turnUrls, username: env.TURN_USERNAME, credential: env.TURN_PASSWORD });
    return { iceServers: servers, ttlSeconds: null };
  }
  // TURN sin credenciales: no se entrega una URL que los clientes no pueden usar.
  return { iceServers: servers, ttlSeconds: null };
}

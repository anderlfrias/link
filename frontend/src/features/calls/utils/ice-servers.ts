import type { IceServersResponse } from "../api/calls.api";

/// Los STUN públicos que se usaban antes de que el servidor entregara la configuración. Siguen
/// siendo el respaldo: si no se puede pedir (sin red, servidor viejo), la llamada se arma igual.
export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

/// Cuánto se espera la configuración antes de seguir con la de respaldo: pedirla no puede demorar
/// el timbre ni el "contestar".
export const ICE_FETCH_TIMEOUT_MS = 3000;

function isIceResponse(value: unknown): value is IceServersResponse {
  if (typeof value !== "object" || value === null) return false;
  const servers = (value as { iceServers?: unknown }).iceServers;
  return (
    Array.isArray(servers) &&
    servers.length > 0 &&
    servers.every(
      (server) =>
        typeof server === "object" &&
        server !== null &&
        Array.isArray((server as { urls?: unknown }).urls) &&
        (server as { urls: unknown[] }).urls.every((url) => typeof url === "string"),
    )
  );
}

/// Configuración de `RTCPeerConnection` con los servidores del backend. Nunca lanza: ante
/// cualquier problema devuelve la de respaldo.
export async function loadRtcConfig(
  fetcher: () => Promise<IceServersResponse>,
  timeoutMs: number = ICE_FETCH_TIMEOUT_MS,
): Promise<RTCConfiguration> {
  try {
    const result = await Promise.race([
      fetcher(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return isIceResponse(result) ? { iceServers: result.iceServers } : DEFAULT_RTC_CONFIG;
  } catch {
    return DEFAULT_RTC_CONFIG;
  }
}

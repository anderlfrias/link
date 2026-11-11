import { apiRequest } from "@/lib/api-client";

export interface IceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  /// Cuánto valen las credenciales TURN temporales (segundos), o `null`.
  ttlSeconds: number | null;
}

/// `GET /v1/calls/ice-servers`: los servidores STUN/TURN con los que armar una llamada (los
/// configura el administrador de la instalación; ver backend/src/modules/calls/ice.service.ts).
export function getIceServers(token: string): Promise<IceServersResponse> {
  return apiRequest<IceServersResponse>("/v1/calls/ice-servers", { token });
}

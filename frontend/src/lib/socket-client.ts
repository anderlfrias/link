import { io, type Socket } from "socket.io-client";
import { env } from "@/lib/env";

let socket: Socket | null = null;
/** Token con el que se autenticó `socket`: el socket solo se autentica en el handshake, así que
 * una conexión sirve mientras el token sea el mismo. */
let socketToken: string | null = null;

/**
 * Crea la conexión de socket autenticada, o reutiliza la que ya hay si se pide con el mismo token:
 * volver a conectar costaría un handshake nuevo (con una consulta a la base) y cortaría la
 * conexión de la que dependen los demás hooks. Con otro token cierra la anterior y abre una nueva.
 * Ver backend/API.md sección 3.
 */
export function connectSocket(token: string): Socket {
  if (socket && socketToken === token) {
    return socket;
  }
  socket?.disconnect();
  socket = io(env.socketUrl, { auth: { token } });
  socketToken = token;
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  socketToken = null;
}

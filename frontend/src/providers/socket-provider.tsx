"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Socket } from "socket.io-client";
import { useAuth } from "@/providers/auth-provider";
import { connectSocket, disconnectSocket } from "@/lib/socket-client";
import { SESSION_EXPIRED_EVENT } from "@/lib/api-client";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, connected: false });

/// Espera entre reintentos manuales tras un rechazo del handshake que no fue de
/// autenticación (ver `handleConnectError`): arranca en 2 s y se duplica hasta 30 s.
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  // La conexión depende del token, no del objeto `session`: cambiar el nombre, el idioma o el sonido
  // de notificación crea una `session` nueva con el mismo token, y no hay por qué reconectar.
  const token = session?.token ?? null;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      setSocket(null);
      setConnected(false);
      return;
    }

    const nextSocket = connectSocket(token);
    setSocket(nextSocket);
    // Si se reutilizó una conexión que ya estaba abierta, `connect` no vuelve a dispararse.
    setConnected(Boolean(nextSocket.connected));

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let failedAttempts = 0;

    const handleConnect = () => {
      failedAttempts = 0;
      setConnected(true);
    };
    const handleDisconnect = (reason: string) => {
      setConnected(false);
      // El servidor cortó la conexión a propósito (`socket.disconnect(true)`): hoy solo lo
      // hace cuando vence el token del socket o se revocan las sesiones de la cuenta. En los
      // dos casos la sesión terminó, y el cliente no reconecta solo en este caso.
      if (reason === "io server disconnect" && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: reason }));
      }
    };
    const handleConnectError = (err: Error) => {
      if (err?.message === "Token expired" || err?.message === "Invalid token") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: err }));
        }
        return;
      }
      // Cualquier otro motivo (el servidor respondió "Server error" porque la base no
      // contestaba) NO es una sesión terminada: no se cierra. Socket.IO no reintenta
      // solo cuando el servidor rechazó el handshake (`active` queda en false), así
      // que se reconecta a mano con espera creciente. Si `active` es true, el
      // reintento automático ya está en marcha.
      if (nextSocket.active || retryTimer) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** failedAttempts, RECONNECT_MAX_MS);
      failedAttempts += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        nextSocket.connect();
      }, delay);
    };

    nextSocket.on("connect", handleConnect);
    nextSocket.on("disconnect", handleDisconnect);
    nextSocket.on("connect_error", handleConnectError);

    return () => {
      clearTimeout(retryTimer);
      nextSocket.off("connect", handleConnect);
      nextSocket.off("disconnect", handleDisconnect);
      nextSocket.off("connect_error", handleConnectError);
    };
  }, [token]);

  const value = useMemo(() => ({ socket, connected }), [socket, connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

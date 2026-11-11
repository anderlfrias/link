"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { getPublicSettings } from "@/features/settings/api/public-settings.api";
import type { PublicAppSettings } from "@/features/settings/types/public-settings.types";

const PublicSettingsContext = createContext<PublicAppSettings | null>(null);
const RefreshContext = createContext<() => void>(() => undefined);

/**
 * Configuración global de solo lectura (`GET /v1/settings/public`), compartida
 * en un Provider en vez de un hook local porque varios componentes de mensajes
 * la necesitan a la vez (cada `MessageBubble` de la lista) — un fetch por
 * componente sería redundante y desincronizado si un admin la cambia mientras
 * la app está abierta en otra pestaña. Mismo patrón que `ProfilePictureProvider`.
 */
export function PublicSettingsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [settings, setSettings] = useState<PublicAppSettings | null>(null);
  // Cada vez que cambia este número se vuelve a pedir la configuración.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (!session) {
      setSettings(null);
      return;
    }

    let cancelled = false;
    getPublicSettings(session.token)
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        // Si ya había una configuración, se conserva: un fallo pasajero no debe esconder opciones.
        if (!cancelled && version === 0) setSettings(null);
      });

    return () => {
      cancelled = true;
    };
  }, [session, version]);

  // Un admin pudo cambiar la configuración desde otra pestaña: al volver a ésta se pide de nuevo.
  useEffect(() => {
    if (!session) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session, refresh]);

  return (
    <RefreshContext.Provider value={refresh}>
      <PublicSettingsContext.Provider value={settings}>{children}</PublicSettingsContext.Provider>
    </RefreshContext.Provider>
  );
}

/** `null` mientras carga o si falló — llamadores deben tratar eso como "sin
 * restricciones conocidas todavía" (ver MessageBubble, que oculta las
 * acciones de editar/borrar hasta tener esta configuración). */
export function usePublicSettings(): PublicAppSettings | null {
  return useContext(PublicSettingsContext);
}

/** Vuelve a pedir la configuración. Lo usa el panel de administración al guardar, para que lo que
 * cambió (por ejemplo, la opción de la app móvil) se vea sin recargar la página. */
export function useRefreshPublicSettings(): () => void {
  return useContext(RefreshContext);
}

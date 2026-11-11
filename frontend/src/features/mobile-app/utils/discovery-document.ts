/** Ruta fija en la que la web publica dónde está el API de esta instalación. La
 * app móvil la pide a partir de la URL del sitio (ver backend/API.md, sección 17). */
export const DISCOVERY_PATH = "/.well-known/link-app.json";

export interface LinkAppDiscovery {
  /** Constante: confirma que el sitio es un LINK. */
  app: "link";
  /** Versión de este documento. Sube solo si cambia su forma de manera incompatible. */
  v: 1;
  /** Base del API HTTP, con el prefijo `/api` (ej. `https://api.empresa.com/api`). */
  apiUrl: string;
  /** Base de Socket.IO (ej. `https://api.empresa.com`). */
  socketUrl: string;
}

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * La web, el API y el socket pueden vivir en orígenes distintos, y solo la web
 * sabe cuáles son (`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_SOCKET_URL`). Este
 * documento se lo dice a la app. No expone nada nuevo: son los mismos valores que
 * ya viajan en el JavaScript que recibe cualquier navegador.
 */
export function buildDiscoveryDocument(config: { apiUrl: string; socketUrl: string }): LinkAppDiscovery {
  return {
    app: "link",
    v: 1,
    apiUrl: withoutTrailingSlash(config.apiUrl),
    socketUrl: withoutTrailingSlash(config.socketUrl),
  };
}

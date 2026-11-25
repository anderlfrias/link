/** Esquema del enlace con el que la app móvil se vincula con esta instalación. Es
 * parte del contrato con la app: cambiarlo deja sin efecto los QR ya compartidos. */
export const MOBILE_APP_SCHEME = "linkapp";

const CONNECT_PREFIX = `${MOBILE_APP_SCHEME}://connect?`;

/** Una URL de sitio real mide decenas de caracteres. El tope evita procesar (o
 * meter en un QR) un texto arbitrario. */
export const SITE_URL_MAX_LENGTH = 2048;

/**
 * Origen (`https://chat.empresa.com`) de la URL de un sitio, o `null` si no es
 * una URL `http`/`https` válida. Descarta la ruta, la query y el fragmento: la
 * app solo necesita saber a qué sitio preguntarle dónde está el API (ver
 * `discovery-document.ts`). Una URL con usuario o contraseña se rechaza entera:
 * `https://chat.empresa.com@otro.example` se lee como un dominio y es otro.
 */
export function normalizeSiteOrigin(raw: string): string | null {
  const value = raw.trim();
  if (value === "" || value.length > SITE_URL_MAX_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username !== "" || url.password !== "") return null;
  return url.origin;
}

/** La app móvil solo se conecta por HTTPS (salvo en builds de desarrollo). */
export function isSecureOrigin(origin: string): boolean {
  return origin.startsWith("https://");
}

/**
 * Enlace que lleva el QR: `linkapp://connect?url=<origen del sitio>`. Solo dice
 * a qué instalación conectarse. Nunca lleva credenciales ni tokens, así que una
 * foto del QR es tan pública como la dirección del sitio.
 */
export function buildConnectLink(siteUrl: string): string {
  const origin = normalizeSiteOrigin(siteUrl);
  if (!origin) throw new Error("URL de sitio inválida");
  return `${CONNECT_PREFIX}${new URLSearchParams({ url: origin }).toString()}`;
}

/** Inversa de `buildConnectLink`: el origen del sitio, o `null` si `link` no es
 * un enlace de conexión válido. Es el mismo criterio que aplica la app. */
export function parseConnectLink(link: string): string | null {
  const value = link.trim();
  if (value.length > SITE_URL_MAX_LENGTH + CONNECT_PREFIX.length + 64) return null;
  if (!value.toLowerCase().startsWith(CONNECT_PREFIX)) return null;

  const params = new URLSearchParams(value.slice(CONNECT_PREFIX.length));
  const urls = params.getAll("url");
  // Un parámetro repetido es ambiguo (¿cuál vale?): se rechaza en vez de elegir.
  if (urls.length !== 1) return null;
  return normalizeSiteOrigin(urls[0]);
}

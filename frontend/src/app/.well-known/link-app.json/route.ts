import { env } from "@/lib/env";
import { buildDiscoveryDocument } from "@/features/mobile-app/utils/discovery-document";

// Los valores salen de variables `NEXT_PUBLIC_*`, fijas desde el build: la
// respuesta es siempre la misma, así que se genera una sola vez.
export const dynamic = "force-static";

/** `GET /.well-known/link-app.json`: le dice a la app móvil dónde están el API y
 * el socket de esta instalación (ver `discovery-document.ts`). Público, igual
 * que el resto de la web antes de iniciar sesión. */
export function GET(): Response {
  return Response.json(buildDiscoveryDocument(env), {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

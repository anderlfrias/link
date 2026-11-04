import { User, UserStatus } from "@prisma/client";
import { getLogger } from "../../config/request-context";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";
import * as SettingsService from "../settings/settings.service";
import { findUserById } from "./auth.repository";
import { AuthenticatedIdentity, MappedUser } from "./auth.types";
import { verifyAccessToken } from "./jwt";

/// Usuario autenticado y ya resuelto contra la base: el `MappedUser` completo
/// (con `internalUserId`) y la fila de `User`.
export interface ResolvedUser {
  user: MappedUser & { internalUserId: string };
  record: User;
}

function toSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/// Corta la resolución dejando constancia del motivo (nunca el token). Es lo que
/// permite contestar "¿por qué se me cerró la sesión?": la edad y la duración
/// con la que se emitió el token, y la duración vigente en ESTE proceso (si
/// difiere de la que configuró el admin, hay un proceso con la configuración
/// vieja en caché).
function rejectSession(
  identity: AuthenticatedIdentity,
  reason: string,
  error: UnauthorizedError,
  extra: Record<string, unknown> = {},
): never {
  const { iat } = identity;
  getLogger().info(
    {
      reason,
      userId: identity.user.id,
      tokenAgeSeconds: iat === undefined ? undefined : toSeconds(new Date()) - iat,
      tokenTtlSeconds: iat === undefined || !identity.user.exp ? undefined : identity.user.exp - iat,
      ...extra,
    },
    "session rejected",
  );
  throw error;
}

/// Resolución de identidad unificada (LOCAL_AUTH_PLAN.md, D7). La usan
/// `attachInternalUser`, el handshake del socket y `/files/:id/content`: antes
/// eran tres copias de la misma búsqueda.
///
/// Una sola ruta para todos los modos de login (el token siempre es la sesión
/// de LINK, ver `signSessionToken`): busca por id (`sub`), así un cambio de
/// email hecho por un admin no rompe ni redirige sesiones; rechaza el token si
/// es anterior a `tokensValidAfter` o más viejo que la duración de sesión
/// vigente (D16); exige que la cuenta esté `ACTIVE` (D19), y toma email,
/// nombre, username y roles de la fila.
///
/// Tira `UnauthorizedError`: para el cliente, una cuenta desactivada o una
/// sesión revocada es una sesión que terminó.
export async function resolveInternalUser(identity: AuthenticatedIdentity): Promise<ResolvedUser> {
  const record = await findUserById(identity.user.id);
  if (!record) {
    rejectSession(identity, "user_not_found", new UnauthorizedError("User not found"));
  }
  if (record.status !== UserStatus.ACTIVE) {
    rejectSession(identity, "account_disabled", new UnauthorizedError("Account disabled", "account_disabled"));
  }
  if (identity.iat === undefined) {
    rejectSession(identity, "missing_iat", new UnauthorizedError("Invalid token"));
  }
  // `iat` está en segundos y `tokensValidAfter` se guarda truncado al
  // segundo: un token emitido en el mismo segundo que el corte (como el que
  // devuelve el cambio de contraseña) sigue siendo válido (D9).
  if (record.tokensValidAfter && identity.iat < toSeconds(record.tokensValidAfter)) {
    rejectSession(identity, "token_revoked", new UnauthorizedError("Token revoked", "token_revoked"));
  }
  // Bajar la duración de sesión corta también los tokens ya emitidos; subirla
  // no alarga ninguno, porque manda el `exp` firmado (D16).
  const { localSessionTtlHours } = await SettingsService.getSettings();
  if (toSeconds(new Date()) - identity.iat > localSessionTtlHours * 3600) {
    rejectSession(identity, "session_expired", new UnauthorizedError("Session expired", "session_expired"), {
      configuredTtlHours: localSessionTtlHours,
    });
  }
  return {
    record,
    user: {
      ...identity.user,
      email: record.email,
      username: record.username,
      fullName: record.name,
      roles: record.roles,
      internalUserId: record.id,
    },
  };
}

/// Un token restringido (`pcr`, D13) solo sirve para cambiar la contraseña.
/// Para el resto de la API es un 403 con un `code` que el frontend reconoce;
/// no un 401, que haría que el cliente cierre la sesión.
export function assertNotPasswordChangeOnly(identity: AuthenticatedIdentity): void {
  if (identity.mustChangePassword) {
    throw new ForbiddenError("Tenés que cambiar tu contraseña antes de continuar.", "password_change_required");
  }
}

/// Verificación completa de un token suelto, para los caminos que no pasan
/// por los middlewares de Express (el handshake del socket y la rama Bearer de
/// `/files/:id/content`): verifica la sesión, rechaza tokens restringidos y
/// resuelve el usuario.
export async function authenticateAccessToken(token: string): Promise<ResolvedUser> {
  const identity = verifyAccessToken(token);
  assertNotPasswordChangeOnly(identity);
  return resolveInternalUser(identity);
}

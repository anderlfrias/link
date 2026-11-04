import { User, UserStatus } from "@prisma/client";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExternalProvider, useLocalAuth } from "../../test/auth-mode";
import { ForbiddenError, UnauthorizedError } from "../../utils/errors";

vi.mock("./auth.repository", () => ({
  findUserById: vi.fn(),
}));

vi.mock("../settings/settings.service", () => ({
  getSettings: vi.fn(),
}));

const logSpy = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("../../config/request-context", () => ({ getLogger: () => logSpy }));

import * as SettingsService from "../settings/settings.service";
import { findUserById } from "./auth.repository";
import { AuthenticatedIdentity } from "./auth.types";
import { assertNotPasswordChangeOnly, authenticateAccessToken, resolveInternalUser } from "./identity";
import { signSessionToken } from "./jwt";

// El secreto con el que un proveedor externo firma su propio token: no es el de sesión de LINK.
const PROVIDER_JWT_SECRET = "provider-own-secret";

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    externalId: null,
    identityProvider: null,
    username: "ana.perez",
    name: "Ana Pérez",
    email: "ana@example.com",
    avatarFileId: null,
    syncProfileWithIntegration: true,
    status: UserStatus.ACTIVE,
    notificationSoundEnabled: true,
    language: "es",
    roles: ["admin"],
    tokensValidAfter: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sessionIdentity(
  overrides: Partial<AuthenticatedIdentity> = {},
  authProvider = "local",
): AuthenticatedIdentity {
  return {
    mustChangePassword: false,
    iat: nowSeconds(),
    user: {
      id: "user-1",
      email: "ana@example.com",
      username: null,
      fullName: "",
      roles: [],
      exp: nowSeconds() + 3600,
      authProvider,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(findUserById).mockReset();
  vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
  logSpy.info.mockClear();
});

// La resolución es una sola, sin ramas por modo: la sesión es siempre la de LINK.
describe.each([
  { label: "cuentas locales", authProvider: "local" as const },
  { label: "proveedor externo", authProvider: "external-test" as const },
])("resolveInternalUser — $label", ({ authProvider }) => {
  const identity = (overrides: Partial<AuthenticatedIdentity> = {}) => sessionIdentity(overrides, authProvider);

  it("busca por id y completa email, nombre, username y roles desde la base", async () => {
    vi.mocked(findUserById).mockResolvedValue(
      buildUser({ email: "ana.nueva@example.com", name: "Ana P.", username: "anap", roles: ["admin"] }),
    );

    const { user } = await resolveInternalUser(identity());

    expect(findUserById).toHaveBeenCalledWith("user-1");
    expect(user).toMatchObject({
      id: "user-1",
      internalUserId: "user-1",
      email: "ana.nueva@example.com",
      fullName: "Ana P.",
      username: "anap",
      roles: ["admin"],
      authProvider,
    });
  });

  it("los roles salen de la base, no del token", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser({ roles: [] }));

    const { user } = await resolveInternalUser(
      identity({ user: { ...identity().user, roles: ["admin"] } }),
    );

    expect(user.roles).toEqual([]);
  });

  it("sin cuenta -> 401 User not found", async () => {
    vi.mocked(findUserById).mockResolvedValue(null);

    await expect(resolveInternalUser(identity())).rejects.toThrow(new UnauthorizedError("User not found"));
  });

  it("cuenta desactivada -> 401 account_disabled", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser({ status: UserStatus.INACTIVE }));

    await expect(resolveInternalUser(identity())).rejects.toMatchObject({ code: "account_disabled" });
  });

  it("revocación al segundo: un token del mismo segundo que tokensValidAfter vale, uno anterior no (invariante 3)", async () => {
    const cut = new Date();
    cut.setMilliseconds(0);
    vi.mocked(findUserById).mockResolvedValue(buildUser({ tokensValidAfter: cut }));
    const cutSeconds = cut.getTime() / 1000;

    await expect(resolveInternalUser(identity({ iat: cutSeconds }))).resolves.toBeDefined();
    await expect(resolveInternalUser(identity({ iat: cutSeconds - 1 }))).rejects.toMatchObject({
      statusCode: 401,
      code: "token_revoked",
    });
  });

  it("un token más viejo que la duración vigente se rechaza; bajar la duración corta los ya emitidos (invariante 4)", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const fiveHoursAgo = identity({ iat: nowSeconds() - 5 * 3600 });

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 12 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).resolves.toBeDefined();

    vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 4 } as never);
    await expect(resolveInternalUser(fiveHoursAgo)).rejects.toMatchObject({ code: "session_expired" });
  });

  it("sin iat falla cerrado", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());

    await expect(resolveInternalUser(identity({ iat: undefined }))).rejects.toThrow(UnauthorizedError);
  });

  describe("constancia del motivo del rechazo", () => {
    it("una sesión vencida por duración vigente deja edad del token, duración de emisión y duración configurada", async () => {
      vi.mocked(findUserById).mockResolvedValue(buildUser());
      vi.mocked(SettingsService.getSettings).mockResolvedValue({ localSessionTtlHours: 4 } as never);
      const iat = nowSeconds() - 5 * 3600;

      await expect(
        resolveInternalUser(identity({ iat, user: { ...identity().user, exp: iat + 12 * 3600 } })),
      ).rejects.toMatchObject({ code: "session_expired" });

      expect(logSpy.info).toHaveBeenCalledTimes(1);
      const [fields, message] = logSpy.info.mock.calls[0];
      expect(message).toBe("session rejected");
      expect(fields).toMatchObject({
        reason: "session_expired",
        userId: "user-1",
        tokenTtlSeconds: 12 * 3600,
        configuredTtlHours: 4,
      });
      expect(fields.tokenAgeSeconds).toBeGreaterThanOrEqual(5 * 3600);
      expect(fields.tokenAgeSeconds).toBeLessThanOrEqual(5 * 3600 + 2);
    });

    it.each([
      { reason: "user_not_found", setup: () => vi.mocked(findUserById).mockResolvedValue(null) },
      {
        reason: "account_disabled",
        setup: () => vi.mocked(findUserById).mockResolvedValue(buildUser({ status: UserStatus.INACTIVE })),
      },
      {
        reason: "token_revoked",
        setup: () => vi.mocked(findUserById).mockResolvedValue(buildUser({ tokensValidAfter: new Date() })),
      },
    ])("$reason queda registrado con el UUID del usuario y sin datos personales", async ({ reason, setup }) => {
      setup();

      await expect(resolveInternalUser(identity({ iat: nowSeconds() - 60 }))).rejects.toThrow(UnauthorizedError);

      expect(logSpy.info).toHaveBeenCalledWith(expect.objectContaining({ reason, userId: "user-1" }), "session rejected");
      expect(JSON.stringify(logSpy.info.mock.calls)).not.toContain("ana@example.com");
    });

    it("una sesión válida no deja ninguna línea", async () => {
      vi.mocked(findUserById).mockResolvedValue(buildUser());

      await resolveInternalUser(identity());

      expect(logSpy.info).not.toHaveBeenCalled();
    });
  });
});

describe("assertNotPasswordChangeOnly", () => {
  it("un token restringido (pcr) -> 403 password_change_required, nunca 401", () => {
    expect(() => assertNotPasswordChangeOnly(sessionIdentity({ mustChangePassword: true }))).toThrow(ForbiddenError);
    try {
      assertNotPasswordChangeOnly(sessionIdentity({ mustChangePassword: true }));
    } catch (error) {
      expect((error as ForbiddenError).code).toBe("password_change_required");
    }
  });

  it("un token normal pasa", () => {
    expect(() => assertNotPasswordChangeOnly(sessionIdentity())).not.toThrow();
  });
});

describe.each([
  { label: "cuentas locales", local: true },

  { label: "proveedor externo", local: false },
])("authenticateAccessToken — $label", ({ local }) => {
  if (local) useLocalAuth();
  else useExternalProvider();

  it("acepta la sesión de LINK y la resuelve", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: false });

    const { user } = await authenticateAccessToken(token);

    expect(user.internalUserId).toBe("user-1");
    expect(user.roles).toEqual(["admin"]);
  });

  it("rechaza un token restringido (pcr): solo sirve para cambiar la contraseña (invariante 8)", async () => {
    vi.mocked(findUserById).mockResolvedValue(buildUser());
    const token = signSessionToken({ id: "user-1", email: "ana@example.com" }, { ttlHours: 1, mustChangePassword: true });

    await expect(authenticateAccessToken(token)).rejects.toMatchObject({ code: "password_change_required" });
    expect(findUserById).not.toHaveBeenCalled();
  });

  it("rechaza el token de un proveedor externo: no autentica en ningún lado (invariante 1)", async () => {
    const providerToken = jwt.sign(
      { id: "ext-1", email: "ana@example.com", username: "ana", name: "Ana", roles: [], app: "x" },
      PROVIDER_JWT_SECRET,
      { algorithm: "HS256", expiresIn: 3600 },
    );

    await expect(authenticateAccessToken(providerToken)).rejects.toBeInstanceOf(jwt.JsonWebTokenError);
    expect(findUserById).not.toHaveBeenCalled();
  });
});

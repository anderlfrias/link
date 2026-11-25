import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import env from "../../config/env";
import { buildTurnRestCredentials, DEFAULT_STUN_URLS, getIceServers, isValidIceUrl } from "./ice.service";

const KEYS = ["STUN_URLS", "TURN_URLS", "TURN_SHARED_SECRET", "TURN_CREDENTIAL_TTL_SECONDS", "TURN_USERNAME", "TURN_PASSWORD"] as const;
const saved: Record<string, unknown> = {};
const e = env as unknown as Record<string, unknown>;

beforeEach(() => {
  for (const key of KEYS) saved[key] = e[key];
  e.STUN_URLS = undefined;
  e.TURN_URLS = undefined;
  e.TURN_SHARED_SECRET = undefined;
  e.TURN_USERNAME = undefined;
  e.TURN_PASSWORD = undefined;
  e.TURN_CREDENTIAL_TTL_SECONDS = 3600;
});

afterEach(() => {
  for (const key of KEYS) e[key] = saved[key];
});

describe("isValidIceUrl", () => {
  it.each(["stun:stun.l.google.com:19302", "turn:turn.empresa.com:3478?transport=udp", "turns:turn.empresa.com:5349", "STUN:a.com"])(
    "acepta %s",
    (url) => expect(isValidIceUrl(url)).toBe(true),
  );

  it.each(["", "http://evil.test", "javascript:alert(1)", "turn:con espacio", "file:///etc/passwd", "turn"])("rechaza %s", (url) =>
    expect(isValidIceUrl(url)).toBe(false),
  );
});

describe("buildTurnRestCredentials", () => {
  it("usa '<vencimiento>:<usuario>' y firma con HMAC-SHA1 en base64, como espera coturn", () => {
    const now = new Date("2026-11-11T10:00:00Z");

    const { username, credential } = buildTurnRestCredentials("u-1", "secreto", 3600, now);

    const expiresAt = Math.floor(now.getTime() / 1000) + 3600;
    expect(username).toBe(`${expiresAt}:u-1`);
    expect(credential).toBe(createHmac("sha1", "secreto").update(username).digest("base64"));
  });

  it("cada usuario y cada momento dan credenciales distintas", () => {
    const now = new Date("2026-11-11T10:00:00Z");
    const a = buildTurnRestCredentials("u-1", "s", 3600, now);

    expect(buildTurnRestCredentials("u-2", "s", 3600, now).credential).not.toBe(a.credential);
    expect(buildTurnRestCredentials("u-1", "otro", 3600, now).credential).not.toBe(a.credential);
    expect(buildTurnRestCredentials("u-1", "s", 3600, new Date(now.getTime() + 5000)).credential).not.toBe(a.credential);
  });
});

describe("getIceServers", () => {
  it("sin configurar nada, los STUN de siempre y sin TURN", () => {
    expect(getIceServers("u-1")).toEqual({ iceServers: [{ urls: DEFAULT_STUN_URLS }], ttlSeconds: null });
  });

  it("STUN propios reemplazan a los públicos; los inválidos se descartan", () => {
    e.STUN_URLS = "stun:stun.empresa.com:3478, http://evil.test ,";

    expect(getIceServers("u-1").iceServers).toEqual([{ urls: ["stun:stun.empresa.com:3478"] }]);
  });

  it("si todos los STUN configurados son inválidos, vuelven los de siempre", () => {
    e.STUN_URLS = "http://evil.test";

    expect(getIceServers("u-1").iceServers).toEqual([{ urls: DEFAULT_STUN_URLS }]);
  });

  it("con secreto compartido entrega credenciales TURN temporales para ese usuario", () => {
    e.TURN_URLS = "turn:turn.empresa.com:3478?transport=udp,turns:turn.empresa.com:5349?transport=tcp";
    e.TURN_SHARED_SECRET = "secreto";
    e.TURN_CREDENTIAL_TTL_SECONDS = 600;
    const now = new Date("2026-11-11T10:00:00Z");

    const result = getIceServers("u-1", now);

    expect(result.ttlSeconds).toBe(600);
    expect(result.iceServers).toHaveLength(2);
    expect(result.iceServers[1]).toEqual({
      urls: ["turn:turn.empresa.com:3478?transport=udp", "turns:turn.empresa.com:5349?transport=tcp"],
      ...buildTurnRestCredentials("u-1", "secreto", 600, now),
    });
  });

  it("el secreto nunca viaja en la respuesta", () => {
    e.TURN_URLS = "turn:turn.empresa.com:3478";
    e.TURN_SHARED_SECRET = "secreto-super-privado";

    expect(JSON.stringify(getIceServers("u-1"))).not.toContain("secreto-super-privado");
  });

  it("con usuario y contraseña fijos entrega esa credencial, sin vencimiento", () => {
    e.TURN_URLS = "turn:turn.empresa.com:3478";
    e.TURN_USERNAME = "link";
    e.TURN_PASSWORD = "clave";

    expect(getIceServers("u-1")).toEqual({
      iceServers: [
        { urls: DEFAULT_STUN_URLS },
        { urls: ["turn:turn.empresa.com:3478"], username: "link", credential: "clave" },
      ],
      ttlSeconds: null,
    });
  });

  it("el secreto compartido tiene prioridad sobre la credencial fija", () => {
    e.TURN_URLS = "turn:turn.empresa.com:3478";
    e.TURN_SHARED_SECRET = "secreto";
    e.TURN_USERNAME = "link";
    e.TURN_PASSWORD = "clave";

    expect(getIceServers("u-1").iceServers[1].username).toMatch(/:u-1$/);
  });

  it("TURN sin credenciales, o sin URLs válidas, no se entrega", () => {
    e.TURN_URLS = "turn:turn.empresa.com:3478";
    expect(getIceServers("u-1").iceServers).toHaveLength(1);

    e.TURN_URLS = "http://evil.test";
    e.TURN_SHARED_SECRET = "secreto";
    expect(getIceServers("u-1")).toEqual({ iceServers: [{ urls: DEFAULT_STUN_URLS }], ttlSeconds: null });
  });
});

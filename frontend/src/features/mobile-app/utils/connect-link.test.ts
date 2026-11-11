import { describe, expect, it } from "vitest";
import {
  buildConnectLink,
  isSecureOrigin,
  normalizeSiteOrigin,
  parseConnectLink,
  SITE_URL_MAX_LENGTH,
} from "./connect-link";

describe("normalizeSiteOrigin", () => {
  it("se queda solo con el origen de la URL", () => {
    expect(normalizeSiteOrigin("https://chat.empresa.com/conversations/1?x=1#y")).toBe("https://chat.empresa.com");
    expect(normalizeSiteOrigin("  https://chat.empresa.com:8443/  ")).toBe("https://chat.empresa.com:8443");
    expect(normalizeSiteOrigin("http://192.168.1.10:3000")).toBe("http://192.168.1.10:3000");
  });

  it("rechaza lo que no es una URL http/https", () => {
    expect(normalizeSiteOrigin("")).toBeNull();
    expect(normalizeSiteOrigin("chat.empresa.com")).toBeNull();
    expect(normalizeSiteOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeSiteOrigin("ftp://chat.empresa.com")).toBeNull();
    expect(normalizeSiteOrigin("linkapp://connect?url=https://chat.empresa.com")).toBeNull();
  });

  it("rechaza una URL con usuario o contraseña", () => {
    // Se lee como "chat.empresa.com" pero el dominio real es el de después de la @.
    expect(normalizeSiteOrigin("https://chat.empresa.com@atacante.example")).toBeNull();
    expect(normalizeSiteOrigin("https://user:pass@chat.empresa.com")).toBeNull();
  });

  it("rechaza un texto más largo que el máximo", () => {
    expect(normalizeSiteOrigin(`https://chat.empresa.com/${"a".repeat(SITE_URL_MAX_LENGTH)}`)).toBeNull();
  });
});

describe("isSecureOrigin", () => {
  it("solo https cuenta como seguro", () => {
    expect(isSecureOrigin("https://chat.empresa.com")).toBe(true);
    expect(isSecureOrigin("http://chat.empresa.com")).toBe(false);
  });
});

describe("buildConnectLink", () => {
  it("arma el enlace de la app con el origen del sitio codificado", () => {
    expect(buildConnectLink("https://chat.empresa.com/login")).toBe(
      "linkapp://connect?url=https%3A%2F%2Fchat.empresa.com",
    );
  });

  it("no lleva nada más que la URL del sitio", () => {
    const link = buildConnectLink("https://chat.empresa.com/?token=secreto#t=otro");

    expect(link).not.toContain("secreto");
    expect(link).not.toContain("otro");
  });

  it("falla con una URL inválida en vez de armar un enlace roto", () => {
    expect(() => buildConnectLink("no es una url")).toThrow();
  });
});

describe("parseConnectLink", () => {
  it("devuelve el origen que armó buildConnectLink", () => {
    const origin = "https://chat.empresa.com:8443";

    expect(parseConnectLink(buildConnectLink(origin))).toBe(origin);
  });

  it("rechaza otros esquemas, otras acciones y enlaces sin url", () => {
    expect(parseConnectLink("https://chat.empresa.com")).toBeNull();
    expect(parseConnectLink("otraapp://connect?url=https%3A%2F%2Fchat.empresa.com")).toBeNull();
    expect(parseConnectLink("linkapp://login?url=https%3A%2F%2Fchat.empresa.com")).toBeNull();
    expect(parseConnectLink("linkapp://connect?")).toBeNull();
    expect(parseConnectLink("linkapp://connect?url=")).toBeNull();
  });

  it("rechaza una url interna inválida o con credenciales", () => {
    expect(parseConnectLink("linkapp://connect?url=javascript%3Aalert(1)")).toBeNull();
    expect(parseConnectLink("linkapp://connect?url=https%3A%2F%2Fa.example%40b.example")).toBeNull();
  });

  it("rechaza un parámetro url repetido", () => {
    expect(
      parseConnectLink("linkapp://connect?url=https%3A%2F%2Fa.example&url=https%3A%2F%2Fb.example"),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { buildDiscoveryDocument, DISCOVERY_PATH } from "./discovery-document";

describe("buildDiscoveryDocument", () => {
  it("publica las URL del API y del socket, identificando al sitio como un LINK", () => {
    expect(
      buildDiscoveryDocument({ apiUrl: "https://api.empresa.com/api", socketUrl: "https://api.empresa.com" }),
    ).toEqual({
      app: "link",
      v: 1,
      apiUrl: "https://api.empresa.com/api",
      socketUrl: "https://api.empresa.com",
    });
  });

  it("quita la barra final para que la app no arme rutas con doble barra", () => {
    const document = buildDiscoveryDocument({
      apiUrl: "https://api.empresa.com/api/",
      socketUrl: "https://api.empresa.com//",
    });

    expect(document.apiUrl).toBe("https://api.empresa.com/api");
    expect(document.socketUrl).toBe("https://api.empresa.com");
  });

  it("solo lleva los cuatro campos del contrato", () => {
    const document = buildDiscoveryDocument({ apiUrl: "https://a.example/api", socketUrl: "https://a.example" });

    expect(Object.keys(document).sort()).toEqual(["apiUrl", "app", "socketUrl", "v"]);
  });
});

describe("DISCOVERY_PATH", () => {
  it("es la ruta fija que conoce la app", () => {
    expect(DISCOVERY_PATH).toBe("/.well-known/link-app.json");
  });
});

import http from "http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Una app nativa no manda la cabecera `Origin`: no es un navegador. Con
// `CORS_ORIGIN` restringido a los orígenes de la web (lo normal en producción),
// esas peticiones tienen que seguir entrando — CORS es una protección que aplica
// el navegador, no un control de acceso del servidor. Estos tests fijan ese
// comportamiento para el API HTTP y para el handshake de Socket.IO, que traen
// cada uno su propia configuración de CORS (ver config/cors-origins.ts).

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class WebPushError extends Error {},
}));

const WEB_ORIGIN = "https://chat.example.com";
const ORIGINAL_CORS_ORIGIN = process.env.CORS_ORIGIN;

describe("clientes sin cabecera Origin, con CORS_ORIGIN restringido", () => {
  let app: import("express").Express;
  let createSocketGateway: typeof import("./socket/gateway").createSocketGateway;

  beforeAll(async () => {
    // `corsOrigin` se calcula al importar el módulo: hay que reimportar todo con
    // la variable ya definida (mismo recurso que config/cors-origins.test.ts).
    process.env.CORS_ORIGIN = WEB_ORIGIN;
    vi.resetModules();
    app = (await import("./app")).default;
    createSocketGateway = (await import("./socket/gateway")).createSocketGateway;
  });

  afterAll(() => {
    if (ORIGINAL_CORS_ORIGIN === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = ORIGINAL_CORS_ORIGIN;
    }
    vi.resetModules();
  });

  it("el API HTTP responde a una petición sin Origin", async () => {
    const res = await request(app).get("/api/v1/instance");

    expect(res.status).toBe(200);
    expect(res.body.app).toBe("link");
  });

  it("el API HTTP no autoriza por CORS a un origen que no está en la lista", async () => {
    const res = await request(app).get("/api/v1/instance").set("Origin", "https://otro.example.com");

    // El servidor responde igual; es el navegador el que descarta la respuesta
    // al no encontrar su origen en esta cabecera.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("el handshake de Socket.IO acepta una conexión sin Origin", async () => {
    const server = http.createServer();
    const io = createSocketGateway(server);
    try {
      const res = await request(server).get("/socket.io/?EIO=4&transport=polling");

      expect(res.status).toBe(200);
      // Paquete "open" de Engine.IO: `0{"sid":...}`.
      expect(res.text.startsWith("0{")).toBe(true);
    } finally {
      await io.close();
    }
  });
});

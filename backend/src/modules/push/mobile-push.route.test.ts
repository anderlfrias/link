import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middlewares/error.middleware";
import * as MobilePushService from "./mobile-push.service";
import pushRouter from "./push.route";

// La autenticación se prueba en su módulo: acá solo importa a nombre de quién se actúa.
vi.mock("../../middlewares/auth.middleware", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { internalUserId: "u-1" };
    next();
  },
}));
vi.mock("../../middlewares/current-user.middleware", () => ({
  attachInternalUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("./mobile-push.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mobile-push.service")>()),
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),
}));
vi.mock("./push.service", () => ({ getPublicKey: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));

const TOKEN = "ExponentPushToken[abcdefghijklmnop]";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/v1/push", pushRouter);
  app.use(errorHandler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(MobilePushService.registerDevice).mockResolvedValue(undefined);
  vi.mocked(MobilePushService.unregisterDevice).mockResolvedValue(undefined);
});

describe("POST /v1/push/devices", () => {
  it("registra el dispositivo de quien lo pide y responde 204", async () => {
    const res = await request(buildApp()).post("/v1/push/devices").send({ token: TOKEN, platform: "ios" });

    expect(res.status).toBe(204);
    expect(MobilePushService.registerDevice).toHaveBeenCalledWith("u-1", TOKEN, "ios");
  });

  it("un token que no es de Expo, o sin plataforma, responde 400 y no registra nada", async () => {
    const app = buildApp();

    expect((await request(app).post("/v1/push/devices").send({ token: "https://evil.test", platform: "ios" })).status).toBe(400);
    expect((await request(app).post("/v1/push/devices").send({ token: TOKEN })).status).toBe(400);
    expect(MobilePushService.registerDevice).not.toHaveBeenCalled();
  });

  it("si las notificaciones móviles están apagadas, el error del servicio llega como 404 con su código", async () => {
    const { NotFoundError } = await import("../../utils/errors");
    vi.mocked(MobilePushService.registerDevice).mockRejectedValue(new NotFoundError("apagado", "mobile_push_disabled"));

    const res = await request(buildApp()).post("/v1/push/devices").send({ token: TOKEN, platform: "ios" });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("mobile_push_disabled");
  });
});

describe("DELETE /v1/push/devices", () => {
  it("da de baja el dispositivo de quien lo pide y responde 204", async () => {
    const res = await request(buildApp()).delete("/v1/push/devices").send({ token: TOKEN });

    expect(res.status).toBe(204);
    expect(MobilePushService.unregisterDevice).toHaveBeenCalledWith("u-1", TOKEN);
  });

  it("sin token responde 400", async () => {
    const res = await request(buildApp()).delete("/v1/push/devices").send({});

    expect(res.status).toBe(400);
    expect(MobilePushService.unregisterDevice).not.toHaveBeenCalled();
  });
});

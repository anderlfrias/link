import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as IceService from "./ice.service";
import callRouter from "./call.route";

// La autenticación se prueba en su módulo: acá importa a nombre de quién se piden las credenciales.
vi.mock("../../middlewares/auth.middleware", () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { internalUserId: "u-1" };
    next();
  },
}));
vi.mock("../../middlewares/current-user.middleware", () => ({
  attachInternalUser: (_req: any, _res: any, next: any) => next(),
}));
vi.mock("./ice.service", () => ({ getIceServers: vi.fn() }));

function buildApp() {
  const app = express();
  app.use("/v1/calls", callRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(IceService.getIceServers).mockReturnValue({ iceServers: [{ urls: ["stun:a"] }], ttlSeconds: null });
});

describe("GET /v1/calls/ice-servers", () => {
  it("devuelve los servidores ICE para quien lo pide", async () => {
    const res = await request(buildApp()).get("/v1/calls/ice-servers");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ iceServers: [{ urls: ["stun:a"] }], ttlSeconds: null });
    expect(IceService.getIceServers).toHaveBeenCalledWith("u-1");
  });

  it("nunca se cachea: lleva credenciales", async () => {
    const res = await request(buildApp()).get("/v1/calls/ice-servers");

    expect(res.headers["cache-control"]).toBe("no-store");
  });
});

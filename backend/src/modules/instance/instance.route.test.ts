import { readFileSync } from "node:fs";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import env from "../../config/env";
import instanceRouter from "./instance.route";
import { MOBILE_API_LEVEL } from "./instance.service";

const backendVersion: string = JSON.parse(
  readFileSync(join(__dirname, "../../../package.json"), "utf8"),
).version;

function buildApp() {
  const app = express();
  app.use("/v1/instance", instanceRouter);
  return app;
}

describe("GET /v1/instance", () => {
  it("identifica la instalación como un LINK, con su nivel de compatibilidad", async () => {
    const res = await request(buildApp()).get("/v1/instance");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      app: "link",
      mobileApi: MOBILE_API_LEVEL,
      features: { mobilePush: env.MOBILE_PUSH_ENABLED },
    });
  });

  it("refleja si las notificaciones móviles están habilitadas (activas por defecto)", async () => {
    const original = env.MOBILE_PUSH_ENABLED;
    try {
      env.MOBILE_PUSH_ENABLED = true;
      expect((await request(buildApp()).get("/v1/instance")).body.features.mobilePush).toBe(true);
      env.MOBILE_PUSH_ENABLED = false;
      expect((await request(buildApp()).get("/v1/instance")).body.features.mobilePush).toBe(false);
    } finally {
      env.MOBILE_PUSH_ENABLED = original;
    }
  });

  it("no requiere autenticación", async () => {
    const res = await request(buildApp()).get("/v1/instance").set("Authorization", "");

    expect(res.status).toBe(200);
  });

  it("no publica la versión del backend", async () => {
    const res = await request(buildApp()).get("/v1/instance");

    // Ruta pública: la versión exacta le sirve a quien busca instalaciones vulnerables.
    expect(res.text).not.toContain(backendVersion);
    expect(Object.keys(res.body).sort()).toEqual(["app", "features", "mobileApi"]);
  });

  it("no se cachea, para que un cambio de mobileApi se vea enseguida", async () => {
    const res = await request(buildApp()).get("/v1/instance");

    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("corta con 429 al superar el límite por IP, y no afecta a otra IP", async () => {
    const originalTrustCf = env.TRUST_CF_CONNECTING_IP;
    // cf-connecting-ip solo se respeta con esta opción (ver config/client-ip.ts):
    // así el test elige una IP propia y no comparte el cupo con los de arriba.
    env.TRUST_CF_CONNECTING_IP = true;
    try {
      const app = buildApp();
      for (let i = 0; i < 120; i++) {
        const ok = await request(app).get("/v1/instance").set("cf-connecting-ip", "203.0.113.10");
        expect(ok.status).toBe(200);
      }

      const blocked = await request(app).get("/v1/instance").set("cf-connecting-ip", "203.0.113.10");
      const other = await request(app).get("/v1/instance").set("cf-connecting-ip", "203.0.113.11");

      expect(blocked.status).toBe(429);
      expect(other.status).toBe(200);
    } finally {
      env.TRUST_CF_CONNECTING_IP = originalTrustCf;
    }
  });
});

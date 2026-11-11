import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RTC_CONFIG, ICE_FETCH_TIMEOUT_MS, loadRtcConfig } from "./ice-servers";

describe("loadRtcConfig", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("usa los servidores que entrega el backend, con sus credenciales TURN", async () => {
    const servers = [
      { urls: ["stun:stun.empresa.com:3478"] },
      { urls: ["turn:turn.empresa.com:3478"], username: "123:u", credential: "abc" },
    ];

    await expect(loadRtcConfig(async () => ({ iceServers: servers, ttlSeconds: 3600 }))).resolves.toEqual({
      iceServers: servers,
    });
  });

  it("si el backend falla, vuelve a los STUN de siempre", async () => {
    await expect(loadRtcConfig(async () => Promise.reject(new Error("401")))).resolves.toBe(DEFAULT_RTC_CONFIG);
  });

  it("una respuesta con otra forma se descarta", async () => {
    for (const bad of [null, {}, { iceServers: [] }, { iceServers: [{ urls: "no-es-lista" }] }, { iceServers: [{ urls: [5] }] }]) {
      await expect(loadRtcConfig(async () => bad as never)).resolves.toBe(DEFAULT_RTC_CONFIG);
    }
  });

  it("no espera más del tiempo máximo: no demora el timbre", async () => {
    const pending = loadRtcConfig(() => new Promise(() => {}));

    await vi.advanceTimersByTimeAsync(ICE_FETCH_TIMEOUT_MS);

    await expect(pending).resolves.toBe(DEFAULT_RTC_CONFIG);
  });
});

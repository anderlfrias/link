import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../modules/calls/call.repository", () => ({
  findRingingStartedBefore: vi.fn(),
}));
vi.mock("../modules/calls/call.service", () => ({
  expireRingingCall: vi.fn(),
}));
vi.mock("../modules/calls/call.socket", () => ({
  notifyCallTimedOut: vi.fn(),
}));
vi.mock("../socket", () => ({
  getIO: vi.fn(() => ({ io: true })),
  isSocketReady: vi.fn(() => true),
}));

import { logger } from "../config/logger";
import { CALL_RING_TIMEOUT_MS } from "../modules/calls/call.constants";
import * as CallRepository from "../modules/calls/call.repository";
import * as CallService from "../modules/calls/call.service";
import { notifyCallTimedOut } from "../modules/calls/call.socket";
import { isSocketReady } from "../socket";
import { startCallRingTimeoutWorker } from "./call-ring-timeout.worker";

describe("startCallRingTimeoutWorker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(isSocketReady).mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("corre al arrancar, sin esperar el primer intervalo, y busca lo que lleva más del timeout sonando", async () => {
    vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue([]);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(CallRepository.findRingingStartedBefore).toHaveBeenCalledTimes(1);
    expect(CallRepository.findRingingStartedBefore).toHaveBeenCalledWith(
      new Date(Date.parse("2026-11-04T12:00:00.000Z") - CALL_RING_TIMEOUT_MS),
    );
    expect(CallService.expireRingingCall).not.toHaveBeenCalled();
  });

  it("vuelve a correr cada 5 segundos", async () => {
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue([]);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(CallRepository.findRingingStartedBefore).toHaveBeenCalledTimes(3);
  });

  it("vence cada llamada que sigue sonando y avisa a los dos lados", async () => {
    const first = { id: "call-1", callerId: "a", receiverId: "b" };
    const second = { id: "call-2", callerId: "c", receiverId: "d" };
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue(["call-1", "call-2"]);
    vi.mocked(CallService.expireRingingCall)
      .mockResolvedValueOnce(first as any)
      .mockResolvedValueOnce(second as any);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(CallService.expireRingingCall).toHaveBeenCalledWith("call-1");
    expect(CallService.expireRingingCall).toHaveBeenCalledWith("call-2");
    expect(notifyCallTimedOut).toHaveBeenCalledTimes(2);
    expect(notifyCallTimedOut).toHaveBeenCalledWith({ io: true }, first);
    expect(notifyCallTimedOut).toHaveBeenCalledWith({ io: true }, second);
  });

  it("si la llamada ya no sonaba (la atendieron justo antes) no avisa a nadie", async () => {
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue(["call-1"]);
    vi.mocked(CallService.expireRingingCall).mockResolvedValue(null);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(notifyCallTimedOut).not.toHaveBeenCalled();
  });

  it("una llamada que falla no corta la pasada: las demás igual vencen, y el error queda en el log sin datos de la llamada", async () => {
    const childLogger = { info: vi.fn(), error: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);
    const second = { id: "call-2", callerId: "c", receiverId: "d" };
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue(["call-1", "call-2"]);
    vi.mocked(CallService.expireRingingCall)
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(second as any);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(notifyCallTimedOut).toHaveBeenCalledTimes(1);
    expect(notifyCallTimedOut).toHaveBeenCalledWith({ io: true }, second);
    expect(childLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "call-1" }),
      "could not expire ringing call",
    );
    expect(childLogger.info).toHaveBeenCalledWith({ expiredCount: 1 }, "ringing calls expired");
  });

  it("sin Socket.IO (el CLI) igual deja la llamada vencida, solo que no hay a quién avisar", async () => {
    vi.mocked(isSocketReady).mockReturnValue(false);
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue(["call-1"]);
    vi.mocked(CallService.expireRingingCall).mockResolvedValue({ id: "call-1" } as any);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(CallService.expireRingingCall).toHaveBeenCalledWith("call-1");
    expect(notifyCallTimedOut).not.toHaveBeenCalled();
  });

  it("no loguea nada si no venció ninguna llamada", async () => {
    const childLogger = { info: vi.fn(), error: vi.fn() };
    vi.spyOn(logger, "child").mockReturnValue(childLogger as any);
    vi.mocked(CallRepository.findRingingStartedBefore).mockResolvedValue([]);

    startCallRingTimeoutWorker();
    await vi.advanceTimersByTimeAsync(0);

    expect(childLogger.info).not.toHaveBeenCalled();
  });
});

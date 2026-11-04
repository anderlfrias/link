import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  playEndCallTone,
  playIncomingRingtone,
  playOutgoingRingtone,
  resetAudioContextForTesting,
  stopAllTones,
} from "./call-tones";

describe("call-tones", () => {
  let mockOscillator: any;
  let mockGain: any;
  let mockAudioContext: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockOscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    mockAudioContext = {
      state: "running",
      currentTime: 0,
      createOscillator: vi.fn(() => ({ ...mockOscillator })),
      createGain: vi.fn(() => ({ ...mockGain })),
      destination: {},
      resume: vi.fn(),
    };

    (window as any).AudioContext = vi.fn(function () {
      return mockAudioContext;
    });
  });

  afterEach(() => {
    resetAudioContextForTesting();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("reproduce tono de llamada entrante y crea osciladores periódicamente", () => {
    playIncomingRingtone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();

    // Avanzar tiempo para el intervalo de timbrado
    vi.advanceTimersByTime(3000);
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(4); // 2 por ráfaga
  });

  describe("con el audio bloqueado por el navegador (una llamada que entra sin que se haya tocado la página)", () => {
    beforeEach(() => {
      mockAudioContext.state = "suspended";
    });

    it("no encola ráfagas mientras está bloqueado: sonarían todas juntas al liberarse", () => {
      mockAudioContext.resume.mockReturnValue(new Promise(() => {}));

      playIncomingRingtone();
      vi.advanceTimersByTime(8000);

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it("la primera ráfaga suena apenas se libera el audio, sin esperar al intervalo", async () => {
      mockAudioContext.resume.mockImplementation(async () => {
        mockAudioContext.state = "running";
      });

      playIncomingRingtone();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    });

    it("si la llamada ya no suena cuando se libera el audio, no suena nada", async () => {
      let release: () => void = () => {};
      mockAudioContext.resume.mockReturnValue(
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      );

      playIncomingRingtone();
      stopAllTones();
      mockAudioContext.state = "running";
      release();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    });

    it("el primer toque o tecla de la persona libera el audio, una sola vez", () => {
      mockAudioContext.resume.mockReturnValue(new Promise(() => {}));
      playIncomingRingtone();
      playIncomingRingtone();
      mockAudioContext.resume.mockClear();

      window.dispatchEvent(new Event("pointerdown"));
      window.dispatchEvent(new Event("keydown"));

      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
    });

    it("un resume que falla no rompe el tono", async () => {
      mockAudioContext.resume.mockRejectedValue(new Error("blocked"));

      expect(() => playIncomingRingtone()).not.toThrow();
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it("reproduce tono de llamada saliente", () => {
    playOutgoingRingtone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
    expect(mockAudioContext.createGain).toHaveBeenCalled();
  });

  it("reproduce tono de fin de llamada", () => {
    playEndCallTone();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it("detiene todos los tonos y limpia intervalos", () => {
    playIncomingRingtone();
    expect(() => stopAllTones()).not.toThrow();
  });
});

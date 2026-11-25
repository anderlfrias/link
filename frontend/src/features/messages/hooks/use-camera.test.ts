import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCamera } from "./use-camera";

describe("useCamera", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn>; getSettings: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: () => any[]; getVideoTracks: () => any[] };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrack = { stop: vi.fn(), getSettings: vi.fn().mockReturnValue({}) };
    mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    };

    // Mock navigator.mediaDevices
    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "videoinput", deviceId: "cam-back-1", label: "Back Camera 1" },
          { kind: "videoinput", deviceId: "cam-front-1", label: "Front Camera" },
        ]),
      },
    });

    // Mock URL.createObjectURL / revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-camera-url");
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes in idle state", () => {
    const { result } = renderHook(() => useCamera());

    expect(result.current.status).toBe("idle");
    expect(result.current.stream).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.hasAudio).toBe(false);
    expect(result.current.facingMode).toBe("environment");
  });

  it("starts camera successfully and assigns stream", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: "user" } }),
      }),
    );
    expect(result.current.status).toBe("ready");
    expect(result.current.stream).toBe(mockStream);
    expect(result.current.facingMode).toBe("user");
  });

  it("switches camera between multiple devices", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("environment", "cam-back-1");
    });

    expect(result.current.availableCameras.length).toBe(2);
    expect(result.current.hasMultipleCameras).toBe(true);

    await act(async () => {
      await result.current.switchCamera();
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ deviceId: { exact: "cam-front-1" } }),
      }),
    );
  });

  it("falls back gracefully when high resolution constraints fail", async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia)
      .mockRejectedValueOnce(new Error("OverconstrainedError"))
      .mockResolvedValueOnce(mockStream as any);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("environment");
    });

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("ready");
    expect(result.current.stream).toBe(mockStream);
  });

  it("handles permission denied error", async () => {
    const permError = new Error("Permission denied");
    permError.name = "NotAllowedError";
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(permError);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("Permiso denegado");
    expect(result.current.stream).toBeNull();
  });

  it("handles camera not found error", async () => {
    const notFoundError = new Error("Not found");
    notFoundError.name = "NotFoundError";
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(notFoundError);

    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("No se encontró ninguna cámara");
  });

  it("stops camera and terminates tracks", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera();
    });

    expect(result.current.stream).toBe(mockStream);

    act(() => {
      result.current.stopCamera();
    });

    expect(mockTrack.stop).toHaveBeenCalled();
    expect(result.current.stream).toBeNull();
  });

  it("captura una foto como File y deja la cámara encendida para sacar otra", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    const mockVideo = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const mockContext = { translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback) => {
      callback(new Blob(["fake-image-bytes"], { type: "image/jpeg" }));
    });

    let first: File | null = null;
    let second: File | null = null;
    await act(async () => {
      first = await result.current.capture(mockVideo);
      second = await result.current.capture(mockVideo);
    });

    expect(first).toBeInstanceOf(File);
    expect((first as unknown as File).type).toBe("image/jpeg");
    expect((first as unknown as File).name).toMatch(/^foto_camara_\d+\.jpg$/);
    expect(second).toBeInstanceOf(File);
    // Sigue en vivo: no se apagó el stream ni se pasó a un estado de revisión.
    expect(result.current.status).toBe("ready");
    expect(result.current.stream).toBe(mockStream);
    expect(mockTrack.stop).not.toHaveBeenCalled();
  });

  it("capture devuelve null si el visor todavía no tiene imagen", async () => {
    const { result } = renderHook(() => useCamera());

    let file: File | null = {} as File;
    await act(async () => {
      file = await result.current.capture({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement);
    });

    expect(file).toBeNull();
  });

  it("pide micrófono solo cuando se indica, y lo recuerda al cambiar de cámara", async () => {
    const audioTrack = { stop: vi.fn(), getSettings: vi.fn().mockReturnValue({}) };
    const streamWithAudio = {
      getTracks: () => [mockTrack, audioTrack],
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [audioTrack],
    };
    vi.mocked(navigator.mediaDevices.getUserMedia).mockResolvedValue(streamWithAudio as any);
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("environment", undefined, true);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true }));
    expect(result.current.hasAudio).toBe(true);

    // switchCamera no vuelve a indicar nada: se conserva el audio.
    await act(async () => {
      await result.current.switchCamera();
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: true }));

    await act(async () => {
      await result.current.startCamera("environment", undefined, false);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(expect.objectContaining({ audio: false }));
  });

  it("recorta la foto exactamente al encuadre visible (WYSIWYG) si el visor tiene distinta relación de aspecto que el sensor", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("environment");
    });

    // Sensor de video horizontal 1920x1080 (16:9)
    // Pero visor en móvil vertical de 360x640 (9:16)
    const mockVideo = {
      videoWidth: 1920,
      videoHeight: 1080,
      clientWidth: 360,
      clientHeight: 640,
    } as HTMLVideoElement;

    const mockDrawImage = vi.fn();
    const mockContext = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: mockDrawImage,
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);

    const mockBlob = new Blob(["cropped-photo"], { type: "image/jpeg" });
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback) => {
      callback(mockBlob);
    });

    await act(async () => {
      await result.current.capture(mockVideo);
    });

    // El aspect ratio del visor es 360/640 = 0.5625
    // El aspect ratio del video es 1920/1080 = 1.777
    // sourceWidth = 1080 * (360/640) = 607.5 -> 608px
    // sourceX = (1920 - 607.5) / 2 = 656.25px
    expect(mockDrawImage).toHaveBeenCalledTimes(1);
    const [, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight] = mockDrawImage.mock.calls[0];
    expect(Math.round(sWidth)).toBe(608);
    expect(Math.round(sHeight)).toBe(1080);
    expect(Math.round(sx)).toBe(656);
    expect(sy).toBe(0);
    expect(dx).toBe(0);
    expect(dy).toBe(0);
    expect(dWidth).toBe(608);
    expect(dHeight).toBe(1080);
  });
});

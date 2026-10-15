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
    expect(result.current.capturedBlob).toBeNull();
    expect(result.current.capturedUrl).toBeNull();
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

  it("captures photo, stops live stream, and creates file upon confirmation", async () => {
    const { result } = renderHook(() => useCamera());

    await act(async () => {
      await result.current.startCamera("user");
    });

    // Mock video element
    const mockVideo = {
      videoWidth: 640,
      videoHeight: 480,
    } as HTMLVideoElement;

    // Mock canvas 2D context
    const mockContext = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);

    const mockBlob = new Blob(["fake-image-bytes"], { type: "image/jpeg" });
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((callback) => {
      callback(mockBlob);
    });

    let capturedResult: Blob | null = null;
    await act(async () => {
      capturedResult = await result.current.capture(mockVideo);
    });

    expect(capturedResult).toBe(mockBlob);
    expect(result.current.status).toBe("captured");
    expect(result.current.capturedBlob).toBe(mockBlob);
    expect(result.current.capturedUrl).toBe("blob:mock-camera-url");
    // Camera stream stopped after capture
    expect(result.current.stream).toBeNull();
    expect(mockTrack.stop).toHaveBeenCalled();

    // Confirm photo to File
    const file = result.current.confirmPhoto("mi_foto.jpg");
    expect(file).toBeInstanceOf(File);
    expect(file?.name).toBe("mi_foto.jpg");
    expect(file?.type).toBe("image/jpeg");

    // Retake restarts camera
    await act(async () => {
      await result.current.retake();
    });

    expect(result.current.status).toBe("ready");
    expect(result.current.capturedBlob).toBeNull();
    expect(result.current.capturedUrl).toBeNull();
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

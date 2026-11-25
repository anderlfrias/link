import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CameraCaptureModal } from "./CameraCaptureModal";

describe("CameraCaptureModal", () => {
  let mockTrack: { stop: ReturnType<typeof vi.fn>; getSettings: ReturnType<typeof vi.fn> };
  let mockStream: { getTracks: () => any[]; getVideoTracks: () => any[] };

  beforeEach(() => {
    vi.clearAllMocks();

    mockTrack = { stop: vi.fn(), getSettings: vi.fn().mockReturnValue({}) };
    mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
    };

    Object.defineProperty(global.navigator, "mediaDevices", {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    global.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-camera-capture");
    global.URL.revokeObjectURL = vi.fn();

    // Mock HTMLMediaElement play
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);

    // Mock canvas context and toBlob
    const mockContext = {
      translate: vi.fn(),
      scale: vi.fn(),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(mockContext as any);
    HTMLCanvasElement.prototype.toBlob = vi.fn().mockImplementation((cb) => {
      cb(new Blob(["photo-content"], { type: "image/jpeg" }));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not render when open is false", () => {
    render(<CameraCaptureModal open={false} onClose={vi.fn()} onCapture={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders camera dialog, starts camera stream and displays shutter button", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Cámara" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText("Visor de cámara")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });
  });

  function mockVideoSize() {
    const video = screen.getByLabelText("Visor de cámara") as HTMLVideoElement;
    Object.defineProperty(video, "videoWidth", { value: 1280 });
    Object.defineProperty(video, "videoHeight", { value: 720 });
  }

  it("permite sacar varias fotos seguidas sin salir del visor y las agrega todas al tocar Listo", async () => {
    const onCapture = vi.fn();
    const onClose = vi.fn();

    render(<CameraCaptureModal open={true} onClose={onClose} onCapture={onCapture} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });
    mockVideoSize();

    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));
    await waitFor(() => expect(screen.getByAltText("Foto 1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));
    await waitFor(() => expect(screen.getByAltText("Foto 2")).toBeInTheDocument());

    // El visor sigue activo para la próxima y todavía no se agregó nada al mensaje.
    expect(screen.getByLabelText("Visor de cámara")).toBeInTheDocument();
    expect(onCapture).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar 2 fotos" }));

    expect(onCapture).toHaveBeenCalledTimes(1);
    const files = onCapture.mock.calls[0][0] as File[];
    expect(files).toHaveLength(2);
    files.forEach((file) => expect(file.type).toBe("image/jpeg"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("permite quitar una foto de la tira antes de agregarlas", async () => {
    const onCapture = vi.fn();
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={onCapture} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });
    mockVideoSize();

    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));
    await waitFor(() => expect(screen.getByAltText("Foto 1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));
    await waitFor(() => expect(screen.getByAltText("Foto 2")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Quitar foto 1" }));
    expect(screen.queryByAltText("Foto 2")).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Agregar 1 foto" }));
    expect(onCapture.mock.calls[0][0]).toHaveLength(1);
  });

  it("no muestra 'Listo' mientras no se capturó nada", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^Agregar/ })).not.toBeInTheDocument();
  });

  describe("modo video", () => {
    class FakeRecorder {
      static isTypeSupported = () => true;
      state: "inactive" | "recording" = "inactive";
      mimeType = "video/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(public stream: unknown) {}
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["video-bytes"]) });
        this.onstop?.();
      }
    }

    beforeEach(() => {
      vi.stubGlobal("MediaRecorder", FakeRecorder);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("cambia a video (pidiendo micrófono), graba, detiene y suma el video a la tira junto a las fotos", async () => {
      const onCapture = vi.fn();
      render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={onCapture} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
      });
      mockVideoSize();
      fireEvent.click(screen.getByRole("button", { name: "Tomar foto" }));
      await waitFor(() => expect(screen.getByAltText("Foto 1")).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Video" }));
      await waitFor(() => {
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
          expect.objectContaining({ audio: true }),
        );
        expect(screen.getByRole("button", { name: "Grabar video" })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: "Grabar video" }));
      expect(await screen.findByRole("timer", { name: "Tiempo de grabación" })).toBeInTheDocument();
      // Mientras graba no se puede cambiar de modo ni de cámara.
      expect(screen.queryByRole("button", { name: "Foto" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Cambiar cámara" })).toBeDisabled();

      fireEvent.click(screen.getByRole("button", { name: "Detener grabación" }));
      await waitFor(() => expect(screen.getByRole("img", { name: "Video 2" })).toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: "Agregar 1 foto y 1 video" }));
      const files = onCapture.mock.calls[0][0] as File[];
      expect(files.map((file) => file.type)).toEqual(["image/jpeg", "video/webm"]);
    });

    it("avisa cuando no hay micrófono: el video sale sin sonido", async () => {
      render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole("button", { name: "Video" }));

      // El stream de prueba no trae pistas de audio.
      expect(await screen.findByText("Sin micrófono: el video se grabará sin sonido.")).toBeInTheDocument();
    });
  });

  it("no ofrece el modo video si el navegador no puede grabar", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Tomar foto" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Video" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("closes modal on close button click and on Escape key", async () => {
    const onClose = vi.fn();
    render(<CameraCaptureModal open={true} onClose={onClose} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole("button", { name: "Cerrar cámara" });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("switches camera between user and environment modes", async () => {
    render(<CameraCaptureModal open={true} onClose={vi.fn()} onCapture={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Cambiar cámara" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Cambiar cámara" }));

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({ facingMode: { ideal: "user" } }),
        }),
      );
    });
  });
});

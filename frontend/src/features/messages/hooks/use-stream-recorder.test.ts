import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStreamRecorder } from "./use-stream-recorder";

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  static supported = new Set(["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]);
  static isTypeSupported = (type: string) => FakeRecorder.supported.has(type);

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "";
    FakeRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["video-bytes"]) });
    this.onstop?.();
  }
}

describe("useStreamRecorder", () => {
  const stream = {} as MediaStream;

  beforeEach(() => {
    FakeRecorder.instances = [];
    FakeRecorder.supported = new Set(["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]);
    vi.stubGlobal("MediaRecorder", FakeRecorder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("graba y devuelve un File con el tipo base (sin codecs)", async () => {
    const { result } = renderHook(() => useStreamRecorder(stream));

    act(() => {
      expect(result.current.start()).toBe(true);
    });
    expect(result.current.recording).toBe(true);
    expect(FakeRecorder.instances[0].mimeType).toBe("video/webm;codecs=vp9,opus");

    let file: File | null = null;
    await act(async () => {
      file = await result.current.stop();
    });

    expect(result.current.recording).toBe(false);
    expect(file).toBeInstanceOf(File);
    expect((file as unknown as File).type).toBe("video/webm");
    expect((file as unknown as File).name).toMatch(/^video_camara_\d+\.webm$/);
  });

  it("usa mp4 cuando el navegador no graba webm (Safari)", async () => {
    FakeRecorder.supported = new Set(["video/mp4"]);
    const { result } = renderHook(() => useStreamRecorder(stream));

    act(() => {
      result.current.start();
    });
    let file: File | null = null;
    await act(async () => {
      file = await result.current.stop();
    });

    expect((file as unknown as File).type).toBe("video/mp4");
    expect((file as unknown as File).name).toMatch(/\.mp4$/);
  });

  it("no empieza sin stream ni dos veces a la vez", () => {
    const { result: noStream } = renderHook(() => useStreamRecorder(null));
    expect(noStream.current.start()).toBe(false);

    const { result } = renderHook(() => useStreamRecorder(stream));
    act(() => {
      result.current.start();
    });
    act(() => {
      expect(result.current.start()).toBe(false);
    });
    expect(FakeRecorder.instances).toHaveLength(1);
  });

  it("stop sin grabación en curso devuelve null", async () => {
    const { result } = renderHook(() => useStreamRecorder(stream));

    let file: File | null = {} as File;
    await act(async () => {
      file = await result.current.stop();
    });

    expect(file).toBeNull();
  });

  it("cancel descarta la grabación sin devolver nada", () => {
    const { result } = renderHook(() => useStreamRecorder(stream));

    act(() => {
      result.current.start();
    });
    act(() => {
      result.current.cancel();
    });

    expect(result.current.recording).toBe(false);
    expect(FakeRecorder.instances[0].state).toBe("inactive");
  });

  it("avisa que no hay soporte si el navegador no tiene MediaRecorder", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("MediaRecorder", undefined);
    const { result } = renderHook(() => useStreamRecorder(stream));

    expect(result.current.supported).toBe(false);
    expect(result.current.start()).toBe(false);
  });
});

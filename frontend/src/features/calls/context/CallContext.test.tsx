import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CALL_RING_SAFETY_MS } from "../constants/call.constants";
import * as tones from "../utils/call-tones";
import { CallProvider, useCall } from "./CallContext";

const handlers = new Map<string, (payload: any) => unknown>();
const socket = {
  emit: vi.fn(),
  on: vi.fn((ev: string, h: (p: any) => unknown) => handlers.set(ev, h)),
  off: vi.fn((ev: string) => handlers.delete(ev)),
};

vi.mock("@/providers/socket-provider", () => ({ useSocket: () => ({ socket }) }));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({ session: { user: { internalUserId: "me" } } }),
}));
vi.mock("../utils/call-tones", () => ({
  playEndCallTone: vi.fn(),
  playIncomingRingtone: vi.fn(),
  playOutgoingRingtone: vi.fn(),
  stopAllTones: vi.fn(),
}));

class FakePC {
  static instances: FakePC[] = [];
  connectionState = "new";
  iceConnectionState = "new";
  iceGatheringState = "new";
  signalingState = "stable";
  remoteDescription: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: unknown = null;
  onicecandidate: unknown = null;
  oniceconnectionstatechange: unknown = null;
  onicegatheringstatechange: unknown = null;
  onicecandidateerror: unknown = null;
  onsignalingstatechange: unknown = null;
  addTrack = vi.fn();
  close = vi.fn(() => {
    this.signalingState = "closed";
  });
  addTransceiver = vi.fn();
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "x" }));
  setLocalDescription = vi.fn(async () => {});
  constructor() {
    FakePC.instances.push(this);
  }
  setState(state: string) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

const track = () => ({ stop: vi.fn(), enabled: true });
const call = { id: "c1", callerId: "me", receiverId: "peer", type: "AUDIO", status: "ACCEPTED" };

function makeStream() {
  const t = track();
  return { t, stream: { getTracks: () => [t], getAudioTracks: () => [t], getVideoTracks: () => [] } };
}

async function startAcceptedCall(result: { current: ReturnType<typeof useCall> }) {
  socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
    if (ev === "call:initiate") cb?.({ ok: true, call: { ...call, status: "RINGING" } });
  });
  await act(async () => {
    await result.current.startCall("conv", "peer", "Peer", "AUDIO");
  });
  await act(async () => {
    await handlers.get("call:accepted")!({ call });
  });
}

describe("CallContext (ciclo de vida WebRTC)", () => {
  let media: ReturnType<typeof makeStream>;
  const wrapper = ({ children }: { children: React.ReactNode }) => <CallProvider>{children}</CallProvider>;

  beforeEach(() => {
    // Los mocks de los tonos son del módulo: sin esto acumulan llamadas de un test al siguiente.
    vi.clearAllMocks();
    handlers.clear();
    FakePC.instances = [];
    socket.emit.mockReset();
    media = makeStream();
    vi.stubGlobal("RTCPeerConnection", FakePC);
    vi.stubGlobal("RTCSessionDescription", class {});
    vi.stubGlobal("RTCIceCandidate", class {});
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => media.stream) },
    });
    vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("call:accepted deja la llamada en 'connecting', no en 'connected'", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    await waitFor(() => expect(result.current.callState).toBe("connecting"));
    expect(FakePC.instances).toHaveLength(1);
    expect(socket.emit).toHaveBeenCalledWith("call:signal", expect.objectContaining({ callId: "c1" }));
  });

  it("pasa a 'connected' solo cuando connectionState es 'connected'", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    act(() => FakePC.instances[0].setState("connecting"));
    expect(result.current.callState).toBe("connecting");
    act(() => FakePC.instances[0].setState("connected"));
    expect(result.current.callState).toBe("connected");
  });

  it("'disconnected' no termina la llamada (permite recuperación)", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    act(() => FakePC.instances[0].setState("connected"));
    act(() => FakePC.instances[0].setState("disconnected"));
    expect(result.current.callState).toBe("connected");
  });

  it("'failed' avisa al peer, limpia recursos y expone el error", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    const pc = FakePC.instances[0];

    act(() => pc.setState("failed"));

    expect(socket.emit).toHaveBeenCalledWith("call:end", { callId: "c1" });
    expect(pc.close).toHaveBeenCalled();
    expect(pc.onconnectionstatechange).toBeNull();
    expect(media.t.stop).toHaveBeenCalled();
    expect(result.current.callState).toBe("idle");
    expect(result.current.activeCall).toBeNull();
    expect(result.current.callError).toBe("connection");
  });

  it("una señal tardía tras terminar la llamada no crea un PeerConnection nuevo", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    await act(async () => {
      await result.current.endCall();
    });
    expect(result.current.callState).toBe("idle");

    await act(async () => {
      await handlers.get("call:signal")!({
        callId: "c1",
        senderUserId: "peer",
        signal: { candidate: "x" },
      });
    });
    expect(FakePC.instances).toHaveLength(1);
  });

  it("una llamada nueva crea un PC limpio tras terminar la anterior", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);
    await act(async () => {
      await result.current.endCall();
    });
    await startAcceptedCall(result);
    expect(FakePC.instances).toHaveLength(2);
    expect(FakePC.instances[1]).not.toBe(FakePC.instances[0]);
  });

  it("getUserMedia falla al llamar: vuelve a idle y expone error de medios", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(new Error("denied"));
    const { result } = renderHook(() => useCall(), { wrapper });

    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });

    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("media");
    expect(socket.emit).not.toHaveBeenCalledWith("call:initiate", expect.anything(), expect.anything());
  });

  it("peerName es el nombre de la otra persona, para el receptor y para el llamante", async () => {
    const named = { ...call, callerName: "Juan", receiverName: "María" };

    // Soy el receptor ("me"): la llamada entrante viene de Juan
    const receiver = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      handlers.get("call:incoming")!({ call: { ...named, callerId: "peer", receiverId: "me" } });
    });
    expect(receiver.result.current.peerName).toBe("Juan");
    receiver.unmount();

    // Soy el llamante ("me"): el otro es el receptor
    handlers.clear();
    const caller = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(caller.result);
    await act(async () => {
      await handlers.get("call:accepted")!({ call: named });
    });
    expect(caller.result.current.peerName).toBe("María");
  });

  it("sin micrófono ni cámara: la llamada sigue en modo solo-recepción (recvonly)", async () => {
    const notFound = Object.assign(new Error("x"), { name: "NotFoundError" });
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValue(notFound);
    const { result } = renderHook(() => useCall(), { wrapper });
    await startAcceptedCall(result);

    expect(result.current.callState).toBe("connecting");
    expect(result.current.callError).toBeNull();
    expect(result.current.mediaWarning).toBe("no-mic");
    expect(FakePC.instances[0].addTransceiver).toHaveBeenCalledWith("audio", { direction: "recvonly" });
  });

  it("permiso denegado: error 'denied' (no degrada)", async () => {
    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });
    expect(result.current.callError).toBe("denied");
    expect(result.current.callState).toBe("idle");
  });

  it("sin navigator.mediaDevices (contexto HTTP inseguro): expone error 'insecure'", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const { result } = renderHook(() => useCall(), { wrapper });

    await act(async () => {
      await result.current.startCall("conv", "peer", "Peer", "AUDIO");
    });

    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("insecure");
  });

  it("getUserMedia falla al aceptar: rechaza la llamada para no dejar al llamante esperando", async () => {
    const { result } = renderHook(() => useCall(), { wrapper });
    await act(async () => {
      handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
    });
    expect(result.current.callState).toBe("incoming");

    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(new Error("denied"));
    await act(async () => {
      await result.current.acceptCall();
    });

    expect(socket.emit).toHaveBeenCalledWith("call:reject", { callId: "c1", reason: "declined" });
    expect(result.current.callState).toBe("idle");
    expect(result.current.callError).toBe("media");
  });

  describe("llamada que suena al abrir la app o recuperar la conexión (call:sync)", () => {
    const ringingForMe = { ...call, callerId: "peer", receiverId: "me", status: "RINGING", callerName: "Juan" };

    /** El servidor responde a `call:sync` con `pending` (la llamada que suena, o null). */
    function serverHasPending(pending: unknown) {
      socket.emit.mockImplementation((ev: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:sync") cb?.({ ok: true, call: pending });
      });
    }

    beforeEach(() => {
      (socket as any).connected = true;
    });

    afterEach(() => {
      (socket as any).connected = undefined;
    });

    it("al montar con el socket conectado muestra la llamada entrante que ya estaba sonando", async () => {
      serverHasPending(ringingForMe);

      const { result } = renderHook(() => useCall(), { wrapper });

      await waitFor(() => expect(result.current.callState).toBe("incoming"));
      expect(socket.emit).toHaveBeenCalledWith("call:sync", {}, expect.any(Function));
      expect(result.current.activeCall).toMatchObject({ id: "c1", callerName: "Juan" });
      expect(tones.playIncomingRingtone).toHaveBeenCalledTimes(1);
    });

    it("no pregunta mientras el socket no está conectado: lo hace al conectar", async () => {
      (socket as any).connected = false;
      serverHasPending(ringingForMe);

      const { result } = renderHook(() => useCall(), { wrapper });
      expect(socket.emit).not.toHaveBeenCalledWith("call:sync", expect.anything(), expect.anything());
      expect(result.current.callState).toBe("idle");

      (socket as any).connected = true;
      act(() => {
        handlers.get("connect")!({});
      });

      await waitFor(() => expect(result.current.callState).toBe("incoming"));
    });

    it("sin llamada pendiente no hace nada", async () => {
      serverHasPending(null);

      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {});
      expect(result.current.callState).toBe("idle");
      expect(tones.playIncomingRingtone).not.toHaveBeenCalled();
    });

    it("una llamada pendiente que hice yo (soy el llamante) no se muestra como entrante", async () => {
      serverHasPending({ ...ringingForMe, callerId: "me", receiverId: "peer" });

      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {});
      expect(result.current.callState).toBe("idle");
    });

    it("una respuesta con error no hace nada", async () => {
      socket.emit.mockImplementation((ev: string, _payload: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:sync") cb?.({ ok: false, error: "Error al consultar la llamada" });
      });

      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {});
      expect(result.current.callState).toBe("idle");
    });

    it("al volver a ser visible la pestaña vuelve a preguntar", async () => {
      serverHasPending(null);
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {});
      socket.emit.mockClear();
      serverHasPending(ringingForMe);

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitFor(() => expect(result.current.callState).toBe("incoming"));
    });

    it("con la pestaña oculta no pregunta", async () => {
      serverHasPending(null);
      renderHook(() => useCall(), { wrapper });
      await act(async () => {});
      socket.emit.mockClear();

      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      expect(socket.emit).not.toHaveBeenCalled();
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    });

    it("el servidor ya no tiene la llamada sonando: cierra el modal que había quedado abierto", async () => {
      serverHasPending(null);
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });
      expect(result.current.callState).toBe("incoming");

      act(() => {
        handlers.get("connect")!({});
      });

      await waitFor(() => expect(result.current.callState).toBe("idle"));
      expect(result.current.activeCall).toBeNull();
      expect(tones.stopAllTones).toHaveBeenCalled();
    });

    it("no cierra el modal mientras se está aceptando la llamada (el micrófono puede tardar en dar permiso)", async () => {
      serverHasPending(null);
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });
      let grantMicrophone: (stream: unknown) => void = () => {};
      (navigator.mediaDevices.getUserMedia as any).mockReturnValueOnce(
        new Promise((resolve) => {
          grantMicrophone = resolve;
        }),
      );

      act(() => {
        void result.current.acceptCall();
      });
      act(() => {
        handlers.get("connect")!({});
      });

      expect(result.current.callState).toBe("incoming");

      await act(async () => {
        grantMicrophone(media.stream);
      });
    });

    it("la misma llamada que llega en vivo y por call:sync suena una sola vez y no se rechaza por ocupada", async () => {
      serverHasPending(null);
      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });

      expect(result.current.callState).toBe("incoming");
      expect(tones.playIncomingRingtone).toHaveBeenCalledTimes(1);
      expect(socket.emit).not.toHaveBeenCalledWith("call:reject", expect.anything());
    });

    it("una llamada distinta mientras suena otra se rechaza por ocupado", async () => {
      serverHasPending(null);
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });

      await act(async () => {
        handlers.get("call:incoming")!({ call: { ...ringingForMe, id: "c2" } });
      });

      expect(socket.emit).toHaveBeenCalledWith("call:reject", { callId: "c2", reason: "busy" });
      expect(result.current.activeCall?.id).toBe("c1");
    });
  });

  describe("varias sesiones del mismo usuario", () => {
    const ringingForMe = { ...call, callerId: "peer", receiverId: "me", status: "RINGING" };

    it("call:answered-elsewhere cierra el modal que suena sin emitir nada al servidor", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });
      socket.emit.mockClear();

      await act(async () => {
        handlers.get("call:answered-elsewhere")!({ callId: "c1" });
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.activeCall).toBeNull();
      expect(tones.stopAllTones).toHaveBeenCalled();
      // No cuelga ni rechaza nada: la llamada la tiene la otra sesión.
      expect(socket.emit).not.toHaveBeenCalled();
    });

    it("call:answered-elsewhere de otra llamada se ignora", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: ringingForMe });
      });

      await act(async () => {
        handlers.get("call:answered-elsewhere")!({ callId: "otra" });
      });

      expect(result.current.callState).toBe("incoming");
    });

    it("una pestaña sin llamada ignora call:accepted, call:rejected y call:ended: no suena ni arma otra oferta", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {
        await handlers.get("call:accepted")!({ call });
        handlers.get("call:rejected")!({ call: { ...call, status: "REJECTED" }, reason: "declined" });
        handlers.get("call:ended")!({ call });
        handlers.get("call:busy")!({ call });
      });

      expect(result.current.callState).toBe("idle");
      expect(FakePC.instances).toHaveLength(0);
      expect(tones.playEndCallTone).not.toHaveBeenCalled();
      expect(result.current.callOutcome).toBeNull();
    });

    it("los eventos de OTRA llamada no terminan la que está en curso", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startAcceptedCall(result);

      await act(async () => {
        handlers.get("call:ended")!({ call: { ...call, id: "otra" } });
        handlers.get("call:rejected")!({ call: { ...call, id: "otra", status: "REJECTED" } });
      });

      expect(result.current.callState).toBe("connecting");
    });

    it("call:ended de la llamada en curso la termina", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startAcceptedCall(result);

      await act(async () => {
        handlers.get("call:ended")!({ call });
      });

      expect(result.current.callState).toBe("idle");
      expect(tones.playEndCallTone).toHaveBeenCalled();
    });

    it("call:ended sin llamada en el payload no rompe ni termina nada", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startAcceptedCall(result);

      await act(async () => {
        handlers.get("call:ended")!({});
        handlers.get("call:ended")!(undefined);
      });

      expect(result.current.callState).toBe("connecting");
    });
  });

  describe("resultado de la llamada que hice y no se conectó", () => {
    const outgoingCall = { ...call, conversationId: "conv" };

    async function startOutgoing(result: { current: ReturnType<typeof useCall> }) {
      socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:initiate") cb?.({ ok: true, call: { ...outgoingCall, status: "RINGING" } });
      });
      await act(async () => {
        await result.current.startCall("conv", "peer", "Peer", "AUDIO");
      });
      expect(result.current.callState).toBe("outgoing");
    }

    it.each([
      { status: "MISSED", reason: "timeout", kind: "no-answer" },
      { status: "REJECTED", reason: "declined", kind: "declined" },
      { status: "BUSY", reason: "busy", kind: "busy" },
    ])("$status ($reason) deja el resultado $kind para volver a llamar", async ({ status, reason, kind }) => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startOutgoing(result);

      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...outgoingCall, status }, reason });
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toEqual({
        kind,
        conversationId: "conv",
        receiverId: "peer",
        receiverName: "Peer",
        type: "AUDIO",
      });
    });

    it("una llamada cancelada por mí (MISSED sin timeout) no deja ningún resultado", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startOutgoing(result);

      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...call, status: "MISSED" }, reason: "declined" });
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toBeNull();
    });

    it("quien recibe la llamada no ve ningún resultado cuando vence: le queda el registro en el chat", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
      });

      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...call, status: "MISSED" }, reason: "timeout" });
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toBeNull();
    });

    it("el receptor ocupado (respuesta de call:initiate) deja el resultado ocupado", async () => {
      socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:initiate") cb?.({ ok: false, isBusy: true });
      });
      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {
        await result.current.startCall("conv", "peer", "Peer", "VIDEO");
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toMatchObject({ kind: "busy", receiverName: "Peer", type: "VIDEO" });
    });

    it("una falla al iniciar que no es ocupado no deja resultado", async () => {
      socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:initiate") cb?.({ ok: false, error: "Ya te encuentras en una llamada activa" });
      });
      const { result } = renderHook(() => useCall(), { wrapper });

      await act(async () => {
        await result.current.startCall("conv", "peer", "Peer", "AUDIO");
      });

      expect(result.current.callOutcome).toBeNull();
    });

    it("dismissCallOutcome lo limpia", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startOutgoing(result);
      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...outgoingCall, status: "REJECTED" }, reason: "declined" });
      });
      expect(result.current.callOutcome).not.toBeNull();

      act(() => result.current.dismissCallOutcome());

      expect(result.current.callOutcome).toBeNull();
    });

    it("una llamada que me entra borra el resultado anterior", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startOutgoing(result);
      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...outgoingCall, status: "REJECTED" }, reason: "declined" });
      });
      expect(result.current.callOutcome).not.toBeNull();

      await act(async () => {
        handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
      });

      expect(result.current.callOutcome).toBeNull();
    });

    it("una llamada nueva borra el resultado anterior", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startOutgoing(result);
      await act(async () => {
        handlers.get("call:rejected")!({ call: { ...outgoingCall, status: "REJECTED" }, reason: "declined" });
      });
      expect(result.current.callOutcome).not.toBeNull();

      await startOutgoing(result);

      expect(result.current.callOutcome).toBeNull();
    });
  });

  describe("tope de seguridad de una llamada que sigue sonando en pantalla", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("saliente: si nunca llega el aviso del servidor, a los 55 s queda 'sin respuesta' y libre", async () => {
      socket.emit.mockImplementation((ev: string, _p: unknown, cb?: (r: unknown) => void) => {
        if (ev === "call:initiate") cb?.({ ok: true, call: { ...call, conversationId: "conv", status: "RINGING" } });
      });
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        await result.current.startCall("conv", "peer", "Peer", "AUDIO");
      });
      expect(result.current.callState).toBe("outgoing");

      act(() => {
        vi.advanceTimersByTime(CALL_RING_SAFETY_MS - 1);
      });
      expect(result.current.callState).toBe("outgoing");

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toMatchObject({ kind: "no-answer", receiverName: "Peer" });
    });

    it("entrante: a los 55 s cierra el modal de una llamada que ya terminó", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await act(async () => {
        handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
      });
      expect(result.current.callState).toBe("incoming");

      act(() => {
        vi.advanceTimersByTime(CALL_RING_SAFETY_MS);
      });

      expect(result.current.callState).toBe("idle");
      expect(result.current.callOutcome).toBeNull();
    });

    it("una llamada que se conecta antes no se corta por el tope", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await startAcceptedCall(result);
      expect(result.current.callState).toBe("connecting");

      act(() => {
        vi.advanceTimersByTime(CALL_RING_SAFETY_MS * 2);
      });

      expect(result.current.callState).toBe("connecting");
    });
  });

  describe("rechazar con una respuesta rápida", () => {
    async function ringing(result: { current: ReturnType<typeof useCall> }) {
      await act(async () => {
        handlers.get("call:incoming")!({ call: { ...call, callerId: "peer", receiverId: "me", status: "RINGING" } });
      });
    }

    it("manda el texto recortado junto al rechazo", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await ringing(result);

      await act(async () => {
        await result.current.rejectCall("declined", "  No puedo hablar ahora.  ");
      });

      expect(socket.emit).toHaveBeenCalledWith("call:reject", {
        callId: "c1",
        reason: "declined",
        message: "No puedo hablar ahora.",
      });
      expect(result.current.callState).toBe("idle");
    });

    it("una respuesta vacía o de espacios no se manda", async () => {
      const { result } = renderHook(() => useCall(), { wrapper });
      await ringing(result);

      await act(async () => {
        await result.current.rejectCall("declined", "   ");
      });

      expect(socket.emit).toHaveBeenCalledWith("call:reject", { callId: "c1", reason: "declined" });
    });
  });
});

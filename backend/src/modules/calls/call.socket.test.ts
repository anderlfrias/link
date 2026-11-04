import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "../../utils/errors";
import * as CallService from "./call.service";
import { CALL_EVENTS, notifyCallTimedOut, registerCallSocket } from "./call.socket";

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));
vi.mock("../../socket/request-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../socket/request-context")>();
  return {
    ...actual,
    withRequestContext: (_s: any, fn: any) => fn,
  };
});
vi.mock("./call.service");
vi.mock("./call.repository");

describe("call.socket", () => {
  let mockSocket: any;
  let mockIo: any;
  let handlers: Record<string, Function>;
  /// `emit` de lo que sale por `socket.to(room)`: a los demás sockets de esa room, sin el propio.
  let toOthersEmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers = {};
    toOthersEmit = vi.fn();

    mockSocket = {
      data: {
        user: {
          internalUserId: "user-1",
          email: "user1@example.com",
        },
      },
      on: vi.fn((event: string, handler: Function) => {
        handlers[event] = handler;
      }),
      emit: vi.fn(),
      to: vi.fn(() => ({ emit: toOthersEmit })),
    };

    mockIo = {
      to: vi.fn(() => ({
        emit: vi.fn(),
      })),
    };

    registerCallSocket(mockSocket, mockIo);
  });

  it("registra todos los eventos de llamada esperados", () => {
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.INITIATE, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.ACCEPT, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.REJECT, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.SIGNAL, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.END, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith(CALL_EVENTS.SYNC, expect.any(Function));
    expect(mockSocket.on).toHaveBeenCalledWith("disconnecting", expect.any(Function));
  });

  it("maneja call:initiate emitiendo outgoing e incoming", async () => {
    const mockCall = {
      id: "call-1",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      callerId: "user-1",
      receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      type: "AUDIO",
      status: "RINGING",
    };

    vi.mocked(CallService.initiateCall).mockResolvedValue({
      call: mockCall as any,
      isBusy: false,
    });

    const callback = vi.fn();
    await handlers[CALL_EVENTS.INITIATE](
      {
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        type: "AUDIO",
      },
      callback,
    );

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.OUTGOING, { call: mockCall });
    expect(mockIo.to).toHaveBeenCalledWith("user:6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
  });

  describe("call:accept", () => {
    const callId = "550e8400-e29b-41d4-a716-446655440000";
    const mockCall = { id: callId, callerId: "caller-user", receiverId: "user-1", status: "ACCEPTED" };

    it("avisa al llamante, al socket que aceptó y a las demás sesiones del receptor", async () => {
      const callerEmit = vi.fn();
      mockIo.to.mockReturnValue({ emit: callerEmit });
      vi.mocked(CallService.acceptCall).mockResolvedValue(mockCall as any);

      const callback = vi.fn();
      await handlers[CALL_EVENTS.ACCEPT]({ callId }, callback);

      // Al llamante, en todas sus pestañas.
      expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
      expect(callerEmit).toHaveBeenCalledWith(CALL_EVENTS.ACCEPTED, { call: mockCall });
      // Al socket que aceptó, y solo a él del lado del receptor.
      expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.ACCEPTED, { call: mockCall });
      expect(mockIo.to).not.toHaveBeenCalledWith("user:user-1");
      // A las otras sesiones del receptor: ya la contestó otra.
      expect(mockSocket.to).toHaveBeenCalledWith("user:user-1");
      expect(toOthersEmit).toHaveBeenCalledWith(CALL_EVENTS.ANSWERED_ELSEWHERE, { callId });
      expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
    });

    it("si la llamada ya no está disponible no avisa a nadie y responde el error", async () => {
      vi.mocked(CallService.acceptCall).mockRejectedValue(new ForbiddenError("La llamada ya no está disponible"));

      const callback = vi.fn();
      await handlers[CALL_EVENTS.ACCEPT]({ callId }, callback);

      expect(mockIo.to).not.toHaveBeenCalled();
      expect(toOthersEmit).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ ok: false, error: "La llamada ya no está disponible" });
    });
  });

  describe("call:reject", () => {
    const callId = "550e8400-e29b-41d4-a716-446655440000";

    it("pasa la respuesta rápida al servicio y avisa a ambas partes", async () => {
      const emit = vi.fn();
      mockIo.to.mockReturnValue({ emit });
      const rejected = { id: callId, callerId: "caller-user", receiverId: "user-1", status: "REJECTED" };
      vi.mocked(CallService.rejectCall).mockResolvedValue(rejected as any);

      const callback = vi.fn();
      await handlers[CALL_EVENTS.REJECT]({ callId, reason: "declined", message: "  No puedo hablar ahora.  " }, callback);

      expect(CallService.rejectCall).toHaveBeenCalledWith("user-1", callId, "declined", "No puedo hablar ahora.");
      expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
      expect(mockIo.to).toHaveBeenCalledWith("user:user-1");
      expect(emit).toHaveBeenCalledWith(CALL_EVENTS.REJECTED, { call: rejected, reason: "declined" });
      expect(callback).toHaveBeenCalledWith({ ok: true, call: rejected });
    });

    it("rechaza sin respuesta rápida cuando no se manda ninguna", async () => {
      vi.mocked(CallService.rejectCall).mockResolvedValue({ id: callId, callerId: "c", receiverId: "user-1" } as any);

      await handlers[CALL_EVENTS.REJECT]({ callId }, vi.fn());

      expect(CallService.rejectCall).toHaveBeenCalledWith("user-1", callId, "declined", undefined);
    });

    it("una respuesta rápida demasiado larga se rechaza sin tocar la llamada", async () => {
      const callback = vi.fn();

      await handlers[CALL_EVENTS.REJECT]({ callId, message: "x".repeat(201) }, callback);

      expect(CallService.rejectCall).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledWith({ ok: false, error: expect.stringContaining("200") });
    });
  });

  describe("call:sync", () => {
    it("responde con la llamada que suena ahora para el usuario", async () => {
      const pending = { id: "call-9", callerId: "caller-user", receiverId: "user-1", status: "RINGING" };
      vi.mocked(CallService.getPendingCall).mockResolvedValue(pending as any);

      const callback = vi.fn();
      await handlers[CALL_EVENTS.SYNC]({}, callback);

      expect(CallService.getPendingCall).toHaveBeenCalledWith("user-1");
      expect(callback).toHaveBeenCalledWith({ ok: true, call: pending });
      // Es una consulta: no emite nada a nadie.
      expect(mockSocket.emit).not.toHaveBeenCalled();
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it("responde call: null si no hay ninguna", async () => {
      vi.mocked(CallService.getPendingCall).mockResolvedValue(null);

      const callback = vi.fn();
      await handlers[CALL_EVENTS.SYNC](undefined, callback);

      expect(callback).toHaveBeenCalledWith({ ok: true, call: null });
    });

    it("un fallo inesperado no expone su mensaje", async () => {
      vi.mocked(CallService.getPendingCall).mockRejectedValue(new Error('relation "calls" does not exist'));

      const callback = vi.fn();
      await handlers[CALL_EVENTS.SYNC]({}, callback);

      expect(callback).toHaveBeenCalledWith({ ok: false, error: "Error al consultar la llamada" });
    });
  });

  describe("caída del socket (disconnecting)", () => {
    const callId = "550e8400-e29b-41d4-a716-446655440000";

    async function initiateOutgoingCall() {
      vi.mocked(CallService.initiateCall).mockResolvedValue({
        call: { id: callId, callerId: "user-1", receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" } as any,
        isBusy: false,
      });
      await handlers[CALL_EVENTS.INITIATE](
        { conversationId: "550e8400-e29b-41d4-a716-446655440000", receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8" },
        vi.fn(),
      );
    }

    it("un socket que no lleva ninguna llamada no termina la de otra pestaña", async () => {
      await handlers["disconnecting"]();

      expect(CallService.getCallById).not.toHaveBeenCalled();
      expect(CallService.endCall).not.toHaveBeenCalled();
    });

    it("un receptor con la llamada sonando no la rechaza al caerse su socket", async () => {
      // Le suena (call:incoming), pero no la aceptó este socket: no la lleva.
      await handlers["disconnecting"]();

      expect(CallService.endCall).not.toHaveBeenCalled();
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it("el llamante que cierra la pestaña mientras suena cancela la llamada y avisa al receptor", async () => {
      const emit = vi.fn();
      mockIo.to.mockReturnValue({ emit });
      await initiateOutgoingCall();
      mockIo.to.mockClear();
      vi.mocked(CallService.getCallById).mockResolvedValue({ id: callId, status: "RINGING" } as any);
      const ended = { id: callId, callerId: "user-1", receiverId: "receiver-9", status: "MISSED" };
      vi.mocked(CallService.endCall).mockResolvedValue(ended as any);

      await handlers["disconnecting"]();

      expect(CallService.endCall).toHaveBeenCalledWith("user-1", callId);
      expect(mockIo.to).toHaveBeenCalledWith("user:receiver-9");
      expect(emit).toHaveBeenCalledWith(CALL_EVENTS.ENDED, { call: ended });
    });

    it("el receptor que aceptó en este socket termina la llamada al caerse y avisa al llamante", async () => {
      const emit = vi.fn();
      mockIo.to.mockReturnValue({ emit });
      vi.mocked(CallService.acceptCall).mockResolvedValue({
        id: callId,
        callerId: "caller-user",
        receiverId: "user-1",
        status: "ACCEPTED",
      } as any);
      await handlers[CALL_EVENTS.ACCEPT]({ callId }, vi.fn());
      mockIo.to.mockClear();
      vi.mocked(CallService.getCallById).mockResolvedValue({ id: callId, status: "ACCEPTED" } as any);
      const ended = { id: callId, callerId: "caller-user", receiverId: "user-1", status: "COMPLETED" };
      vi.mocked(CallService.endCall).mockResolvedValue(ended as any);

      await handlers["disconnecting"]();

      expect(CallService.endCall).toHaveBeenCalledWith("user-1", callId);
      expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
    });

    it("si la llamada ya terminó no la vuelve a cerrar ni avisa de nuevo", async () => {
      await initiateOutgoingCall();
      mockIo.to.mockClear();
      vi.mocked(CallService.getCallById).mockResolvedValue({ id: callId, status: "MISSED" } as any);

      await handlers["disconnecting"]();

      expect(CallService.endCall).not.toHaveBeenCalled();
      expect(mockIo.to).not.toHaveBeenCalled();
    });

    it("tras terminar la llamada por call:end el socket ya no la lleva", async () => {
      await initiateOutgoingCall();
      vi.mocked(CallService.endCall).mockResolvedValue({ id: callId, callerId: "user-1", receiverId: "r" } as any);
      await handlers[CALL_EVENTS.END]({ callId }, vi.fn());
      vi.mocked(CallService.endCall).mockClear();

      await handlers["disconnecting"]();

      expect(CallService.getCallById).not.toHaveBeenCalled();
      expect(CallService.endCall).not.toHaveBeenCalled();
    });
  });

  describe("notifyCallTimedOut", () => {
    it("avisa a los dos participantes como un rechazo con motivo timeout", () => {
      const emit = vi.fn();
      const io = { to: vi.fn(() => ({ emit })) };
      const call = { id: "call-1", callerId: "caller-user", receiverId: "receiver-user", status: "MISSED" } as any;

      notifyCallTimedOut(io as any, call);

      expect(io.to).toHaveBeenCalledWith("user:caller-user");
      expect(io.to).toHaveBeenCalledWith("user:receiver-user");
      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit).toHaveBeenCalledWith(CALL_EVENTS.REJECTED, { call, reason: "timeout" });
    });
  });

  it("retransmite call:signal solo al otro participante autorizado", async () => {
    const emitSpy = vi.fn();
    mockIo.to.mockReturnValue({ emit: emitSpy });
    // El destino lo decide el servidor: devuelve al otro participante de la llamada.
    vi.mocked(CallService.authorizeSignal).mockResolvedValue("6ba7b810-9dad-11d1-80b4-00c04fd430c8");

    await handlers[CALL_EVENTS.SIGNAL]({
      callId: "550e8400-e29b-41d4-a716-446655440000",
      targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      signal: { type: "offer", sdp: "abc" },
    });

    expect(CallService.authorizeSignal).toHaveBeenCalledWith(
      "user-1",
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    );
    expect(mockIo.to).toHaveBeenCalledWith("user:6ba7b810-9dad-11d1-80b4-00c04fd430c8");
    expect(emitSpy).toHaveBeenCalledWith(CALL_EVENTS.SIGNAL, {
      callId: "550e8400-e29b-41d4-a716-446655440000",
      senderUserId: "user-1",
      signal: { type: "offer", sdp: "abc" },
    });
  });

  it("descarta call:signal no autorizado sin emitir nada", async () => {
    vi.mocked(CallService.authorizeSignal).mockRejectedValue(new ForbiddenError("No participas en esta llamada"));

    await handlers[CALL_EVENTS.SIGNAL]({
      callId: "550e8400-e29b-41d4-a716-446655440000",
      targetUserId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      signal: { type: "offer", sdp: "abc" },
    });

    expect(mockIo.to).not.toHaveBeenCalled();
    // Sin eco al emisor: no se le da un oráculo para sondear llamadas ajenas.
    expect(mockSocket.emit).not.toHaveBeenCalled();
  });

  it("descarta call:signal con un payload inválido sin consultar la llamada", async () => {
    await handlers[CALL_EVENTS.SIGNAL]({ callId: "no-es-uuid", targetUserId: "x", signal: {} });

    expect(CallService.authorizeSignal).not.toHaveBeenCalled();
    expect(mockIo.to).not.toHaveBeenCalled();
  });

  it("call:error no expone el mensaje de un error inesperado", async () => {
    // Un error de Prisma trae el nombre de la tabla y de las columnas.
    vi.mocked(CallService.acceptCall).mockRejectedValue(
      new Error('Invalid `prisma.call.update()` invocation: column "answered_at" of relation "calls"'),
    );
    const callback = vi.fn();

    await handlers[CALL_EVENTS.ACCEPT]({ callId: "550e8400-e29b-41d4-a716-446655440000" }, callback);

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, { message: "Error al aceptar llamada" });
    expect(callback).toHaveBeenCalledWith({ ok: false, error: "Error al aceptar llamada" });
  });

  it("call:error conserva el mensaje de un AppError", async () => {
    vi.mocked(CallService.acceptCall).mockRejectedValue(new ForbiddenError("No tienes permiso para responder esta llamada"));
    const callback = vi.fn();

    await handlers[CALL_EVENTS.ACCEPT]({ callId: "550e8400-e29b-41d4-a716-446655440000" }, callback);

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, {
      message: "No tienes permiso para responder esta llamada",
    });
    expect(callback).toHaveBeenCalledWith({ ok: false, error: "No tienes permiso para responder esta llamada" });
  });

  it("call:error conserva el mensaje de validación del payload", async () => {
    const callback = vi.fn();

    await handlers[CALL_EVENTS.END]({ callId: "no-es-uuid" }, callback);

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, { message: "ID de llamada inválido" });
    expect(callback).toHaveBeenCalledWith({ ok: false, error: "ID de llamada inválido" });
  });

  it.each([
    [CALL_EVENTS.INITIATE, "Error al iniciar llamada", "initiateCall"],
    [CALL_EVENTS.REJECT, "Error al rechazar llamada", "rejectCall"],
    [CALL_EVENTS.END, "Error al finalizar llamada", "endCall"],
  ] as const)("%s usa un mensaje genérico ante un error inesperado", async (event, expected, method) => {
    vi.mocked((CallService as any)[method]).mockRejectedValue(new Error("connection to server at 10.0.0.5 refused"));
    const callback = vi.fn();

    await handlers[event](
      {
        callId: "550e8400-e29b-41d4-a716-446655440000",
        conversationId: "550e8400-e29b-41d4-a716-446655440000",
        receiverId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      },
      callback,
    );

    expect(mockSocket.emit).toHaveBeenCalledWith(CALL_EVENTS.ERROR, { message: expected });
    expect(callback).toHaveBeenCalledWith({ ok: false, error: expected });
  });

  it("maneja call:end notificando el fin a ambas partes", async () => {
    const mockCall = {
      id: "550e8400-e29b-41d4-a716-446655440000",
      callerId: "caller-user",
      receiverId: "user-1",
      status: "COMPLETED",
    };

    vi.mocked(CallService.endCall).mockResolvedValue(mockCall as any);

    const callback = vi.fn();
    await handlers[CALL_EVENTS.END]({ callId: "550e8400-e29b-41d4-a716-446655440000" }, callback);

    expect(mockIo.to).toHaveBeenCalledWith("user:caller-user");
    expect(mockIo.to).toHaveBeenCalledWith("user:user-1");
    expect(callback).toHaveBeenCalledWith({ ok: true, call: mockCall });
  });
});

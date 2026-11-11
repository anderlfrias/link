import { CallStatus, CallType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { CALL_RING_TIMEOUT_MS } from "./call.constants";
import * as AuditService from "../audit/audit.service";
import * as ConversationService from "../conversations/conversation.service";
import * as MessageService from "../messages/message.service";
import * as MobilePushService from "../push/mobile-push.service";
import * as PushService from "../push/push.service";
import * as CallRepository from "./call.repository";
import {
  acceptCall,
  authorizeSignal,
  endCall,
  expireRingingCall,
  formatDuration,
  getPendingCall,
  initiateCall,
  rejectCall,
  toCallResponse,
} from "./call.service";

const logSpy = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../../config/request-context", () => ({ getLogger: () => logSpy }));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
  WebPushError: class extends Error {},
}));
vi.mock("./call.repository");
vi.mock("../conversations/conversation.service");
vi.mock("../audit/audit.service");
vi.mock("../messages/message.service");
vi.mock("../push/push.service");
vi.mock("../push/mobile-push.service");

describe("call.service", () => {
  const callerId = "user-caller-1";
  const receiverId = "user-receiver-2";
  const conversationId = "conv-1";
  const callId = "call-123";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatDuration", () => {
    it("formatea correctamente segundos a mm:ss", () => {
      expect(formatDuration(0)).toBe("00:00");
      expect(formatDuration(9)).toBe("00:09");
      expect(formatDuration(65)).toBe("01:05");
      expect(formatDuration(360)).toBe("06:00");
    });
  });

  describe("toCallResponse", () => {
    it("convierte modelo de base de datos a respuesta serializable", () => {
      const now = new Date("2026-09-23T12:00:00.000Z");
      const res = toCallResponse({
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: now,
        answeredAt: null,
        endedAt: null,
        duration: 0,
        caller: { name: "Llamante" },
        receiver: { name: "Receptor" },
      });

      expect(res.id).toBe(callId);
      expect(res.callerName).toBe("Llamante");
      expect(res.receiverName).toBe("Receptor");
      expect(res.startedAt).toBe(now.toISOString());
      expect(res.answeredAt).toBeNull();
    });
  });

  describe("initiateCall", () => {
    it("inicia una llamada correctamente si ambos usuarios están disponibles", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValue(null);

      const mockCall = {
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: null,
        duration: 0,
        caller: { name: "Llamante" },
        receiver: { name: "Receptor" },
      };
      vi.mocked(CallRepository.createCall).mockResolvedValue(mockCall as any);

      const result = await initiateCall(callerId, {
        conversationId,
        receiverId,
        type: CallType.AUDIO,
      });

      expect(result.isBusy).toBe(false);
      expect(result.call?.id).toBe(callId);
      expect(CallRepository.createCall).toHaveBeenCalledWith({
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
      });
      expect(AuditService.record).toHaveBeenCalled();
      expect(PushService.notifyUsers).toHaveBeenCalledWith(
        [receiverId],
        expect.objectContaining({
          title: "Llamante",
          body: "Llamada de voz entrante",
          tag: `call-${callId}`,
          kind: "call",
          ringMs: CALL_RING_TIMEOUT_MS,
        }),
        // Sin TTL el push se guardaba 4 semanas y una llamada vieja aparecía horas después.
        { ttlSeconds: CALL_RING_TIMEOUT_MS / 1000, urgency: "high" },
      );
    });

    it("un fallo del push no impide iniciar la llamada", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);
      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValue(null);
      vi.mocked(CallRepository.createCall).mockResolvedValue({
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.VIDEO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
        caller: { name: "Llamante" },
      } as any);
      vi.mocked(PushService.notifyUsers).mockRejectedValue(new Error("push down"));

      const result = await initiateCall(callerId, { conversationId, receiverId, type: CallType.VIDEO });
      expect(result.isBusy).toBe(false);
      expect(PushService.notifyUsers).toHaveBeenCalledWith(
        [receiverId],
        expect.objectContaining({ body: "Videollamada entrante" }),
        expect.any(Object),
      );
      // App móvil: aviso genérico, durante lo que suena la llamada, y sin quién llama ni el tipo.
      expect(MobilePushService.notifyIncomingCall).toHaveBeenCalledWith(receiverId, conversationId, 45);
      expect(JSON.stringify(vi.mocked(MobilePushService.notifyIncomingCall).mock.calls)).not.toContain("Llamante");
    });

    it("lanza BadRequestError si el receptor no es miembro de la conversación", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }],
      } as any);

      await expect(
        initiateCall(callerId, {
          conversationId,
          receiverId,
          type: CallType.AUDIO,
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("lanza BadRequestError si el llamante ya tiene una llamada activa", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      vi.mocked(CallRepository.findActiveCallForUser).mockResolvedValueOnce({ id: "active-call" } as any);

      await expect(
        initiateCall(callerId, {
          conversationId,
          receiverId,
          type: CallType.AUDIO,
        }),
      ).rejects.toThrow(/Ya te encuentras en una llamada activa/);
    });

    it("retorna isBusy=true y crea mensaje de ocupado si el receptor está en llamada", async () => {
      vi.mocked(ConversationService.assertMembership).mockResolvedValue({
        id: conversationId,
        members: [{ userId: callerId }, { userId: receiverId }],
      } as any);

      // Caller libre
      vi.mocked(CallRepository.findActiveCallForUser)
        .mockResolvedValueOnce(null)
        // Receiver ocupado
        .mockResolvedValueOnce({ id: "call-other" } as any);

      vi.mocked(CallRepository.createCall).mockResolvedValue({ id: "busy-call-id" } as any);
      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: "busy-call-id",
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.BUSY,
        startedAt: new Date(),
        answeredAt: null,
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await initiateCall(callerId, {
        conversationId,
        receiverId,
        type: CallType.AUDIO,
      });

      expect(result.isBusy).toBe(true);
      expect(PushService.notifyUsers).not.toHaveBeenCalled();
      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.stringContaining("ocupado"),
      );
    });
  });

  describe("acceptCall", () => {
    it("permite al receptor aceptar la llamada", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.ACCEPTED,
        startedAt: new Date(),
        answeredAt: new Date(),
      } as any);

      const accepted = await acceptCall(receiverId, callId);
      expect(accepted.status).toBe(CallStatus.ACCEPTED);
      expect(CallRepository.updateCallStatus).toHaveBeenCalledWith(
        callId,
        CallStatus.ACCEPTED,
        expect.objectContaining({ answeredAt: expect.any(Date) }),
      );
    });

    it("lanza ForbiddenError si quien intenta aceptar no es el receptor", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
      } as any);

      await expect(acceptCall("impostor", callId)).rejects.toThrow(ForbiddenError);
    });

    it("lanza BadRequestError si la llamada no está en estado RINGING", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.COMPLETED,
      } as any);

      await expect(acceptCall(receiverId, callId)).rejects.toThrow(BadRequestError);
    });

    it("no acepta una llamada que sigue RINGING pero ya venció: el worker todavía no la pasó a perdida", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
        startedAt: new Date(Date.now() - CALL_RING_TIMEOUT_MS - 1_000),
      } as any);

      await expect(acceptCall(receiverId, callId)).rejects.toThrow(/ya no está disponible/);
      expect(CallRepository.updateCallStatus).not.toHaveBeenCalled();
    });

    it("sí acepta una llamada que lleva casi todo el timeout sonando", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        receiverId,
        status: CallStatus.RINGING,
        startedAt: new Date(Date.now() - CALL_RING_TIMEOUT_MS + 5_000),
      } as any);
      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        status: CallStatus.ACCEPTED,
        startedAt: new Date(),
      } as any);

      await expect(acceptCall(receiverId, callId)).resolves.toMatchObject({ status: CallStatus.ACCEPTED });
    });
  });

  describe("getPendingCall", () => {
    it("busca la llamada que suena desde hace menos del timeout y la devuelve serializada", async () => {
      const startedAt = new Date();
      vi.mocked(CallRepository.findRingingCallForUser).mockResolvedValue({
        id: callId,
        conversationId,
        callerId,
        receiverId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt,
        caller: { name: "Llamante" },
        receiver: { name: "Receptor" },
      } as any);

      const before = Date.now();
      const pending = await getPendingCall(receiverId);

      const [userId, since] = vi.mocked(CallRepository.findRingingCallForUser).mock.calls[0];
      expect(userId).toBe(receiverId);
      expect(since.getTime()).toBeGreaterThanOrEqual(before - CALL_RING_TIMEOUT_MS);
      expect(since.getTime()).toBeLessThanOrEqual(Date.now() - CALL_RING_TIMEOUT_MS);
      expect(pending).toMatchObject({ id: callId, callerName: "Llamante", startedAt: startedAt.toISOString() });
    });

    it("devuelve null si no hay ninguna llamada sonando", async () => {
      vi.mocked(CallRepository.findRingingCallForUser).mockResolvedValue(null);

      await expect(getPendingCall(receiverId)).resolves.toBeNull();
    });
  });

  describe("expireRingingCall", () => {
    const ringingCall = {
      id: callId,
      callerId,
      receiverId,
      conversationId,
      type: CallType.AUDIO,
      status: CallStatus.MISSED,
      startedAt: new Date(),
      endedAt: new Date(),
      duration: 0,
      caller: { name: "Llamante" },
      receiver: { name: "Receptor" },
    };

    it("pasa la llamada a perdida, deja el registro en el chat y audita sin actor", async () => {
      vi.mocked(CallRepository.markMissedIfRinging).mockResolvedValue(true);
      vi.mocked(CallRepository.findById).mockResolvedValue(ringingCall as any);

      const result = await expireRingingCall(callId);

      expect(CallRepository.markMissedIfRinging).toHaveBeenCalledWith(callId, expect.any(Date));
      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        "📞 Llamada de voz perdida",
      );
      const audit = vi.mocked(AuditService.record).mock.calls[0][0] as any;
      expect(audit).toMatchObject({
        targetId: callId,
        metadata: { callType: CallType.AUDIO, duration: 0, status: CallStatus.MISSED },
      });
      // La hizo el sistema, no una persona: sin `userId` (cae al del contexto, que en un worker es nulo).
      expect(audit).not.toHaveProperty("userId");
      expect(result).toMatchObject({ id: callId, status: CallStatus.MISSED });
    });

    it("una videollamada deja el registro de videollamada perdida", async () => {
      vi.mocked(CallRepository.markMissedIfRinging).mockResolvedValue(true);
      vi.mocked(CallRepository.findById).mockResolvedValue({ ...ringingCall, type: CallType.VIDEO } as any);

      await expireRingingCall(callId);

      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(callerId, conversationId, "📹 Videollamada perdida");
    });

    it("si alguien la atendió justo antes no la pisa, ni deja registro, ni audita", async () => {
      vi.mocked(CallRepository.markMissedIfRinging).mockResolvedValue(false);

      await expect(expireRingingCall(callId)).resolves.toBeNull();

      expect(CallRepository.findById).not.toHaveBeenCalled();
      expect(MessageService.sendCallRecordMessage).not.toHaveBeenCalled();
      expect(AuditService.record).not.toHaveBeenCalled();
    });
  });

  describe("rejectCall", () => {
    it("marca llamada como perdida si cancela el llamante antes de ser atendida", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.MISSED,
        startedAt: new Date(),
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await rejectCall(callerId, callId);
      expect(result.status).toBe(CallStatus.MISSED);
      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        "📞 Llamada de voz perdida",
      );
    });

    it("marca llamada como rechazada si cancela el receptor", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.VIDEO,
        status: CallStatus.RINGING,
        startedAt: new Date(),
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.VIDEO,
        status: CallStatus.REJECTED,
        startedAt: new Date(),
        endedAt: new Date(),
        duration: 0,
      } as any);

      const result = await rejectCall(receiverId, callId, "declined");
      expect(result.status).toBe(CallStatus.REJECTED);
      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        "📹 Videollamada rechazada",
      );
    });

    describe("con respuesta rápida", () => {
      function mockRinging(status: CallStatus) {
        vi.mocked(CallRepository.findById).mockResolvedValue({
          id: callId,
          callerId,
          receiverId,
          conversationId,
          type: CallType.AUDIO,
          status: CallStatus.RINGING,
          startedAt: new Date(),
        } as any);
        vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
          id: callId,
          callerId,
          receiverId,
          conversationId,
          type: CallType.AUDIO,
          status,
          startedAt: new Date(),
          endedAt: new Date(),
          duration: 0,
        } as any);
      }

      it("al rechazar el receptor, la respuesta sale como mensaje suyo después del registro de la llamada", async () => {
        mockRinging(CallStatus.REJECTED);

        await rejectCall(receiverId, callId, "declined", "No puedo hablar ahora.");

        expect(MessageService.sendMessage).toHaveBeenCalledWith(receiverId, conversationId, {
          content: "No puedo hablar ahora.",
        });
        const recordOrder = vi.mocked(MessageService.sendCallRecordMessage).mock.invocationCallOrder[0];
        const replyOrder = vi.mocked(MessageService.sendMessage).mock.invocationCallOrder[0];
        expect(replyOrder).toBeGreaterThan(recordOrder);
      });

      it("no manda nada sin respuesta o con una vacía", async () => {
        mockRinging(CallStatus.REJECTED);

        await rejectCall(receiverId, callId, "declined");
        await rejectCall(receiverId, callId, "declined", "");

        expect(MessageService.sendMessage).not.toHaveBeenCalled();
      });

      it("si cancela el llamante no se manda ninguna respuesta aunque venga una", async () => {
        mockRinging(CallStatus.MISSED);

        await rejectCall(callerId, callId, "declined", "texto");

        expect(MessageService.sendMessage).not.toHaveBeenCalled();
      });

      it("si rechaza por ocupado no se manda ninguna respuesta", async () => {
        mockRinging(CallStatus.BUSY);

        await rejectCall(receiverId, callId, "busy", "texto");

        expect(MessageService.sendMessage).not.toHaveBeenCalled();
      });

      it("si la llamada ya no suena no se manda la respuesta", async () => {
        vi.mocked(CallRepository.findById).mockResolvedValue({
          id: callId,
          callerId,
          receiverId,
          conversationId,
          type: CallType.AUDIO,
          status: CallStatus.MISSED,
        } as any);

        await rejectCall(receiverId, callId, "declined", "texto");

        expect(MessageService.sendMessage).not.toHaveBeenCalled();
      });

      it("un fallo al enviar la respuesta no deshace el rechazo y no deja el texto en el log", async () => {
        mockRinging(CallStatus.REJECTED);
        vi.mocked(MessageService.sendMessage).mockRejectedValue(
          new Error('Invalid `prisma.message.create()` invocation: content: "No puedo hablar ahora, estoy en una reunión"'),
        );

        const result = await rejectCall(receiverId, callId, "declined", "No puedo hablar ahora, estoy en una reunión");

        expect(result.status).toBe(CallStatus.REJECTED);
        expect(logSpy.warn).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(logSpy.warn.mock.calls)).not.toContain("reunión");
        expect(logSpy.warn).toHaveBeenCalledWith(
          { userId: receiverId, conversationId, reason: "unexpected error" },
          "could not send call decline reply",
        );
      });
    });
  });

  describe("authorizeSignal", () => {
    function mockCall(status: CallStatus) {
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status,
      } as any);
    }

    it("devuelve al receptor cuando señaliza el llamante", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal(callerId, callId, receiverId)).resolves.toBe(receiverId);
    });

    it("devuelve al llamante cuando señaliza el receptor", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal(receiverId, callId, callerId)).resolves.toBe(callerId);
    });

    it("admite señales mientras la llamada todavía suena (RINGING)", async () => {
      mockCall(CallStatus.RINGING);

      await expect(authorizeSignal(callerId, callId, receiverId)).resolves.toBe(receiverId);
    });

    it("rechaza si el emisor no participa de la llamada", async () => {
      mockCall(CallStatus.ACCEPTED);

      await expect(authorizeSignal("user-intruso", callId, receiverId)).rejects.toThrow(ForbiddenError);
    });

    it("rechaza si targetUserId no es el otro participante", async () => {
      mockCall(CallStatus.ACCEPTED);

      // Ni un tercero cualquiera ni el propio emisor son destinos válidos.
      await expect(authorizeSignal(callerId, callId, "user-tercero")).rejects.toThrow(ForbiddenError);
      await expect(authorizeSignal(callerId, callId, callerId)).rejects.toThrow(ForbiddenError);
    });

    it.each([CallStatus.COMPLETED, CallStatus.REJECTED, CallStatus.MISSED, CallStatus.BUSY])(
      "rechaza si la llamada ya terminó (%s)",
      async (status) => {
        mockCall(status);

        await expect(authorizeSignal(callerId, callId, receiverId)).rejects.toThrow(BadRequestError);
      },
    );

    it("NotFound si la llamada no existe", async () => {
      vi.mocked(CallRepository.findById).mockResolvedValue(null);

      await expect(authorizeSignal(callerId, callId, receiverId)).rejects.toThrow(NotFoundError);
    });
  });

  describe("endCall", () => {
    it("calcula duración y finaliza llamada activa", async () => {
      const started = new Date(Date.now() - 75000); // 75 segs atrás
      vi.mocked(CallRepository.findById).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.ACCEPTED,
        startedAt: started,
        answeredAt: started,
      } as any);

      vi.mocked(CallRepository.updateCallStatus).mockResolvedValue({
        id: callId,
        callerId,
        receiverId,
        conversationId,
        type: CallType.AUDIO,
        status: CallStatus.COMPLETED,
        startedAt: started,
        answeredAt: started,
        endedAt: new Date(),
        duration: 75,
      } as any);

      const res = await endCall(callerId, callId);
      expect(res.status).toBe(CallStatus.COMPLETED);
      expect(MessageService.sendCallRecordMessage).toHaveBeenCalledWith(
        callerId,
        conversationId,
        expect.stringMatching(/📞 Llamada de voz finalizada \(01:15\)/),
      );
      expect(AuditService.record).toHaveBeenCalled();
    });
  });
});

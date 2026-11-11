import { AuditAction, CallStatus, CallType } from "@prisma/client";
import { assertMembership } from "../conversations/conversation.service";
import * as ConversationRepository from "../conversations/conversation.repository";
import * as AuditService from "../audit/audit.service";
import * as MobilePushService from "../push/mobile-push.service";
import * as PushService from "../push/push.service";
import { getLogger } from "../../config/request-context";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors";
import { CALL_RING_TIMEOUT_MS } from "./call.constants";
import * as CallRepository from "./call.repository";
import { CallResponse, InitiateCallInput } from "./call.types";

async function sendCallChatMessage(senderId: string, conversationId: string, content: string) {
  // Import dinámico: evita el ciclo de módulos entre llamadas y mensajes.
  const { sendCallRecordMessage } = await import("../messages/message.service");
  await sendCallRecordMessage(senderId, conversationId, content);
}

/// La respuesta rápida con la que el receptor rechazó la llamada ("No puedo
/// hablar ahora...") sale como un mensaje normal suyo en la conversación, igual
/// que si lo hubiera escrito: lo ve el llamante, le llega por push si no está
/// conectado y respeta todas las reglas de un mensaje. Nunca tira: el rechazo ya
/// está hecho. Nunca se loguea el texto (LOGGING_PLAN.md §4.1).
async function sendDeclineReply(userId: string, conversationId: string, content: string): Promise<void> {
  try {
    const { sendMessage } = await import("../messages/message.service");
    await sendMessage(userId, conversationId, { content });
  } catch (error) {
    getLogger().warn(
      { userId, conversationId, reason: error instanceof AppError ? error.message : "unexpected error" },
      "could not send call decline reply",
    );
  }
}

function missedCallContent(type: CallType): string {
  return type === CallType.VIDEO ? "📹 Videollamada perdida" : "📞 Llamada de voz perdida";
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function toCallResponse(call: any): CallResponse {
  return {
    id: call.id,
    conversationId: call.conversationId,
    callerId: call.callerId,
    callerName: call.caller?.name,
    receiverId: call.receiverId,
    receiverName: call.receiver?.name,
    type: call.type,
    status: call.status,
    startedAt: call.startedAt instanceof Date ? call.startedAt.toISOString() : call.startedAt,
    answeredAt: call.answeredAt instanceof Date ? call.answeredAt.toISOString() : (call.answeredAt ?? null),
    endedAt: call.endedAt instanceof Date ? call.endedAt.toISOString() : (call.endedAt ?? null),
    duration: call.duration ?? 0,
  };
}

/// Web Push de la llamada entrante: llega aunque la pestaña esté en segundo plano o cerrada.
/// Nunca lanza ni se espera: un push caído no debe impedir que la llamada se inicie.
async function pushIncomingCall(call: any, type: CallType): Promise<void> {
  try {
    // App móvil: aviso genérico (ver push/mobile-push.service.ts).
    void MobilePushService.notifyIncomingCall(call.receiverId, call.conversationId, CALL_RING_TIMEOUT_MS / 1000);
    await PushService.notifyUsers(
      [call.receiverId],
      {
        title: call.caller?.name ?? "Llamada entrante",
        body: type === CallType.VIDEO ? "Videollamada entrante" : "Llamada de voz entrante",
        url: `/conversations/${call.conversationId}`,
        tag: `call-${call.id}`,
        kind: "call",
        ringMs: CALL_RING_TIMEOUT_MS,
      },
      // Una llamada vieja no sirve: sin TTL, el servicio push guardaba el aviso
      // hasta 4 semanas y un dispositivo sin conexión lo mostraba al volver, horas
      // después de que la llamada terminó. "high" para que llegue de inmediato.
      { ttlSeconds: CALL_RING_TIMEOUT_MS / 1000, urgency: "high" },
    );
  } catch {
    // ignorado a propósito (ver comentario de la función)
  }
}

export async function initiateCall(
  callerId: string,
  input: InitiateCallInput,
): Promise<{ call: CallResponse | null; isBusy: boolean }> {
  // 1. Validar membresía del llamante en la conversación
  const conversation = await assertMembership(input.conversationId, callerId);

  // 2. Verificar que el receptor pertenezca a la conversación
  const isReceiverMember = conversation.members.some((m) => m.userId === input.receiverId);
  if (!isReceiverMember) {
    throw new BadRequestError("El receptor no pertenece a esta conversación");
  }

  // 3. Verificar si el llamante ya está en una llamada activa
  const callerActiveCall = await CallRepository.findActiveCallForUser(callerId);
  if (callerActiveCall) {
    throw new BadRequestError("Ya te encuentras en una llamada activa");
  }

  // 4. Verificar si el receptor está ocupado en otra llamada
  const receiverActiveCall = await CallRepository.findActiveCallForUser(input.receiverId);
  if (receiverActiveCall) {
    // Registrar llamada ocupada
    const busyCall = await CallRepository.createCall({
      conversationId: input.conversationId,
      callerId,
      receiverId: input.receiverId,
      type: input.type,
    });
    const updated = await CallRepository.updateCallStatus(busyCall.id, CallStatus.BUSY, {
      endedAt: new Date(),
      duration: 0,
    });

    const content =
      input.type === CallType.VIDEO
        ? "📹 Videollamada no contestada (ocupado)"
        : "📞 Llamada de voz no contestada (ocupado)";
    await sendCallChatMessage(callerId, input.conversationId, content);

    return { call: toCallResponse(updated), isBusy: true };
  }

  // 5. Crear la llamada en estado RINGING
  const call = await CallRepository.createCall({
    conversationId: input.conversationId,
    callerId,
    receiverId: input.receiverId,
    type: input.type,
  });

  // 6. Auditoría
  void AuditService.record({
    action: AuditAction.START_CALL,
    userId: callerId,
    conversationId: input.conversationId,
    targetType: "call",
    targetId: call.id,
    metadata: {
      callType: input.type,
    },
  });

  void pushIncomingCall(call, input.type);

  return { call: toCallResponse(call), isBusy: false };
}

export async function acceptCall(userId: string, callId: string): Promise<CallResponse> {
  const call = await CallRepository.findById(callId);
  if (!call) {
    throw new NotFoundError("Llamada no encontrada");
  }

  if (call.receiverId !== userId) {
    throw new ForbiddenError("No tienes permiso para responder esta llamada");
  }

  if (call.status !== CallStatus.RINGING) {
    throw new BadRequestError("La llamada ya no está disponible");
  }

  // Sigue `RINGING` pero ya venció: el worker todavía no la pasó a perdida (corre
  // cada pocos segundos). Aceptarla dejaría a la persona hablando con nadie.
  if (Date.now() - call.startedAt.getTime() > CALL_RING_TIMEOUT_MS) {
    throw new BadRequestError("La llamada ya no está disponible");
  }

  const updated = await CallRepository.updateCallStatus(callId, CallStatus.ACCEPTED, {
    answeredAt: new Date(),
  });

  return toCallResponse(updated);
}

export async function rejectCall(
  userId: string,
  callId: string,
  reason: "declined" | "busy" = "declined",
  /// Respuesta rápida opcional ("No puedo hablar ahora..."): solo vale cuando el
  /// receptor rechaza de verdad (`declined`), no cuando cancela el llamante ni
  /// cuando la rechaza por ocupado.
  replyMessage?: string,
): Promise<CallResponse> {
  const call = await CallRepository.findById(callId);
  if (!call) {
    throw new NotFoundError("Llamada no encontrada");
  }

  if (call.receiverId !== userId && call.callerId !== userId) {
    throw new ForbiddenError("No tienes permiso sobre esta llamada");
  }

  if (call.status !== CallStatus.RINGING) {
    return toCallResponse(call);
  }

  const now = new Date();
  const isCancelledByCaller = userId === call.callerId;
  const status = isCancelledByCaller
    ? CallStatus.MISSED
    : reason === "busy"
      ? CallStatus.BUSY
      : CallStatus.REJECTED;

  const updated = await CallRepository.updateCallStatus(callId, status, {
    endedAt: now,
    duration: 0,
  });

  // Mensaje en el chat informando el estado
  let content = "";
  if (status === CallStatus.MISSED) {
    content = missedCallContent(call.type);
  } else if (status === CallStatus.BUSY) {
    content =
      call.type === CallType.VIDEO
        ? "📹 Videollamada no contestada (ocupado)"
        : "📞 Llamada de voz no contestada (ocupado)";
  } else {
    content =
      call.type === CallType.VIDEO ? "📹 Videollamada rechazada" : "📞 Llamada de voz rechazada";
  }

  await sendCallChatMessage(call.callerId, call.conversationId, content);

  void AuditService.record({
    action: AuditAction.END_CALL,
    userId,
    conversationId: call.conversationId,
    targetType: "call",
    targetId: call.id,
    metadata: {
      callType: call.type,
      duration: 0,
      status,
    },
  });

  // Después del registro de la llamada, para que en el chat quede primero
  // "Llamada rechazada" y debajo lo que el receptor quiso decir.
  if (status === CallStatus.REJECTED && replyMessage) {
    await sendDeclineReply(userId, call.conversationId, replyMessage);
  }

  return toCallResponse(updated);
}

/// La llamada que suena ahora mismo para el usuario (como llamante o receptor),
/// o `null`. Es lo que se le muestra al abrir la app o al recuperar la conexión:
/// los eventos de `call:incoming` solo llegan a quien está conectado en el
/// momento de llamar, y quien entra por la notificación llega tarde a eso.
export async function getPendingCall(userId: string): Promise<CallResponse | null> {
  const since = new Date(Date.now() - CALL_RING_TIMEOUT_MS);
  const call = await CallRepository.findRingingCallForUser(userId, since);
  return call ? toCallResponse(call) : null;
}

/// Da por no contestada una llamada que siguió sonando más allá del timeout.
/// Devuelve `null` si ya no estaba sonando (la aceptaron, la rechazaron o la
/// canceló el llamante un instante antes). El cambio de estado es condicional:
/// nunca pisa una llamada que alguien acaba de aceptar. No lleva `userId` en la
/// auditoría porque no la hizo nadie: es el sistema.
export async function expireRingingCall(callId: string): Promise<CallResponse | null> {
  const claimed = await CallRepository.markMissedIfRinging(callId, new Date());
  if (!claimed) return null;

  const call = await CallRepository.findById(callId);
  if (!call) return null;

  await sendCallChatMessage(call.callerId, call.conversationId, missedCallContent(call.type));

  void AuditService.record({
    action: AuditAction.END_CALL,
    conversationId: call.conversationId,
    targetType: "call",
    targetId: call.id,
    metadata: {
      callType: call.type,
      duration: 0,
      status: CallStatus.MISSED,
    },
  });

  return toCallResponse(call);
}

export async function endCall(userId: string, callId: string): Promise<CallResponse> {
  const call = await CallRepository.findById(callId);
  if (!call) {
    throw new NotFoundError("Llamada no encontrada");
  }

  if (call.receiverId !== userId && call.callerId !== userId) {
    throw new ForbiddenError("No tienes permiso sobre esta llamada");
  }

  if (
    call.status === CallStatus.COMPLETED ||
    call.status === CallStatus.REJECTED ||
    call.status === CallStatus.MISSED ||
    call.status === CallStatus.BUSY
  ) {
    return toCallResponse(call);
  }

  if (call.status === CallStatus.RINGING) {
    return rejectCall(userId, callId, "declined");
  }

  const now = new Date();
  const startTime = call.answeredAt ?? call.startedAt;
  const duration = Math.max(1, Math.round((now.getTime() - startTime.getTime()) / 1000));

  const updated = await CallRepository.updateCallStatus(callId, CallStatus.COMPLETED, {
    endedAt: now,
    duration,
  });

  const durationText = formatDuration(duration);
  const content =
    call.type === CallType.VIDEO
      ? `📹 Videollamada finalizada (${durationText})`
      : `📞 Llamada de voz finalizada (${durationText})`;

  await sendCallChatMessage(call.callerId, call.conversationId, content);

  void AuditService.record({
    action: AuditAction.END_CALL,
    userId,
    conversationId: call.conversationId,
    targetType: "call",
    targetId: call.id,
    metadata: {
      callType: call.type,
      duration,
      status: CallStatus.COMPLETED,
    },
  });

  return toCallResponse(updated);
}

/// Autoriza una señal WebRTC (offer, answer, candidato ICE) y devuelve a quién
/// reenviarla: siempre el otro participante de la llamada, nunca lo que diga el
/// cliente en `targetUserId`. Sin esto cualquier usuario autenticado podía
/// mandar payloads arbitrarios a todos los sockets de cualquier otro usuario.
/// Solo se admiten llamadas en curso: `ACCEPTED` es el estado normal (la oferta
/// la crea el llamante al aceptarse) y `RINGING` cubre las carreras.
export async function authorizeSignal(
  userId: string,
  callId: string,
  targetUserId: string,
): Promise<string> {
  const call = await CallRepository.findById(callId);
  if (!call) {
    throw new NotFoundError("Llamada no encontrada");
  }

  if (call.callerId !== userId && call.receiverId !== userId) {
    throw new ForbiddenError("No participas en esta llamada");
  }

  const peerId = call.callerId === userId ? call.receiverId : call.callerId;
  if (targetUserId !== peerId) {
    throw new ForbiddenError("Destino de señal inválido");
  }

  if (call.status !== CallStatus.RINGING && call.status !== CallStatus.ACCEPTED) {
    throw new BadRequestError("La llamada no está activa");
  }

  return peerId;
}

export async function getCallById(callId: string): Promise<CallResponse | null> {
  const call = await CallRepository.findById(callId);
  return call ? toCallResponse(call) : null;
}

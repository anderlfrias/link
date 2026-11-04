import { ValidationError } from "yup";
import { SOCKET_LIFECYCLE_EVENTS } from "../../socket/events";
import { withRequestContext } from "../../socket/request-context";
import { userRoomName } from "../../socket/rooms";
import { AppServer, AppSocket, AuthenticatedSocketUser } from "../../socket/types";
import { getLogger } from "../../config/request-context";
import { AppError } from "../../utils/errors";
import * as CallService from "./call.service";
import { CallResponse } from "./call.types";
import {
  acceptCallSchema,
  endCallSchema,
  initiateCallSchema,
  rejectCallSchema,
  signalSchema,
} from "./call.validator";

export const CALL_EVENTS = {
  INITIATE: "call:initiate",
  OUTGOING: "call:outgoing",
  INCOMING: "call:incoming",
  ACCEPT: "call:accept",
  ACCEPTED: "call:accepted",
  /// Le avisa a las demás sesiones del receptor que la llamada que les sonaba ya
  /// la contestó otra (pestaña o dispositivo): tienen que dejar de sonar sin
  /// colgar nada.
  ANSWERED_ELSEWHERE: "call:answered-elsewhere",
  REJECT: "call:reject",
  REJECTED: "call:rejected",
  BUSY: "call:busy",
  SIGNAL: "call:signal",
  END: "call:end",
  ENDED: "call:ended",
  /// Pregunta, con acknowledgement, por la llamada que suena ahora mismo para el
  /// usuario. `call:incoming` solo llega a quien está conectado en el momento de
  /// llamar; esto es lo que usa quien abre la app (o recupera la conexión) después.
  SYNC: "call:sync",
  ERROR: "call:error",
} as const;

/// Mensaje que se le devuelve al cliente cuando un handler falla. Solo los
/// errores pensados para mostrarse (`AppError`, validación de yup) conservan su
/// texto: cualquier otro (un error de Prisma trae tabla, columnas y constraint)
/// se reemplaza por `fallback`. El error completo sigue yendo al log.
function toClientMessage(err: unknown, fallback: string): string {
  if (err instanceof AppError || err instanceof ValidationError) {
    return err.message || fallback;
  }
  return fallback;
}

/// Una llamada la lleva UN socket: el que la inició (llamante) o el que la aceptó
/// (receptor). Es el único cuya caída termina la llamada: un usuario puede tener
/// varias pestañas, y cerrar o reconectar una que no participa no puede cortar
/// la llamada de otra. Tampoco una llamada que todavía suena y no aceptó nadie:
/// su receptor puede tener la app cerrada o varias sesiones, y la llamada sigue
/// disponible hasta que la contestan o vence.
function carryCall(socket: AppSocket, callId: string): void {
  socket.data.activeCallId = callId;
}

function releaseCall(socket: AppSocket, callId: string): void {
  if (socket.data.activeCallId === callId) {
    socket.data.activeCallId = undefined;
  }
}

/// Avisa a los dos participantes que una llamada sin respuesta venció. Va como
/// `call:rejected` (con `reason: "timeout"`) porque para los dos clientes es lo
/// mismo que un rechazo: la llamada terminó sin conectarse.
export function notifyCallTimedOut(io: AppServer, call: CallResponse): void {
  io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.REJECTED, { call, reason: "timeout" });
  io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.REJECTED, { call, reason: "timeout" });
}

export function registerCallSocket(socket: AppSocket, io: AppServer): void {
  const user = socket.data.user as AuthenticatedSocketUser | undefined;
  if (!user) return;
  const currentUserId = user.internalUserId;

  // 1. Iniciar llamada
  socket.on(
    CALL_EVENTS.INITIATE,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await initiateCallSchema.validate(rawPayload);
        const { call, isBusy } = await CallService.initiateCall(currentUserId, validated as any);

        if (isBusy) {
          socket.emit(CALL_EVENTS.BUSY, {
            call,
            receiverId: validated.receiverId,
            reason: "busy",
          });
          callback?.({ ok: false, isBusy: true });
          return;
        }

        if (call) {
          carryCall(socket, call.id);
          // Confirmar al emisor que la llamada está saliendo
          socket.emit(CALL_EVENTS.OUTGOING, { call });
          // Notificar al receptor que tiene llamada entrante
          io.to(userRoomName(validated.receiverId)).emit(CALL_EVENTS.INCOMING, { call });
          callback?.({ ok: true, call });
        }
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al iniciar llamada");
        const message = toClientMessage(err, "Error al iniciar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 2. Aceptar llamada
  socket.on(
    CALL_EVENTS.ACCEPT,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await acceptCallSchema.validate(rawPayload);
        const call = await CallService.acceptCall(currentUserId, validated.callId);
        carryCall(socket, call.id);

        // Al llamante, en todas sus pestañas: solo la que inició la llamada actúa.
        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.ACCEPTED, { call });
        // Al receptor, solo al socket que aceptó; a las demás sesiones suyas se les
        // avisa que la llamada ya la contestó otra.
        socket.emit(CALL_EVENTS.ACCEPTED, { call });
        socket.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.ANSWERED_ELSEWHERE, { callId: call.id });
        callback?.({ ok: true, call });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al aceptar llamada");
        const message = toClientMessage(err, "Error al aceptar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 3. Rechazar llamada
  socket.on(
    CALL_EVENTS.REJECT,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await rejectCallSchema.validate(rawPayload);
        const call = await CallService.rejectCall(
          currentUserId,
          validated.callId,
          (validated.reason as any) || "declined",
          validated.message,
        );
        releaseCall(socket, call.id);

        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.REJECTED, {
          call,
          reason: validated.reason,
        });
        io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.REJECTED, {
          call,
          reason: validated.reason,
        });
        callback?.({ ok: true, call });
      } catch (err: any) {
        // Sin el texto de la respuesta rápida: es contenido de un mensaje (LOGGING_PLAN.md §4.1).
        getLogger().warn({ err: err instanceof ValidationError ? err.message : err, userId: currentUserId }, "Error al rechazar llamada");
        const message = toClientMessage(err, "Error al rechazar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 4. Señalización WebRTC (Offer, Answer, ICE Candidate)
  socket.on(
    CALL_EVENTS.SIGNAL,
    withRequestContext(socket, async (rawPayload: unknown) => {
      try {
        const validated = await signalSchema.validate(rawPayload);
        // El destino lo decide el servidor (el otro participante de una llamada
        // en curso), no el cliente: ver `CallService.authorizeSignal`.
        const peerId = await CallService.authorizeSignal(
          currentUserId,
          validated.callId,
          validated.targetUserId,
        );
        io.to(userRoomName(peerId)).emit(CALL_EVENTS.SIGNAL, {
          callId: validated.callId,
          senderUserId: currentUserId,
          signal: validated.signal,
        });
      } catch (err) {
        // Se descarta en silencio, sin `call:error`: una señal rechazada no es algo
        // que el cliente deba poder usar para sondear llamadas. No se loguea `err`
        // completo: el ValidationError de yup lleva el payload, y una SDP/ICE
        // trae las IPs de los dos extremos (LOGGING_PLAN §4).
        getLogger().warn(
          { userId: currentUserId, reason: err instanceof Error ? err.message : "unknown" },
          "Señal WebRTC descartada",
        );
      }
    }),
  );

  // 5. Finalizar llamada
  socket.on(
    CALL_EVENTS.END,
    withRequestContext(socket, async (rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const validated = await endCallSchema.validate(rawPayload);
        const call = await CallService.endCall(currentUserId, validated.callId);
        releaseCall(socket, call.id);

        io.to(userRoomName(call.callerId)).emit(CALL_EVENTS.ENDED, { call });
        io.to(userRoomName(call.receiverId)).emit(CALL_EVENTS.ENDED, { call });
        callback?.({ ok: true, call });
      } catch (err: any) {
        getLogger().warn({ err, userId: currentUserId }, "Error al finalizar llamada");
        const message = toClientMessage(err, "Error al finalizar llamada");
        socket.emit(CALL_EVENTS.ERROR, { message });
        callback?.({ ok: false, error: message });
      }
    }),
  );

  // 6. La llamada que suena ahora mismo para este usuario (ver CALL_EVENTS.SYNC)
  socket.on(
    CALL_EVENTS.SYNC,
    withRequestContext(socket, async (_rawPayload: unknown, callback?: (res: unknown) => void) => {
      try {
        const call = await CallService.getPendingCall(currentUserId);
        callback?.({ ok: true, call });
      } catch (err) {
        getLogger().warn({ err, userId: currentUserId }, "Error al consultar la llamada pendiente");
        callback?.({ ok: false, error: toClientMessage(err, "Error al consultar la llamada") });
      }
    }),
  );

  // 7. Si cae el socket que llevaba una llamada (llamante que cierra la pestaña
  // mientras suena, o cualquiera de los dos en plena llamada). Solo ese socket:
  // ver `carryCall`.
  socket.on(
    SOCKET_LIFECYCLE_EVENTS.DISCONNECTING,
    withRequestContext(socket, async () => {
      const callId = socket.data.activeCallId as string | undefined;
      if (!callId) return;
      try {
        const current = await CallService.getCallById(callId);
        // Ya terminó (la rechazaron, venció, la cortó el otro): nada que cerrar ni avisar.
        if (!current || (current.status !== "RINGING" && current.status !== "ACCEPTED")) return;

        const ended = await CallService.endCall(currentUserId, callId);
        const targetUserId = ended.callerId === currentUserId ? ended.receiverId : ended.callerId;
        io.to(userRoomName(targetUserId)).emit(CALL_EVENTS.ENDED, { call: ended });
      } catch (err) {
        getLogger().warn({ err, userId: currentUserId }, "Error limpiando llamada tras desconexión");
      }
    }),
  );
}

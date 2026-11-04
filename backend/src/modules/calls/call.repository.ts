import { CallStatus, CallType } from "@prisma/client";
import { prisma } from "../../config/prisma";

const callUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarFileId: true,
  avatarFile: {
    select: {
      path: true,
    },
  },
};

export async function createCall(data: {
  conversationId: string;
  callerId: string;
  receiverId: string;
  type: CallType;
}) {
  return prisma.call.create({
    data: {
      conversationId: data.conversationId,
      callerId: data.callerId,
      receiverId: data.receiverId,
      type: data.type,
      status: CallStatus.RINGING,
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function findById(callId: string) {
  return prisma.call.findUnique({
    where: { id: callId },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function findActiveCallForUser(userId: string) {
  return prisma.call.findFirst({
    where: {
      OR: [{ callerId: userId }, { receiverId: userId }],
      status: {
        in: [CallStatus.RINGING, CallStatus.ACCEPTED],
      },
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

/// La llamada que todavía suena y en la que participa el usuario (como llamante
/// o como receptor), si empezó después de `since`. Es lo que se le vuelve a
/// mostrar a quien abre la app (o recupera la conexión) con una llamada sonando.
export async function findRingingCallForUser(userId: string, since: Date) {
  return prisma.call.findFirst({
    where: {
      OR: [{ callerId: userId }, { receiverId: userId }],
      status: CallStatus.RINGING,
      startedAt: { gte: since },
    },
    orderBy: { startedAt: "desc" },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

/// Ids de las llamadas que siguen `RINGING` y empezaron antes de `cutoff`: las
/// que ya tendrían que haber vencido.
export async function findRingingStartedBefore(cutoff: Date): Promise<string[]> {
  const calls = await prisma.call.findMany({
    where: { status: CallStatus.RINGING, startedAt: { lt: cutoff } },
    select: { id: true },
  });
  return calls.map((call) => call.id);
}

/// Pasa la llamada a `MISSED` solo si sigue `RINGING`, en una única sentencia:
/// si el receptor la aceptó justo antes, no pisa su estado. Devuelve `false` si
/// ya no estaba sonando.
export async function markMissedIfRinging(callId: string, endedAt: Date): Promise<boolean> {
  const { count } = await prisma.call.updateMany({
    where: { id: callId, status: CallStatus.RINGING },
    data: { status: CallStatus.MISSED, endedAt, duration: 0 },
  });
  return count > 0;
}

export async function updateCallStatus(
  callId: string,
  status: CallStatus,
  extra?: {
    answeredAt?: Date;
    endedAt?: Date;
    duration?: number;
  },
) {
  return prisma.call.update({
    where: { id: callId },
    data: {
      status,
      ...(extra?.answeredAt !== undefined && { answeredAt: extra.answeredAt }),
      ...(extra?.endedAt !== undefined && { endedAt: extra.endedAt }),
      ...(extra?.duration !== undefined && { duration: extra.duration }),
    },
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

export async function listCallsByConversation(conversationId: string, limit = 20) {
  return prisma.call.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      caller: { select: callUserSelect },
      receiver: { select: callUserSelect },
    },
  });
}

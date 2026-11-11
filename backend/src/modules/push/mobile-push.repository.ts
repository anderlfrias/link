import { UserStatus } from "@prisma/client";
import { prisma } from "../../config/prisma";

/// Dispositivos que puede tener una cuenta. Pasado el tope, se borran los más
/// viejos: es un límite contra el abuso, no uno que alguien alcance usando la app.
export const MAX_DEVICES_PER_USER = 10;

/// `token` identifica la instalación de la app, no a la persona. Si otra cuenta
/// inicia sesión en ese teléfono, la fila pasa a ella en vez de fallar por el
/// `@unique`: dejarla con la cuenta anterior mandaría los avisos de una persona
/// al teléfono de otra.
export async function upsertDevice(userId: string, token: string, platform: string) {
  const device = await prisma.mobilePushDevice.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  });

  const mine = await prisma.mobilePushDevice.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
    skip: MAX_DEVICES_PER_USER,
  });
  if (mine.length > 0) {
    await prisma.mobilePushDevice.deleteMany({ where: { id: { in: mine.map((row) => row.id) } } });
  }
  return device;
}

/// Baja pedida por la cuenta: solo borra un dispositivo que es suyo.
export function deleteDeviceForUser(token: string, userId: string) {
  return prisma.mobilePushDevice.deleteMany({ where: { token, userId } });
}

/// Sin filtrar por dueño: solo para limpiar tokens que Expo ya dio por inválidos.
export function deleteDevicesByTokens(tokens: string[]) {
  return prisma.mobilePushDevice.deleteMany({ where: { token: { in: tokens } } });
}

/// Todos los dispositivos de un usuario: al cerrar sus sesiones.
export function deleteByUserId(userId: string) {
  return prisma.mobilePushDevice.deleteMany({ where: { userId } });
}

/// Solo cuentas activas, con lo que hace falta para armar el aviso en su idioma y
/// con o sin sonido. No se lee nada del contenido de ningún mensaje.
export function findForUsers(userIds: string[]) {
  return prisma.mobilePushDevice.findMany({
    where: { userId: { in: userIds }, user: { status: UserStatus.ACTIVE } },
    select: {
      token: true,
      userId: true,
      user: { select: { language: true, notificationSoundEnabled: true } },
    },
  });
}

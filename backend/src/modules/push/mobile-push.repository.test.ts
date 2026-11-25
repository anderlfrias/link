import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../config/prisma";
import * as MobilePushRepository from "./mobile-push.repository";

vi.mock("../../config/prisma", () => ({
  prisma: {
    mobilePushDevice: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const db = prisma.mobilePushDevice;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.upsert).mockResolvedValue({ id: "d-1" } as any);
  vi.mocked(db.findMany).mockResolvedValue([]);
});

describe("upsertDevice", () => {
  it("usa el token como clave y reasigna el dispositivo a la cuenta que inicia sesión", async () => {
    await MobilePushRepository.upsertDevice("u-1", "ExponentPushToken[x]", "ios");

    expect(db.upsert).toHaveBeenCalledWith({
      where: { token: "ExponentPushToken[x]" },
      update: { userId: "u-1", platform: "ios" },
      create: { userId: "u-1", token: "ExponentPushToken[x]", platform: "ios" },
    });
  });

  it("no borra nada mientras la cuenta está dentro del tope de dispositivos", async () => {
    await MobilePushRepository.upsertDevice("u-1", "ExponentPushToken[x]", "ios");

    expect(db.findMany).toHaveBeenCalledWith({
      where: { userId: "u-1" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
      skip: MobilePushRepository.MAX_DEVICES_PER_USER,
    });
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("pasado el tope, borra los más viejos", async () => {
    vi.mocked(db.findMany).mockResolvedValue([{ id: "viejo-1" }, { id: "viejo-2" }] as any);

    await MobilePushRepository.upsertDevice("u-1", "ExponentPushToken[x]", "ios");

    expect(db.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["viejo-1", "viejo-2"] } } });
  });
});

describe("bajas", () => {
  it("una baja pedida por la cuenta solo borra un dispositivo suyo", async () => {
    await MobilePushRepository.deleteDeviceForUser("ExponentPushToken[x]", "u-1");

    expect(db.deleteMany).toHaveBeenCalledWith({ where: { token: "ExponentPushToken[x]", userId: "u-1" } });
  });

  it("borra por lista de tokens (los que Expo da por inválidos)", async () => {
    await MobilePushRepository.deleteDevicesByTokens(["a", "b"]);

    expect(db.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["a", "b"] } } });
  });

  it("borra todos los dispositivos de una cuenta", async () => {
    await MobilePushRepository.deleteByUserId("u-1");

    expect(db.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });
});

describe("findForUsers", () => {
  it("solo cuentas activas, y solo lo necesario para armar el aviso", async () => {
    await MobilePushRepository.findForUsers(["u-1", "u-2"]);

    expect(db.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u-1", "u-2"] }, user: { status: "ACTIVE" } },
      select: {
        token: true,
        userId: true,
        user: { select: { language: true, notificationSoundEnabled: true } },
      },
    });
  });
});

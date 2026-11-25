import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import env from "../../config/env";
import * as MobilePushRepository from "./mobile-push.repository";
import { EXPO_PUSH_URL, notifyIncomingCall, notifyNewMessage, registerDevice, unregisterDevice } from "./mobile-push.service";

vi.mock("./mobile-push.repository", () => ({
  upsertDevice: vi.fn(),
  deleteDeviceForUser: vi.fn(),
  deleteDevicesByTokens: vi.fn(),
  findForUsers: vi.fn(),
}));

const TOKEN = "ExponentPushToken[abcdefghijklmnopqrstuv]";
const fetchMock = vi.fn();

function device(token: string, language = "es", sound = true, userId = "u-2") {
  return { token, userId, user: { language, notificationSoundEnabled: sound } };
}

function expoOk(...statuses: Array<"ok" | "DeviceNotRegistered" | "Other">) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: statuses.map((status) =>
        status === "ok" ? { status: "ok", id: "t" } : { status: "error", details: { error: status } },
      ),
    }),
  };
}

const original = env.MOBILE_PUSH_ENABLED;

beforeEach(() => {
  vi.clearAllMocks();
  env.MOBILE_PUSH_ENABLED = true;
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(MobilePushRepository.deleteDevicesByTokens).mockResolvedValue({ count: 1 } as any);
});

afterEach(() => {
  env.MOBILE_PUSH_ENABLED = original;
  vi.unstubAllGlobals();
});

describe("registerDevice", () => {
  it("guarda el dispositivo de la cuenta", async () => {
    await registerDevice("u-1", TOKEN, "android");

    expect(MobilePushRepository.upsertDevice).toHaveBeenCalledWith("u-1", TOKEN, "android");
  });

  it("con las notificaciones móviles apagadas responde 404 con su código y no guarda nada", async () => {
    env.MOBILE_PUSH_ENABLED = false;

    await expect(registerDevice("u-1", TOKEN, "ios")).rejects.toMatchObject({
      statusCode: 404,
      code: "mobile_push_disabled",
    });
    expect(MobilePushRepository.upsertDevice).not.toHaveBeenCalled();
  });
});

describe("unregisterDevice", () => {
  it("da de baja solo un dispositivo de la propia cuenta", async () => {
    await unregisterDevice("u-1", TOKEN);

    expect(MobilePushRepository.deleteDeviceForUser).toHaveBeenCalledWith(TOKEN, "u-1");
  });

  it("sigue funcionando con las notificaciones apagadas (para limpiar lo que quedó)", async () => {
    env.MOBILE_PUSH_ENABLED = false;

    await expect(unregisterDevice("u-1", TOKEN)).resolves.toBeUndefined();
  });
});

describe("notifyNewMessage", () => {
  it("manda a Expo un aviso GENÉRICO, con el id de la conversación y sin texto ni nombres", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);
    fetchMock.mockResolvedValue(expoOk("ok"));

    await notifyNewMessage(["u-2"], "conv-1");

    expect(MobilePushRepository.findForUsers).toHaveBeenCalledWith(["u-2"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EXPO_PUSH_URL);
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    expect(init.method).toBe("POST");
    const sent = JSON.parse(init.body);
    expect(sent).toEqual([
      {
        to: TOKEN,
        title: "LINK",
        body: "Tienes un mensaje nuevo",
        data: { type: "message", conversationId: "conv-1" },
        sound: "default",
        priority: "high",
        ttl: 3600,
        channelId: "messages",
      },
    ]);
  });

  it("el aviso sale en el idioma de cada cuenta y respeta su preferencia de sonido", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([
      device("ExponentPushToken[aaaaaaaaaaaa]", "en", false),
      device("ExponentPushToken[bbbbbbbbbbbb]", "fr", true),
    ] as any);
    fetchMock.mockResolvedValue(expoOk("ok", "ok"));

    await notifyNewMessage(["u-2", "u-3"], "conv-1");

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent[0]).toMatchObject({ body: "You have a new message", sound: null });
    // Un idioma que no existe cae al español.
    expect(sent[1]).toMatchObject({ body: "Tienes un mensaje nuevo", sound: "default" });
  });

  it("nunca incluye contenido de mensajes ni tokens en lo que se loguea", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    await notifyNewMessage(["u-2"], "conv-1");

    // Rechazo de Expo: no se rompe y no se borra nada.
    expect(MobilePushRepository.deleteDevicesByTokens).not.toHaveBeenCalled();
  });

  it("parte los envíos en lotes de 100", async () => {
    const devices = Array.from({ length: 250 }, (_, i) => device(`ExponentPushToken[token${String(i).padStart(6, "0")}]`));
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue(devices as any);
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => ({
      ok: true,
      status: 200,
      json: async () => ({ data: JSON.parse(init.body).map(() => ({ status: "ok" })) }),
    }));

    await notifyNewMessage(["u-2"], "conv-1");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).length)).toEqual([100, 100, 50]);
  });

  it("borra los tokens que Expo dice que ya no existen (DeviceNotRegistered), y solo esos", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([
      device("ExponentPushToken[viejo000000]"),
      device("ExponentPushToken[bueno000000]"),
      device("ExponentPushToken[otroerror00]"),
    ] as any);
    fetchMock.mockResolvedValue(expoOk("DeviceNotRegistered", "ok", "Other"));

    await notifyNewMessage(["u-2"], "conv-1");

    expect(MobilePushRepository.deleteDevicesByTokens).toHaveBeenCalledWith(["ExponentPushToken[viejo000000]"]);
  });

  it("sin dispositivos no llama a Expo", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([]);

    await notifyNewMessage(["u-2"], "conv-1");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sin destinatarios, o con las notificaciones apagadas, ni siquiera consulta la base", async () => {
    await notifyNewMessage([], "conv-1");
    env.MOBILE_PUSH_ENABLED = false;
    await notifyNewMessage(["u-2"], "conv-1");

    expect(MobilePushRepository.findForUsers).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("nunca lanza: un Expo caído, un error de red o una respuesta rara no tumban el envío", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);

    fetchMock.mockRejectedValueOnce(new Error("network"));
    await expect(notifyNewMessage(["u-2"], "conv-1")).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: "no es una lista" }) });
    await expect(notifyNewMessage(["u-2"], "conv-1")).resolves.toBeUndefined();

    vi.mocked(MobilePushRepository.findForUsers).mockRejectedValueOnce(new Error("db"));
    await expect(notifyNewMessage(["u-2"], "conv-1")).resolves.toBeUndefined();
  });

  it("si la limpieza de tokens falla, no lanza", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);
    fetchMock.mockResolvedValue(expoOk("DeviceNotRegistered"));
    vi.mocked(MobilePushRepository.deleteDevicesByTokens).mockRejectedValue(new Error("db"));

    await expect(notifyNewMessage(["u-2"], "conv-1")).resolves.toBeUndefined();
  });

  it("corta el pedido a Expo con un tiempo máximo", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);
    fetchMock.mockResolvedValue(expoOk("ok"));

    await notifyNewMessage(["u-2"], "conv-1");

    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("notifyIncomingCall", () => {
  it("avisa de una llamada con un texto genérico, en el canal de llamadas y solo mientras suena", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN)] as any);
    fetchMock.mockResolvedValue(expoOk("ok"));

    await notifyIncomingCall("u-2", "conv-1", 45);

    expect(MobilePushRepository.findForUsers).toHaveBeenCalledWith(["u-2"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual([
      {
        to: TOKEN,
        title: "LINK",
        body: "Tienes una llamada entrante",
        data: { type: "call", conversationId: "conv-1" },
        sound: "default",
        priority: "high",
        ttl: 45,
        channelId: "calls",
      },
    ]);
  });

  it("sale en el idioma de la cuenta y respeta el sonido", async () => {
    vi.mocked(MobilePushRepository.findForUsers).mockResolvedValue([device(TOKEN, "en", false)] as any);
    fetchMock.mockResolvedValue(expoOk("ok"));

    await notifyIncomingCall("u-2", "conv-1", 45);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)[0]).toMatchObject({ body: "You have an incoming call", sound: null });
  });

  it("con las notificaciones móviles apagadas no manda nada, y nunca lanza", async () => {
    env.MOBILE_PUSH_ENABLED = false;
    await expect(notifyIncomingCall("u-2", "conv-1", 45)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    env.MOBILE_PUSH_ENABLED = true;
    vi.mocked(MobilePushRepository.findForUsers).mockRejectedValue(new Error("db"));
    await expect(notifyIncomingCall("u-2", "conv-1", 45)).resolves.toBeUndefined();
  });
});

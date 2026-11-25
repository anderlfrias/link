import { describe, expect, it } from "vitest";
import { isValidExpoToken } from "./mobile-push-token";
import { registerDeviceSchema, unregisterDeviceSchema } from "./push.validator";

describe("isValidExpoToken", () => {
  it.each(["ExponentPushToken[abcdefghijklmnopqrstuv]", "ExpoPushToken[ab-cd_ef123456]"])("acepta %s", (token) => {
    expect(isValidExpoToken(token)).toBe(true);
  });

  it.each([
    "",
    "ExponentPushToken[]",
    "ExponentPushToken[corto]",
    "ExponentPushToken[con espacios aqui]",
    "ExponentPushToken[abcdefghijkl]x",
    "xExponentPushToken[abcdefghijkl]",
    "https://exp.host/--/api/v2/push/send",
    "ExponentPushToken[" + "a".repeat(121) + "]",
    "FcmToken[abcdefghijkl]",
  ])("rechaza %s", (token) => {
    expect(isValidExpoToken(token)).toBe(false);
  });
});

describe("registerDeviceSchema", () => {
  const valid = { token: "ExponentPushToken[abcdefghijklmnop]", platform: "android" };

  it("acepta un token de Expo y una plataforma conocida", async () => {
    await expect(registerDeviceSchema.validate(valid)).resolves.toEqual(valid);
    await expect(registerDeviceSchema.validate({ ...valid, platform: "ios" })).resolves.toBeTruthy();
  });

  it.each([
    [{ platform: "android" }],
    [{ token: "no-es-expo", platform: "android" }],
    [{ token: "ExponentPushToken[abcdefghijklmnop]" }],
    [{ token: "ExponentPushToken[abcdefghijklmnop]", platform: "windows" }],
    [{ token: "ExponentPushToken[" + "a".repeat(200) + "]", platform: "ios" }],
  ])("rechaza %j", async (body) => {
    await expect(registerDeviceSchema.validate(body)).rejects.toThrow();
  });
});

describe("unregisterDeviceSchema", () => {
  it("pide el token, con un largo acotado", async () => {
    await expect(unregisterDeviceSchema.validate({ token: "ExponentPushToken[abcdefghijklmnop]" })).resolves.toBeTruthy();
    await expect(unregisterDeviceSchema.validate({})).rejects.toThrow();
    await expect(unregisterDeviceSchema.validate({ token: "x".repeat(201) })).rejects.toThrow();
  });
});

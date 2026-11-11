import * as yup from "yup";
import { PUSH_ENDPOINT_MAX_LENGTH } from "./push-endpoint";
import { isValidExpoToken } from "./mobile-push-token";

/// Solo la forma y el tamaño del body. Que el endpoint sea de un servicio push
/// admitido lo decide `PushService.subscribe` (`isAllowedPushEndpoint`).
/// Los topes de las claves sobran para una clave P-256 (`p256dh`, 87
/// caracteres en base64url) y un secreto de 16 bytes (`auth`, 22).
export const subscribeSchema = yup.object({
  endpoint: yup.string().required("endpoint is required").max(PUSH_ENDPOINT_MAX_LENGTH),
  keys: yup
    .object({
      p256dh: yup.string().required("keys.p256dh is required").max(200),
      auth: yup.string().required("keys.auth is required").max(100),
    })
    .required("keys is required"),
});

export const unsubscribeSchema = yup.object({
  endpoint: yup.string().required("endpoint is required").max(PUSH_ENDPOINT_MAX_LENGTH),
});

/// Alta de un dispositivo móvil. La forma del token se valida acá; que Expo lo acepte,
/// al enviar.
export const registerDeviceSchema = yup.object({
  token: yup
    .string()
    .required("token is required")
    .max(200)
    .test("expo-token", "token must be an Expo push token", (value) => value !== undefined && isValidExpoToken(value)),
  platform: yup.string().oneOf(["ios", "android"]).required("platform is required"),
});

export const unregisterDeviceSchema = yup.object({
  token: yup.string().required("token is required").max(200),
});

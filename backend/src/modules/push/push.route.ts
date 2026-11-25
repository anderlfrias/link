import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { pushDeviceRateLimiter } from "../../middlewares/rate-limit.middleware";
import { validateBody } from "../../middlewares/validate.middleware";
import * as PushController from "./push.controller";
import { registerDeviceSchema, subscribeSchema, unregisterDeviceSchema, unsubscribeSchema } from "./push.validator";

const router = Router();

router.use(authenticate, attachInternalUser);

// Pública para cualquier usuario logueado (no es un secreto, ver RFC 8292) —
// el frontend la necesita para `pushManager.subscribe()`.
router.get("/vapid-public-key", PushController.getPublicKey);
router.post("/subscribe", validateBody(subscribeSchema), PushController.subscribe);
router.post("/unsubscribe", validateBody(unsubscribeSchema), PushController.unsubscribe);

// Dispositivos móviles (servicio push de Expo). A diferencia de Web Push, el aviso que
// se manda es genérico (ver mobile-push.service.ts).
router.post("/devices", pushDeviceRateLimiter, validateBody(registerDeviceSchema), PushController.registerDevice);
router.delete("/devices", pushDeviceRateLimiter, validateBody(unregisterDeviceSchema), PushController.unregisterDevice);

export default router;

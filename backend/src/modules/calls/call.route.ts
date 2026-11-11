import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware";
import { attachInternalUser } from "../../middlewares/current-user.middleware";
import { iceServersRateLimiter } from "../../middlewares/rate-limit.middleware";
import { getIceServers } from "./ice.service";

/// Lo único HTTP del módulo de llamadas (el resto es por socket, ver README.md).
const router = Router();

router.use(authenticate, attachInternalUser);

/// `GET /v1/calls/ice-servers`: los servidores STUN/TURN con los que armar una llamada. Lleva
/// credenciales TURN, así que exige sesión y nunca se cachea.
router.get("/ice-servers", iceServersRateLimiter, (req, res) => {
  res.set("Cache-Control", "no-store").json(getIceServers(req.user!.internalUserId!));
});

export default router;

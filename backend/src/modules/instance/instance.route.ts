import { Router } from "express";
import { instanceInfoRateLimiter } from "../../middlewares/rate-limit.middleware";
import { getInstanceInfo } from "./instance.service";

/// `GET /v1/instance`: identifica a esta instalación ante una app que todavía no
/// tiene sesión (ver README.md de este módulo). Es público y no toca la base.
const router = Router();

router.get("/", instanceInfoRateLimiter, (_req, res) => {
  // Sin caché: si una actualización cambia `mobileApi`, la app tiene que verlo ya.
  res.set("Cache-Control", "no-store").json(getInstanceInfo());
});

export default router;

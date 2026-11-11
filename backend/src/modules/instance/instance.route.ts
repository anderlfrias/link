import { Router } from "express";
import { instanceInfoRateLimiter } from "../../middlewares/rate-limit.middleware";
import { getInstanceInfo } from "./instance.service";

/// `GET /v1/instance`: identifica a esta instalación ante una app que todavía no
/// tiene sesión (ver README.md de este módulo). Es público; sus datos salen de la caché de
/// ajustes, no de una consulta por pedido.
const router = Router();

router.get("/", instanceInfoRateLimiter, async (_req, res, next) => {
  try {
    // Sin caché: si cambia `mobileApi` o un admin cambia el nombre o apaga la app, se ve ya.
    res.set("Cache-Control", "no-store").json(await getInstanceInfo());
  } catch (error) {
    next(error);
  }
});

export default router;

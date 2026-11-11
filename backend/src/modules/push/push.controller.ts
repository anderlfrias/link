import { NextFunction, Request, Response } from "express";
import * as MobilePushService from "./mobile-push.service";
import * as PushService from "./push.service";

function currentUserId(req: Request): string {
  return req.user!.internalUserId!;
}

export function getPublicKey(_req: Request, res: Response) {
  res.json({ publicKey: PushService.getPublicKey() });
}

export async function subscribe(req: Request, res: Response, next: NextFunction) {
  try {
    // El body ya pasó por `subscribeSchema` (push.route.ts).
    const { endpoint, keys } = req.body;
    await PushService.subscribe(currentUserId(req), { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function unsubscribe(req: Request, res: Response, next: NextFunction) {
  try {
    // El body ya pasó por `unsubscribeSchema` (push.route.ts).
    await PushService.unsubscribe(currentUserId(req), req.body.endpoint);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function registerDevice(req: Request, res: Response, next: NextFunction) {
  try {
    // El body ya pasó por `registerDeviceSchema` (push.route.ts).
    await MobilePushService.registerDevice(currentUserId(req), req.body.token, req.body.platform);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function unregisterDevice(req: Request, res: Response, next: NextFunction) {
  try {
    await MobilePushService.unregisterDevice(currentUserId(req), req.body.token);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

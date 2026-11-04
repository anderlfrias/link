import { getLogger } from "../config/request-context";
import { CALL_RING_TIMEOUT_MS } from "../modules/calls/call.constants";
import * as CallRepository from "../modules/calls/call.repository";
import * as CallService from "../modules/calls/call.service";
import { notifyCallTimedOut } from "../modules/calls/call.socket";
import { getIO, isSocketReady } from "../socket";
import { runWorkerTick } from "./worker-context";

/// Cada cuánto se buscan llamadas vencidas. Define también cuánto puede pasar
/// de más una llamada sonando (hasta este intervalo después del timeout).
const SWEEP_INTERVAL_MS = 5_000;

/// Da por no contestadas las llamadas que siguen sonando más allá de
/// `CALL_RING_TIMEOUT_MS`: pasan a perdidas, queda el registro en el chat y se
/// avisa a los dos lados. Un worker y no un timer por llamada porque así también
/// libera las que quedaron huérfanas tras un reinicio del servidor (sin esto
/// quedaban sonando para siempre y dejaban a los dos "ocupados").
async function runRingTimeoutSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - CALL_RING_TIMEOUT_MS);
  const callIds = await CallRepository.findRingingStartedBefore(cutoff);

  let expired = 0;
  for (const callId of callIds) {
    // Una por una y sin cortar la pasada si una falla: el resto igual tiene que vencer.
    try {
      const call = await CallService.expireRingingCall(callId);
      if (!call) continue;
      expired += 1;
      if (isSocketReady()) notifyCallTimedOut(getIO(), call);
    } catch (error) {
      getLogger().error({ err: error, callId }, "could not expire ringing call");
    }
  }

  if (expired > 0) {
    getLogger().info({ expiredCount: expired }, "ringing calls expired");
  }
}

/// Mismo criterio que los demás workers: un solo proceso Node y un
/// `setInterval`, sin infraestructura de colas (ver message-retention.worker.ts).
export function startCallRingTimeoutWorker(): void {
  void runWorkerTick("call-ring-timeout", runRingTimeoutSweep);
  setInterval(() => {
    void runWorkerTick("call-ring-timeout", runRingTimeoutSweep);
  }, SWEEP_INTERVAL_MS);
}

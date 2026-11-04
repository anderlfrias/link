"use client";

import React, { useEffect } from "react";
import { IconPhone, IconX } from "@tabler/icons-react";
import { useTranslation } from "@/i18n";
import { CALL_OUTCOME_DISMISS_MS } from "../constants/call.constants";
import { useCall } from "../hooks/use-call";

const OUTCOME_KEYS = {
  "no-answer": "calls.outcomeNoAnswer",
  declined: "calls.outcomeDeclined",
  busy: "calls.outcomeBusy",
} as const;

/** Qué pasó con la llamada que hice y no se conectó (nadie contestó, la rechazaron o estaba ocupado),
 * con un toque para volver a llamar. El receptor no lo necesita: le queda el registro en el chat. */
export function CallOutcomeToast() {
  const { t } = useTranslation();
  const { callOutcome, dismissCallOutcome, callState, startCall } = useCall();

  useEffect(() => {
    if (!callOutcome) return;
    const timer = setTimeout(dismissCallOutcome, CALL_OUTCOME_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [callOutcome, dismissCallOutcome]);

  if (!callOutcome) return null;

  const name = callOutcome.receiverName || "Contacto";
  // Solo se puede volver a llamar con la línea libre: `startCall` ignora el pedido si hay otra llamada.
  const canCallAgain = callState === "idle";

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-xl bg-neutral-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-neutral-800"
    >
      <span className="min-w-0 flex-1 truncate">{t(OUTCOME_KEYS[callOutcome.kind], { name })}</span>
      {canCallAgain && (
        <button
          type="button"
          onClick={() => {
            dismissCallOutcome();
            void startCall(callOutcome.conversationId, callOutcome.receiverId, callOutcome.receiverName, callOutcome.type);
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 font-semibold transition-colors hover:bg-white/25"
        >
          <IconPhone size={14} stroke={2} />
          {t("calls.callAgain")}
        </button>
      )}
      <button
        type="button"
        onClick={dismissCallOutcome}
        aria-label={t("calls.dismissOutcome")}
        className="shrink-0 text-neutral-300 hover:text-white"
      >
        <IconX size={16} stroke={2} />
      </button>
    </div>
  );
}

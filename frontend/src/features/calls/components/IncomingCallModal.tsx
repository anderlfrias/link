"use client";

import React, { useState } from "react";
import { IconArrowLeft, IconMessage, IconPhone, IconPhoneOff, IconSend, IconVideo } from "@tabler/icons-react";
import { Avatar } from "@/components/ui/Avatar";
import { useTranslation } from "@/i18n";
import { CALL_REPLY_MAX_LENGTH } from "../constants/call.constants";
import { useCall } from "../hooks/use-call";

/** Las respuestas rápidas de siempre al rechazar una llamada (las cuatro de Android; en iOS son
 * parecidas). Salen como un mensaje normal del receptor en la conversación. */
const QUICK_REPLY_KEYS = [
  "calls.quickReplyCantTalkWhatsUp",
  "calls.quickReplyCallBackRightAway",
  "calls.quickReplyCallLater",
  "calls.quickReplyCantTalkCallMeLater",
] as const;

export function IncomingCallModal() {
  const { callState, activeCall } = useCall();

  if (callState !== "incoming" || !activeCall) {
    return null;
  }

  // Con la llamada como `key`, el estado de la hoja de respuestas arranca limpio con cada llamada.
  return <IncomingCallDialog key={activeCall.id} />;
}

function IncomingCallDialog() {
  const { t } = useTranslation();
  const { activeCall, acceptCall, rejectCall } = useCall();
  const [showReplies, setShowReplies] = useState(false);
  const [customReply, setCustomReply] = useState("");

  if (!activeCall) return null;

  const isVideo = activeCall.type === "VIDEO";
  const callerName = activeCall.callerName || "Usuario";
  const canSendCustomReply = customReply.trim().length > 0;

  const sendReply = (text: string) => {
    void rejectCall("declined", text);
  };

  return (
    <div
      role="dialog"
      aria-label={t("calls.incomingCall")}
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl dark:bg-neutral-900 border border-black/10 dark:border-white/10">
        {/* Avatar y animación de timbrado */}
        <div className="relative mx-auto mb-4 flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-brand-blue/20 dark:bg-brand-blue/30" />
          <div className="relative">
            <Avatar name={callerName} size="xl" />
          </div>
        </div>

        {/* Nombre y tipo de llamada */}
        <h2 className="text-xl font-bold text-brand-ink dark:text-white truncate">
          {callerName}
        </h2>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          {isVideo ? (
            <>
              <IconVideo size={18} className="text-brand-blue" />
              <span>{t("calls.incomingVideoCallSubtitle")}</span>
            </>
          ) : (
            <>
              <IconPhone size={18} className="text-brand-blue" />
              <span>{t("calls.incomingAudioCallSubtitle")}</span>
            </>
          )}
        </p>

        {showReplies ? (
          <div className="mt-6 flex flex-col gap-2 text-left">
            <p className="text-center text-sm font-medium text-brand-ink dark:text-white">
              {t("calls.quickRepliesTitle")}
            </p>
            {QUICK_REPLY_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => sendReply(t(key))}
                className="rounded-xl border border-black/10 px-4 py-2.5 text-sm text-brand-ink transition-colors hover:bg-black/5 dark:border-white/10 dark:text-white dark:hover:bg-white/10"
              >
                {t(key)}
              </button>
            ))}
            <form
              className="mt-1 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSendCustomReply) sendReply(customReply);
              }}
            >
              <input
                type="text"
                value={customReply}
                onChange={(event) => setCustomReply(event.target.value)}
                maxLength={CALL_REPLY_MAX_LENGTH}
                aria-label={t("calls.customReplyLabel")}
                placeholder={t("calls.customReplyPlaceholder")}
                className="min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm text-brand-ink outline-none focus:border-brand-blue dark:border-white/10 dark:text-white"
              />
              <button
                type="submit"
                disabled={!canSendCustomReply}
                aria-label={t("calls.sendReply")}
                title={t("calls.sendReply")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white transition-opacity disabled:opacity-40"
              >
                <IconSend size={18} stroke={2} />
              </button>
            </form>
            <button
              type="button"
              onClick={() => setShowReplies(false)}
              className="mt-1 flex items-center justify-center gap-1.5 text-sm text-neutral-500 hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white"
            >
              <IconArrowLeft size={16} stroke={1.75} />
              {t("calls.backToCall")}
            </button>
          </div>
        ) : (
          <>
            {/* Botones de acción */}
            <div className="mt-8 flex items-center justify-center gap-8">
              {/* Rechazar */}
              <button
                type="button"
                onClick={() => void rejectCall("declined")}
                aria-label={t("calls.declineCall")}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-600/30 transition-transform hover:scale-105 active:scale-95"
              >
                <IconPhoneOff size={26} stroke={2} />
              </button>

              {/* Aceptar */}
              <button
                type="button"
                onClick={() => void acceptCall()}
                aria-label={t("calls.acceptCall")}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 transition-transform hover:scale-105 active:scale-95 animate-pulse"
              >
                {isVideo ? <IconVideo size={26} stroke={2} /> : <IconPhone size={26} stroke={2} />}
              </button>
            </div>

            {/* Rechazar con un mensaje, como en una llamada normal */}
            <button
              type="button"
              onClick={() => setShowReplies(true)}
              className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-neutral-500 transition-colors hover:text-brand-ink dark:text-neutral-400 dark:hover:text-white"
            >
              <IconMessage size={16} stroke={1.75} />
              {t("calls.replyWithMessage")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

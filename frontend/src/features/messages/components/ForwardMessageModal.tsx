"use client";

import { useMemo } from "react";
import { ChatTargetPicker } from "@/features/conversations/components/ChatTargetPicker";
import type { ChatTarget } from "@/features/conversations/utils/chat-target";
import { useForwardMessage } from "@/features/messages/hooks/use-forward-message";
import { useTranslation } from "@/i18n";
import type { Message } from "@/features/messages/types/message.types";

interface ForwardMessageModalProps {
  message?: Message;
  messages?: Message[];
  currentUserId: string;
  onClose: () => void;
}

/** Elegir a dónde reenviar uno o varios mensajes. La lista de destinos, la
 * búsqueda y la selección múltiple son de `ChatTargetPicker`; acá solo se decide
 * qué se reenvía. Elegir un contacto crea (o reusa, si ya existía) esa
 * conversación al momento de reenviar — ver useForwardMessage.
 *
 * Con varios destinos seleccionados no tiene sentido navegar a "el" chat de
 * destino (podría haber muchos) — al reenviar con éxito el modal simplemente
 * se cierra y el usuario se queda donde estaba. */
export function ForwardMessageModal({ message, messages, currentUserId, onClose }: ForwardMessageModalProps) {
  const { t } = useTranslation();
  const { forward, forwardMany, pending, error } = useForwardMessage();

  const targetMessages = useMemo(() => {
    const list = messages && messages.length > 0 ? messages : message ? [message] : [];
    return [...list]
      .filter((m) => !m.deletedAt)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [messages, message]);

  async function handleSubmit(targets: ChatTarget[]) {
    if (targetMessages.length === 0) return;

    const succeeded =
      targetMessages.length === 1
        ? await forward(targetMessages[0].id, targets)
        : await forwardMany(
            targetMessages.map((m) => m.id),
            targets,
          );

    if (succeeded === targets.length) onClose();
  }

  const title =
    targetMessages.length > 1
      ? t("modals.forwardMessageTitlePrefixMultiple", { count: targetMessages.length })
      : t("modals.forwardMessageTitlePrefixSingle");

  return (
    <ChatTargetPicker
      title={title}
      currentUserId={currentUserId}
      submitLabel={(count) =>
        count > 0 ? t("modals.forwardCountButton", { count }) : t("modals.forwardButton")
      }
      onSubmit={handleSubmit}
      onClose={onClose}
      pending={pending}
      error={error}
      submitDisabled={targetMessages.length === 0}
    />
  );
}

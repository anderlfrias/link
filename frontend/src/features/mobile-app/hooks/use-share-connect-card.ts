"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { sendMessage } from "@/features/messages/api/messages.api";
import { resolveChatTargetConversationId, type ChatTarget } from "@/features/conversations/utils/chat-target";
import { useTranslation } from "@/i18n";

export const CONNECT_CARD_FILENAME = "link-app.png";

export interface ConnectCardShare {
  /** PNG de la tarjeta (ver `renderConnectCardPng`). */
  image: Blob;
  /** Texto del mensaje: lleva la dirección del sitio, para quien no pueda escanear. */
  text: string;
}

/** Comparte la tarjeta de conexión dentro de LINK: la manda como un mensaje con
 * la imagen adjunta a cada destino elegido. Es un mensaje normal de quien lo
 * comparte (cuenta para sus límites de envío y de subida), no un mensaje del
 * sistema. */
export function useShareConnectCard() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Devuelve a cuántos destinos se envió. Si alguno falla, los demás no se
   * abortan y `error` dice cuántos quedaron sin enviar. */
  const share = useCallback(
    async ({ image, text }: ConnectCardShare, targets: ChatTarget[]): Promise<number> => {
      if (!session || targets.length === 0) return 0;
      setPending(true);
      setError(null);

      const results = await Promise.allSettled(
        targets.map(async (target) => {
          const conversationId = await resolveChatTargetConversationId(target, session.token);
          // Una subida por destino: el archivo queda organizado bajo cada conversación.
          const file = new File([image], CONNECT_CARD_FILENAME, { type: "image/png" });
          const uploaded = await uploadFile(session.token, file, conversationId);
          await sendMessage(session.token, conversationId, { content: text, fileIds: [uploaded.id] });
        }),
      );

      setPending(false);
      const failed = results.filter((result) => result.status === "rejected").length;
      const succeeded = targets.length - failed;
      if (failed > 0) {
        setError(
          succeeded > 0
            ? t("mobileApp.sharePartialError", { sent: succeeded, total: targets.length })
            : t("mobileApp.shareError"),
        );
      }
      return succeeded;
    },
    [session, t],
  );

  return { share, pending, error };
}

import { createConversation, getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";

/** Destino elegido en `ChatTargetPicker`: una conversación existente, "self"
 * (resuelve o crea "Mensajes guardados"), o un contacto sin chat todavía (crea
 * —o reusa, si ya existía— la conversación PRIVATE con esa persona). */
export type ChatTarget = { conversationId: string } | { userId: string } | "self";

/** Id de la conversación a la que apunta `target`, creándola si hace falta. */
export async function resolveChatTargetConversationId(target: ChatTarget, token: string): Promise<string> {
  if (target === "self") return (await getOrCreateSelfChat(token)).id;
  if ("userId" in target) {
    return (await createConversation(token, { type: "PRIVATE", memberIds: [target.userId] })).id;
  }
  return target.conversationId;
}

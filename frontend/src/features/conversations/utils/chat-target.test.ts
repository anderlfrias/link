import { beforeEach, describe, expect, it, vi } from "vitest";
import { createConversation, getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";
import { resolveChatTargetConversationId } from "./chat-target";

vi.mock("@/features/conversations/api/conversations.api", () => ({
  createConversation: vi.fn(),
  getOrCreateSelfChat: vi.fn(),
}));

describe("resolveChatTargetConversationId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("una conversación existente se usa tal cual, sin llamar al backend", async () => {
    await expect(resolveChatTargetConversationId({ conversationId: "conv-1" }, "token")).resolves.toBe("conv-1");

    expect(createConversation).not.toHaveBeenCalled();
    expect(getOrCreateSelfChat).not.toHaveBeenCalled();
  });

  it('"self" resuelve (o crea) Mensajes guardados', async () => {
    vi.mocked(getOrCreateSelfChat).mockResolvedValue({ id: "self-conv" } as never);

    await expect(resolveChatTargetConversationId("self", "token")).resolves.toBe("self-conv");

    expect(getOrCreateSelfChat).toHaveBeenCalledWith("token");
  });

  it("un contacto sin chat crea (o reusa) la conversación privada con esa persona", async () => {
    vi.mocked(createConversation).mockResolvedValue({ id: "private-conv" } as never);

    await expect(resolveChatTargetConversationId({ userId: "u-9" }, "token")).resolves.toBe("private-conv");

    expect(createConversation).toHaveBeenCalledWith("token", { type: "PRIVATE", memberIds: ["u-9"] });
  });

  it("propaga el error si no se puede crear la conversación", async () => {
    vi.mocked(createConversation).mockRejectedValue(new Error("403"));

    await expect(resolveChatTargetConversationId({ userId: "u-9" }, "token")).rejects.toThrow("403");
  });
});

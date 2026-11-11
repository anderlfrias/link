import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useShareConnectCard } from "./use-share-connect-card";
import { useAuth } from "@/providers/auth-provider";
import { uploadFile } from "@/features/files/api/files.api";
import { sendMessage } from "@/features/messages/api/messages.api";
import { createConversation, getOrCreateSelfChat } from "@/features/conversations/api/conversations.api";
import { createMockSession } from "@/test/test-utils";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/files/api/files.api", () => ({
  uploadFile: vi.fn(),
}));

vi.mock("@/features/messages/api/messages.api", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("@/features/conversations/api/conversations.api", () => ({
  createConversation: vi.fn(),
  getOrCreateSelfChat: vi.fn(),
}));

function mockAuth(session: ReturnType<typeof createMockSession> | null) {
  vi.mocked(useAuth).mockReturnValue({
    session,
    status: session ? "authenticated" : "unauthenticated",
    login: vi.fn(),
    logout: vi.fn(),
    updateSessionUser: vi.fn(),
    expireSession: vi.fn(),
    completePasswordChange: vi.fn(),
  });
}

const card = { image: new Blob(["png"], { type: "image/png" }), text: "Conecta la app: https://chat.empresa.com" };

describe("useShareConnectCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(createMockSession({ token: "share-token" }));
    vi.mocked(uploadFile).mockImplementation(async (_token, _file, conversationId) => ({
      id: `file-${conversationId}`,
    }) as never);
    vi.mocked(sendMessage).mockResolvedValue({} as never);
  });

  it("sube la imagen y la manda como mensaje, con el texto, a la conversación elegida", async () => {
    const { result } = renderHook(() => useShareConnectCard());

    let sent = 0;
    await act(async () => {
      sent = await result.current.share(card, [{ conversationId: "conv-1" }]);
    });

    expect(sent).toBe(1);
    const [token, file, conversationId] = vi.mocked(uploadFile).mock.calls[0];
    expect(token).toBe("share-token");
    expect(file.name).toBe("link-app.png");
    expect(file.type).toBe("image/png");
    expect(conversationId).toBe("conv-1");
    expect(sendMessage).toHaveBeenCalledWith("share-token", "conv-1", {
      content: card.text,
      fileIds: ["file-conv-1"],
    });
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it("resuelve Mensajes guardados y contactos sin chat antes de enviar", async () => {
    vi.mocked(getOrCreateSelfChat).mockResolvedValue({ id: "self-conv" } as never);
    vi.mocked(createConversation).mockResolvedValue({ id: "new-private" } as never);
    const { result } = renderHook(() => useShareConnectCard());

    let sent = 0;
    await act(async () => {
      sent = await result.current.share(card, ["self", { userId: "u-3" }]);
    });

    expect(sent).toBe(2);
    expect(createConversation).toHaveBeenCalledWith("share-token", { type: "PRIVATE", memberIds: ["u-3"] });
    expect(vi.mocked(sendMessage).mock.calls.map((call) => call[1]).sort()).toEqual(["new-private", "self-conv"]);
  });

  it("si un destino falla, los demás se envían igual y el error dice cuántos", async () => {
    vi.mocked(sendMessage).mockImplementation(async (_token, conversationId) => {
      if (conversationId === "conv-2") throw new Error("403");
      return {} as never;
    });
    const { result } = renderHook(() => useShareConnectCard());

    let sent = 0;
    await act(async () => {
      sent = await result.current.share(card, [{ conversationId: "conv-1" }, { conversationId: "conv-2" }]);
    });

    expect(sent).toBe(1);
    expect(result.current.error).toBe("Se envió a 1 de 2 chats. El resto no se pudo enviar.");
  });

  it("si la subida falla no se manda ningún mensaje y el error es el genérico", async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error("413"));
    const { result } = renderHook(() => useShareConnectCard());

    let sent = -1;
    await act(async () => {
      sent = await result.current.share(card, [{ conversationId: "conv-1" }]);
    });

    expect(sent).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result.current.error).toBe("No se pudo compartir.");
  });

  it("no hace nada sin sesión o sin destinos", async () => {
    const { result } = renderHook(() => useShareConnectCard());
    await act(async () => {
      expect(await result.current.share(card, [])).toBe(0);
    });

    mockAuth(null);
    const { result: withoutSession } = renderHook(() => useShareConnectCard());
    await act(async () => {
      expect(await withoutSession.current.share(card, [{ conversationId: "conv-1" }])).toBe(0);
    });

    expect(uploadFile).not.toHaveBeenCalled();
  });
});

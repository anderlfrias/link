import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatTargetPicker } from "./ChatTargetPicker";
import type { Conversation } from "@/features/conversations/types/conversation.types";
import type { DirectoryUser } from "@/features/users/types/user.types";

// El recorrido completo (búsqueda, selección que sobrevive al filtro, contactos
// sin chat) lo cubre ForwardMessageModal.test.tsx, que monta este componente de
// verdad. Acá va lo que es propio del selector como pieza reutilizable.

const mockUseConversations = vi.fn();
vi.mock("@/features/conversations/hooks/use-conversations", () => ({
  useConversations: () => mockUseConversations(),
}));

const mockUseUsers = vi.fn();
vi.mock("@/features/users/hooks/use-users", () => ({
  useUsers: () => mockUseUsers(),
}));

const group = {
  id: "conv-group",
  type: "GROUP",
  name: "Equipo",
  imageFileId: null,
  members: [],
} as unknown as Conversation;

const selfChat = { ...group, id: "conv-self", type: "SELF", name: null } as unknown as Conversation;

const contact = { id: "u-3", name: "Ana Gomez", email: "ana@example.com" } as unknown as DirectoryUser;

function renderPicker(overrides: Partial<React.ComponentProps<typeof ChatTargetPicker>> = {}) {
  const props = {
    title: "Compartir",
    currentUserId: "u-1",
    submitLabel: (count: number) => (count > 0 ? `Enviar (${count})` : "Enviar"),
    onSubmit: vi.fn(),
    onClose: vi.fn(),
    pending: false,
    error: null,
    ...overrides,
  };
  render(<ChatTargetPicker {...props} />);
  return props;
}

describe("ChatTargetPicker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseConversations.mockReturnValue({ conversations: [group, selfChat], status: "ready" });
    mockUseUsers.mockReturnValue({ users: [contact], status: "ready" });
  });

  it("usa el título y el texto del botón que recibe, con la cantidad elegida", async () => {
    const user = userEvent.setup();
    renderPicker();

    expect(screen.getByRole("heading", { name: "Compartir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();

    await user.click(screen.getByText("Equipo"));

    expect(screen.getByRole("heading", { name: "Compartir (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar (1)" })).toBeEnabled();
  });

  it("entrega los destinos con su tipo: conversación, Mensajes guardados y contacto", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker();

    await user.click(screen.getByText("Equipo"));
    await user.click(screen.getByText("Mensajes guardados"));
    await user.click(screen.getByText("Ana Gomez"));
    await user.click(screen.getByRole("button", { name: "Enviar (3)" }));

    expect(onSubmit).toHaveBeenCalledWith([{ conversationId: "conv-group" }, "self", { userId: "u-3" }]);
  });

  it("no lista la conversación SELF real: ya está como Mensajes guardados", () => {
    renderPicker();

    expect(screen.getAllByText("Mensajes guardados")).toHaveLength(1);
  });

  it("con submitDisabled no envía aunque haya destinos elegidos", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderPicker({ submitDisabled: true });

    await user.click(screen.getByText("Equipo"));

    expect(screen.getByRole("button", { name: "Enviar (1)" })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("muestra el error recibido y bloquea la lista mientras hay un envío en curso", () => {
    renderPicker({ error: "No se pudo enviar", pending: true });

    expect(screen.getByText("No se pudo enviar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Equipo/ })).toBeDisabled();
  });

  it("avisa al cerrar", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPicker();

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalled();
  });
});

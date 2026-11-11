import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectMobileAppModal } from "./ConnectMobileAppModal";
import { useAuth } from "@/providers/auth-provider";
import { downloadBlob, renderConnectCardPng } from "@/features/mobile-app/utils/connect-card-image";
import { copyTextToClipboard } from "@/utils/clipboard";
import { createMockSession } from "@/test/test-utils";
import type { ChatTarget } from "@/features/conversations/utils/chat-target";

vi.mock("@/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/mobile-app/utils/connect-card-image", () => ({
  renderConnectCardPng: vi.fn(),
  downloadBlob: vi.fn(),
}));

vi.mock("@/utils/clipboard", () => ({
  copyTextToClipboard: vi.fn(),
}));

const mockShare = vi.fn();
const mockUseShareConnectCard = vi.fn();
vi.mock("@/features/mobile-app/hooks/use-share-connect-card", () => ({
  CONNECT_CARD_FILENAME: "link-app.png",
  useShareConnectCard: () => mockUseShareConnectCard(),
}));

// El selector de chats tiene sus propios tests (ChatTargetPicker.test.tsx): acá
// alcanza con un doble que deja elegir dos destinos fijos.
const PICKED: ChatTarget[] = [{ conversationId: "conv-1" }, "self"];
vi.mock("@/features/conversations/components/ChatTargetPicker", () => ({
  ChatTargetPicker: (props: {
    title: string;
    error: string | null;
    onSubmit: (targets: ChatTarget[]) => void;
    onClose: () => void;
  }) => (
    <div>
      <h2>{props.title}</h2>
      {props.error && <p>{props.error}</p>}
      <button type="button" onClick={() => props.onSubmit(PICKED)}>
        elegir destinos
      </button>
      <button type="button" onClick={props.onClose}>
        volver
      </button>
    </div>
  ),
}));

const SITE = "https://chat.empresa.com";
const png = new Blob(["png"], { type: "image/png" });

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

describe("ConnectMobileAppModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(createMockSession());
    mockUseShareConnectCard.mockReturnValue({ share: mockShare, pending: false, error: null });
    vi.mocked(renderConnectCardPng).mockResolvedValue(png);
    vi.mocked(copyTextToClipboard).mockResolvedValue(true);
  });

  it("muestra la dirección del sitio y su código QR", () => {
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={`${SITE}/conversations/1?x=1`} />);

    expect(screen.getByRole("dialog", { name: "Conectar app móvil" })).toBeInTheDocument();
    // Solo el origen: ni la ruta ni los parámetros de la página actual.
    expect(screen.getByText(SITE)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Código QR para conectar la app móvil" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("usa la dirección desde la que se abrió la web si no se indica otra", () => {
    render(<ConnectMobileAppModal onClose={vi.fn()} />);

    expect(screen.getByText(window.location.origin)).toBeInTheDocument();
  });

  it("avisa cuando la dirección no usa HTTPS", () => {
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl="http://192.168.1.10:3000" />);

    expect(screen.getByRole("alert")).toHaveTextContent("no usa HTTPS");
  });

  it("no se muestra sin sesión ni con una dirección inválida", () => {
    const { container, rerender } = render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl="no es una url" />);
    expect(container).toBeEmptyDOMElement();

    mockAuth(null);
    rerender(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("copia la dirección y lo confirma", async () => {
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Copiar dirección" }));

    expect(copyTextToClipboard).toHaveBeenCalledWith(SITE);
    expect(await screen.findByRole("button", { name: "Copiado" })).toBeInTheDocument();
  });

  it("descarga la tarjeta como imagen PNG", async () => {
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Descargar imagen" }));

    expect(renderConnectCardPng).toHaveBeenCalledWith(
      expect.objectContaining({ url: SITE, title: "Conecta la app LINK" }),
    );
    expect(downloadBlob).toHaveBeenCalledWith(png, "link-app.png");
  });

  it("avisa si no se pudo generar la imagen para descargar", async () => {
    vi.mocked(renderConnectCardPng).mockRejectedValue(new Error("sin canvas"));
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Descargar imagen" }));

    expect(await screen.findByRole("status")).toHaveTextContent("No se pudo generar la imagen.");
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it("comparte en LINK la imagen y la dirección a los destinos elegidos", async () => {
    mockShare.mockResolvedValue(2);
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Compartir en LINK" }));
    await user.click(screen.getByRole("button", { name: "elegir destinos" }));

    expect(mockShare).toHaveBeenCalledWith(
      { image: png, text: expect.stringContaining(SITE) },
      PICKED,
    );
    // Vuelve a la vista principal y confirma el envío.
    expect(await screen.findByRole("status")).toHaveTextContent("Enviado.");
    expect(screen.getByText(SITE)).toBeInTheDocument();
  });

  it("lo que se comparte no lleva nada de la sesión de quien lo comparte", async () => {
    mockAuth(createMockSession({ token: "token-secreto" }));
    mockShare.mockResolvedValue(2);
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Compartir en LINK" }));
    await user.click(screen.getByRole("button", { name: "elegir destinos" }));

    const [{ text }] = mockShare.mock.calls[0];
    expect(text).not.toContain("token-secreto");
    expect(JSON.stringify(vi.mocked(renderConnectCardPng).mock.calls[0][0])).not.toContain("token-secreto");
  });

  it("si algún envío falla, se queda en el selector para reintentar", async () => {
    mockShare.mockResolvedValue(1);
    mockUseShareConnectCard.mockReturnValue({ share: mockShare, pending: false, error: "Se envió a 1 de 2 chats." });
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Compartir en LINK" }));
    await user.click(screen.getByRole("button", { name: "elegir destinos" }));

    expect(screen.getByText("Se envió a 1 de 2 chats.")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("no envía nada si no se pudo generar la imagen para compartir", async () => {
    vi.mocked(renderConnectCardPng).mockRejectedValue(new Error("sin canvas"));
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={vi.fn()} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Compartir en LINK" }));
    await user.click(screen.getByRole("button", { name: "elegir destinos" }));

    expect(await screen.findByText("No se pudo generar la imagen.")).toBeInTheDocument();
    expect(mockShare).not.toHaveBeenCalled();
  });

  it("desde el selector se puede volver sin cerrar el diálogo", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={onClose} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Compartir en LINK" }));
    await user.click(screen.getByRole("button", { name: "volver" }));

    expect(screen.getByText(SITE)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("se cierra con el botón de cerrar", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConnectMobileAppModal onClose={onClose} siteUrl={SITE} />);

    await user.click(screen.getByRole("button", { name: "Cerrar" }));

    expect(onClose).toHaveBeenCalled();
  });
});

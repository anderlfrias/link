import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { IncomingCallModal } from "./IncomingCallModal";
import { CALL_REPLY_MAX_LENGTH } from "../constants/call.constants";
import * as UseCallModule from "../hooks/use-call";

vi.mock("../hooks/use-call");

describe("IncomingCallModal", () => {
  it("no renderiza nada si callState es idle", () => {
    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "idle",
      activeCall: null,
      acceptCall: vi.fn(),
      rejectCall: vi.fn(),
    } as any);

    const { container } = render(<IncomingCallModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renderiza modal cuando hay llamada entrante y permite aceptar", () => {
    const acceptCallMock = vi.fn();
    const rejectCallMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "incoming",
      activeCall: {
        id: "call-1",
        callerName: "Dr. Roberto",
        type: "AUDIO",
      },
      acceptCall: acceptCallMock,
      rejectCall: rejectCallMock,
    } as any);

    render(<IncomingCallModal />);

    expect(screen.getByRole("dialog", { name: "Llamada entrante" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Roberto")).toBeInTheDocument();
    expect(screen.getByText("Llamada de voz entrante...")).toBeInTheDocument();

    const acceptBtn = screen.getByLabelText("Aceptar llamada");
    fireEvent.click(acceptBtn);
    expect(acceptCallMock).toHaveBeenCalled();
  });

  it("permite rechazar la llamada entrante", () => {
    const rejectCallMock = vi.fn();

    vi.mocked(UseCallModule.useCall).mockReturnValue({
      callState: "incoming",
      activeCall: {
        id: "call-2",
        callerName: "Dra. Ana",
        type: "VIDEO",
      },
      acceptCall: vi.fn(),
      rejectCall: rejectCallMock,
    } as any);

    render(<IncomingCallModal />);

    expect(screen.getByText("Videollamada entrante...")).toBeInTheDocument();

    const rejectBtn = screen.getByLabelText("Rechazar llamada");
    fireEvent.click(rejectBtn);
    expect(rejectCallMock).toHaveBeenCalledWith("declined");
  });

  describe("rechazar con una respuesta rápida", () => {
    function renderIncoming(callId = "call-3") {
      const rejectCallMock = vi.fn();
      const acceptCallMock = vi.fn();
      vi.mocked(UseCallModule.useCall).mockReturnValue({
        callState: "incoming",
        activeCall: { id: callId, callerName: "Dr. Roberto", type: "AUDIO" },
        acceptCall: acceptCallMock,
        rejectCall: rejectCallMock,
      } as any);
      const view = render(<IncomingCallModal />);
      return { rejectCallMock, acceptCallMock, ...view };
    }

    it("ofrece responder con un mensaje sin rechazar todavía", () => {
      const { rejectCallMock } = renderIncoming();

      expect(screen.getByRole("button", { name: "Responder con un mensaje" })).toBeInTheDocument();
      expect(rejectCallMock).not.toHaveBeenCalled();
    });

    it("al abrirla muestra las cuatro respuestas y esconde los botones de contestar", () => {
      renderIncoming();

      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));

      expect(screen.getByText("Rechazar con un mensaje")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "No puedo hablar ahora. ¿Qué necesitas?" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Te devuelvo la llamada enseguida." })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Te llamo más tarde." })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "No puedo hablar ahora. ¿Me llamas más tarde?" })).toBeInTheDocument();
      expect(screen.queryByLabelText("Aceptar llamada")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Rechazar llamada")).not.toBeInTheDocument();
    });

    it("elegir una respuesta rechaza la llamada con ese texto", () => {
      const { rejectCallMock } = renderIncoming();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));

      fireEvent.click(screen.getByRole("button", { name: "Te llamo más tarde." }));

      expect(rejectCallMock).toHaveBeenCalledTimes(1);
      expect(rejectCallMock).toHaveBeenCalledWith("declined", "Te llamo más tarde.");
    });

    it("una respuesta propia rechaza con lo escrito; sin texto no se puede enviar", () => {
      const { rejectCallMock } = renderIncoming();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));
      const send = screen.getByRole("button", { name: "Enviar y rechazar" });
      const input = screen.getByLabelText("Respuesta personalizada");

      expect(send).toBeDisabled();
      fireEvent.change(input, { target: { value: "   " } });
      expect(send).toBeDisabled();

      fireEvent.change(input, { target: { value: "Estoy en una reunión, te escribo luego." } });
      expect(send).toBeEnabled();
      fireEvent.click(send);

      expect(rejectCallMock).toHaveBeenCalledWith("declined", "Estoy en una reunión, te escribo luego.");
    });

    it("enviar con Enter también rechaza", () => {
      const { rejectCallMock } = renderIncoming();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));
      const input = screen.getByLabelText("Respuesta personalizada");

      fireEvent.change(input, { target: { value: "Ahora no puedo" } });
      fireEvent.submit(input.closest("form")!);

      expect(rejectCallMock).toHaveBeenCalledWith("declined", "Ahora no puedo");
    });

    it("el campo no deja pasar del largo que acepta el servidor", () => {
      renderIncoming();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));

      expect(screen.getByLabelText("Respuesta personalizada")).toHaveAttribute("maxLength", String(CALL_REPLY_MAX_LENGTH));
    });

    it("volver regresa a aceptar o rechazar sin haber rechazado nada", () => {
      const { rejectCallMock, acceptCallMock } = renderIncoming();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));

      fireEvent.click(screen.getByRole("button", { name: "Volver a la llamada" }));

      expect(screen.getByLabelText("Aceptar llamada")).toBeInTheDocument();
      expect(rejectCallMock).not.toHaveBeenCalled();
      expect(acceptCallMock).not.toHaveBeenCalled();
    });

    it("con otra llamada la hoja de respuestas vuelve a empezar cerrada", () => {
      const { rerender } = renderIncoming("call-A");
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));
      fireEvent.change(screen.getByLabelText("Respuesta personalizada"), { target: { value: "texto a medias" } });

      vi.mocked(UseCallModule.useCall).mockReturnValue({
        callState: "incoming",
        activeCall: { id: "call-B", callerName: "Dra. Ana", type: "AUDIO" },
        acceptCall: vi.fn(),
        rejectCall: vi.fn(),
      } as any);
      rerender(<IncomingCallModal />);

      expect(screen.getByLabelText("Aceptar llamada")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Responder con un mensaje" }));
      expect(screen.getByLabelText("Respuesta personalizada")).toHaveValue("");
    });
  });
});

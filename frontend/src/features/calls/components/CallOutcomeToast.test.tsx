import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CallOutcomeToast } from "./CallOutcomeToast";
import { CALL_OUTCOME_DISMISS_MS } from "../constants/call.constants";
import * as UseCallModule from "../hooks/use-call";

vi.mock("../hooks/use-call");

const outcome = {
  conversationId: "conv-1",
  receiverId: "user-2",
  receiverName: "Dra. Ana",
  type: "AUDIO" as const,
};

function mockCall(overrides: Record<string, unknown> = {}) {
  const dismissCallOutcome = vi.fn();
  const startCall = vi.fn();
  vi.mocked(UseCallModule.useCall).mockReturnValue({
    callOutcome: { kind: "no-answer", ...outcome },
    callState: "idle",
    dismissCallOutcome,
    startCall,
    ...overrides,
  } as any);
  return { dismissCallOutcome, startCall };
}

describe("CallOutcomeToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no muestra nada sin resultado", () => {
    mockCall({ callOutcome: null });

    const { container } = render(<CallOutcomeToast />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ["no-answer", "Dra. Ana no contestó"],
    ["declined", "Dra. Ana rechazó la llamada"],
    ["busy", "Dra. Ana está en otra llamada"],
  ])("%s dice qué pasó con el nombre de la persona", (kind, text) => {
    mockCall({ callOutcome: { kind, ...outcome } });

    render(<CallOutcomeToast />);

    expect(screen.getByRole("status")).toHaveTextContent(text);
  });

  it("volver a llamar cierra el aviso y llama de nuevo a la misma persona y del mismo tipo", () => {
    const { dismissCallOutcome, startCall } = mockCall({ callOutcome: { kind: "no-answer", ...outcome, type: "VIDEO" } });

    render(<CallOutcomeToast />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a llamar" }));

    expect(dismissCallOutcome).toHaveBeenCalled();
    expect(startCall).toHaveBeenCalledWith("conv-1", "user-2", "Dra. Ana", "VIDEO");
  });

  it("con otra llamada en curso no ofrece volver a llamar", () => {
    mockCall({ callState: "incoming" });

    render(<CallOutcomeToast />);

    expect(screen.queryByRole("button", { name: "Volver a llamar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar aviso" })).toBeInTheDocument();
  });

  it("se puede cerrar a mano", () => {
    const { dismissCallOutcome } = mockCall();

    render(<CallOutcomeToast />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    expect(dismissCallOutcome).toHaveBeenCalled();
  });

  it("se cierra solo después de unos segundos", () => {
    const { dismissCallOutcome } = mockCall();

    render(<CallOutcomeToast />);
    act(() => {
      vi.advanceTimersByTime(CALL_OUTCOME_DISMISS_MS - 1);
    });
    expect(dismissCallOutcome).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dismissCallOutcome).toHaveBeenCalledTimes(1);
  });

  it("sin nombre usa uno genérico", () => {
    mockCall({ callOutcome: { kind: "no-answer", ...outcome, receiverName: "" } });

    render(<CallOutcomeToast />);

    expect(screen.getByRole("status")).toHaveTextContent("Contacto no contestó");
  });
});

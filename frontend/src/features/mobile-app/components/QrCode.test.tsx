import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QrCode } from "./QrCode";

const matrix = [
  [true, false, true],
  [false, true, false],
  [true, true, true],
];

describe("QrCode", () => {
  it("se anuncia como imagen con la etiqueta recibida", () => {
    render(<QrCode matrix={matrix} label="Código QR de prueba" />);

    expect(screen.getByRole("img", { name: "Código QR de prueba" })).toBeInTheDocument();
  });

  it("reserva el margen en blanco alrededor del código", () => {
    render(<QrCode matrix={matrix} label="qr" />);

    // 3 módulos + 4 de margen por lado.
    expect(screen.getByRole("img", { name: "qr" })).toHaveAttribute("viewBox", "0 0 11 11");
  });

  it("es negro sobre blanco, sin depender del tema", () => {
    const { container } = render(<QrCode matrix={matrix} label="qr" />);

    expect(container.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
    const path = container.querySelector("path");
    expect(path).toHaveAttribute("fill", "#000000");
    expect(path?.getAttribute("d")).toBe("M4 4h1v1h-1zM6 4h1v1h-1zM5 5h1v1h-1zM4 6h3v1h-3z");
  });
});

import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PARTS,
  MAX_TOTAL_LENGTH,
  splitLongMessage,
} from "./split-long-message";

describe("splitLongMessage", () => {
  it("un texto que entra en un mensaje se devuelve tal cual, en un único trozo", () => {
    expect(splitLongMessage("hola")).toEqual(["hola"]);
    const exact = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(splitLongMessage(exact)).toEqual([exact]);
  });

  it("el tope total es el límite por mensaje por la cantidad máxima de partes", () => {
    expect(MAX_TOTAL_LENGTH).toBe(MAX_MESSAGE_LENGTH * MAX_MESSAGE_PARTS);
  });

  it("8000 caracteres sin separadores se dividen en dos mensajes de 4000", () => {
    const parts = splitLongMessage("a".repeat(8000));
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.length)).toEqual([4000, 4000]);
  });

  it("ninguna parte supera el límite y unirlas reproduce el texto original", () => {
    const text = Array.from({ length: 900 }, (_, i) => `palabra${i}`).join(" ");
    const parts = splitLongMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(p.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH));
    expect(parts.join("")).toBe(text);
  });

  it("prefiere cortar en un salto de línea", () => {
    const first = "x".repeat(3000) + "\n";
    const text = first + "y".repeat(3000);
    const parts = splitLongMessage(text);
    expect(parts).toEqual([first, "y".repeat(3000)]);
  });

  it("sin saltos de línea corta en un espacio, dejándolo al final de la parte anterior", () => {
    const first = "x".repeat(3000) + " ";
    const text = first + "y".repeat(3000);
    expect(splitLongMessage(text)).toEqual([first, "y".repeat(3000)]);
  });

  it("ignora un separador demasiado al principio y corta duro para no hacer partes casi vacías", () => {
    const text = "a\n" + "b".repeat(5000);
    const parts = splitLongMessage(text);
    expect(parts[0]).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(parts.join("")).toBe(text);
  });

  it("no parte un emoji (par sustituto) en el corte duro", () => {
    const text = "a".repeat(MAX_MESSAGE_LENGTH - 1) + "\u{1F600}" + "b".repeat(100);
    const parts = splitLongMessage(text);
    expect(parts[0]).toBe("a".repeat(MAX_MESSAGE_LENGTH - 1));
    expect(parts[1].startsWith("\u{1F600}")).toBe(true);
    expect(parts.join("")).toBe(text);
  });

  it("descarta los trozos hechos solo de espacios (el backend los rechazaría)", () => {
    const text = "a".repeat(3000) + "\n" + " ".repeat(4200);
    const parts = splitLongMessage(text);
    parts.forEach((p) => expect(p.trim().length).toBeGreaterThan(0));
  });

  it("el tope de 5 partes cubre exactamente 20000 caracteres", () => {
    expect(splitLongMessage("a".repeat(MAX_TOTAL_LENGTH))).toHaveLength(MAX_MESSAGE_PARTS);
  });
});

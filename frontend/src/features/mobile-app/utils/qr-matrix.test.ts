import { describe, expect, it } from "vitest";
import { buildQrMatrix, qrMatrixToSvgPath } from "./qr-matrix";

/** Los tres patrones de posición de todo QR: un cuadrado de 7x7 con borde oscuro,
 * anillo claro y centro oscuro de 3x3, en tres de las cuatro esquinas. */
function hasFinderPattern(matrix: boolean[][], top: number, left: number): boolean {
  for (let row = 0; row < 7; row++) {
    for (let column = 0; column < 7; column++) {
      const onBorder = row === 0 || row === 6 || column === 0 || column === 6;
      const inCenter = row >= 2 && row <= 4 && column >= 2 && column <= 4;
      if (matrix[top + row][left + column] !== (onBorder || inCenter)) return false;
    }
  }
  return true;
}

describe("buildQrMatrix", () => {
  it("genera una matriz cuadrada de un tamaño válido de QR", () => {
    const matrix = buildQrMatrix("linkapp://connect?url=https%3A%2F%2Fchat.empresa.com");

    const size = matrix.length;
    // Tamaños válidos: 21, 25, 29... (17 + 4 * versión).
    expect((size - 17) % 4).toBe(0);
    expect(size).toBeGreaterThanOrEqual(21);
    expect(matrix.every((row) => row.length === size)).toBe(true);
  });

  it("incluye los tres patrones de posición", () => {
    const matrix = buildQrMatrix("linkapp://connect?url=https%3A%2F%2Fchat.empresa.com");
    const size = matrix.length;

    expect(hasFinderPattern(matrix, 0, 0)).toBe(true);
    expect(hasFinderPattern(matrix, 0, size - 7)).toBe(true);
    expect(hasFinderPattern(matrix, size - 7, 0)).toBe(true);
  });

  it("es determinista y cambia con el contenido", () => {
    const first = buildQrMatrix("linkapp://connect?url=https%3A%2F%2Fa.example");
    const again = buildQrMatrix("linkapp://connect?url=https%3A%2F%2Fa.example");
    const other = buildQrMatrix("linkapp://connect?url=https%3A%2F%2Fb.example");

    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("crece cuando el contenido no entra en el tamaño mínimo", () => {
    const short = buildQrMatrix("a");
    const long = buildQrMatrix(`linkapp://connect?url=https%3A%2F%2F${"sub.".repeat(30)}empresa.com`);

    expect(long.length).toBeGreaterThan(short.length);
  });
});

describe("qrMatrixToSvgPath", () => {
  it("une los módulos contiguos de una fila y aplica el margen", () => {
    const matrix = [
      [true, true, false],
      [false, false, true],
      [false, false, false],
    ];

    expect(qrMatrixToSvgPath(matrix, 4)).toBe("M4 4h2v1h-2zM6 5h1v1h-1z");
  });

  it("una matriz sin módulos oscuros no dibuja nada", () => {
    expect(qrMatrixToSvgPath([[false, false], [false, false]])).toBe("");
  });
});

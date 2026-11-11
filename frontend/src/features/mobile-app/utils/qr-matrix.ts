import qrcode from "qrcode-generator";

/** Módulos del QR: `matrix[fila][columna]` es `true` donde va un cuadrado oscuro. */
export type QrMatrix = boolean[][];

/** Margen en blanco alrededor del código, en módulos. Cuatro es lo que pide el
 * estándar: con menos, algunos lectores no encuentran el código. */
export const QR_QUIET_ZONE = 4;

/**
 * Codifica `text` como QR. Corrección de errores "M" (recupera ~15 %): alcanza
 * para una pantalla o una hoja impresa y mantiene el código poco denso, que es
 * lo que lo hace fácil de leer desde lejos.
 */
export function buildQrMatrix(text: string): QrMatrix {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();

  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => qr.isDark(row, column)),
  );
}

/**
 * `d` de un `<path>` SVG con los módulos oscuros, en unidades de módulo y ya
 * corrido por el margen. Los módulos contiguos de una fila se unen en un solo
 * rectángulo: menos nodos y sin líneas finas entre cuadrados al escalar.
 */
export function qrMatrixToSvgPath(matrix: QrMatrix, quietZone = QR_QUIET_ZONE): string {
  const segments: string[] = [];
  matrix.forEach((row, rowIndex) => {
    let column = 0;
    while (column < row.length) {
      if (!row[column]) {
        column += 1;
        continue;
      }
      const start = column;
      while (column < row.length && row[column]) column += 1;
      segments.push(`M${start + quietZone} ${rowIndex + quietZone}h${column - start}v1h-${column - start}z`);
    }
  });
  return segments.join("");
}

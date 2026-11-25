import { QR_QUIET_ZONE, type QrMatrix } from "@/features/mobile-app/utils/qr-matrix";

export interface ConnectCardContent {
  matrix: QrMatrix;
  /** Dirección del sitio, tal como hay que escribirla en la app. */
  url: string;
  title: string;
  hint: string;
}

const CARD_WIDTH = 720;
const CARD_HEIGHT = 920;
const QR_BOX = 520;
const QR_TOP = 150;
const TEXT_MAX_WIDTH = CARD_WIDTH - 80;
const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// Colores de marca (globals.css): --color-brand-ink y --color-brand-blue.
const INK = "#002040";
const BLUE = "#0068d8";
const MUTED = "#5b6b7b";

/** Achica la fuente hasta que `text` entra en `maxWidth` (una URL larga no se
 * corta: se tiene que poder leer entera para escribirla a mano). */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: string,
  startPx: number,
  minPx: number,
  maxWidth: number,
): void {
  let size = startPx;
  ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  while (size > minPx && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
  }
}

/**
 * Dibuja en `ctx` la tarjeta para compartir: título, QR, dirección del sitio e
 * indicación. Los módulos del QR se pintan como rectángulos de tamaño entero,
 * directo desde la matriz: rasterizar el SVG los dejaría con bordes borrosos.
 */
export function drawConnectCard(ctx: CanvasRenderingContext2D, content: ConnectCardContent): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = INK;
  fitFont(ctx, content.title, "700", 44, 24, TEXT_MAX_WIDTH);
  ctx.fillText(content.title, CARD_WIDTH / 2, 84);

  const modules = content.matrix.length + QR_QUIET_ZONE * 2;
  const cell = Math.floor(QR_BOX / modules);
  const qrSize = cell * modules;
  const left = Math.round((CARD_WIDTH - qrSize) / 2);
  const top = QR_TOP + Math.round((QR_BOX - qrSize) / 2);

  ctx.fillStyle = "#000000";
  content.matrix.forEach((row, rowIndex) => {
    row.forEach((dark, columnIndex) => {
      if (!dark) return;
      ctx.fillRect(left + (columnIndex + QR_QUIET_ZONE) * cell, top + (rowIndex + QR_QUIET_ZONE) * cell, cell, cell);
    });
  });

  ctx.fillStyle = BLUE;
  fitFont(ctx, content.url, "600", 34, 16, TEXT_MAX_WIDTH);
  ctx.fillText(content.url, CARD_WIDTH / 2, QR_TOP + QR_BOX + 70);

  ctx.fillStyle = MUTED;
  fitFont(ctx, content.hint, "400", 26, 16, TEXT_MAX_WIDTH);
  ctx.fillText(content.hint, CARD_WIDTH / 2, QR_TOP + QR_BOX + 140);
}

/** PNG de la tarjeta para compartir, generado en un `<canvas>` descartable. */
export async function renderConnectCardPng(content: ConnectCardContent): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo obtener el contexto 2D del canvas");

  drawConnectCard(ctx, content);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo generar el PNG");
  return blob;
}

/** Descarga `blob` con el nombre `filename`, sin pasar por el servidor. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

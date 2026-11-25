import { QR_QUIET_ZONE, qrMatrixToSvgPath, type QrMatrix } from "@/features/mobile-app/utils/qr-matrix";

interface QrCodeProps {
  matrix: QrMatrix;
  /** Texto para lectores de pantalla: qué es el código, no su contenido. */
  label: string;
  className?: string;
}

/** Código QR como SVG. Siempre negro sobre blanco, también en el tema oscuro:
 * un QR con los colores invertidos no lo leen todas las cámaras. */
export function QrCode({ matrix, label, className }: QrCodeProps) {
  const size = matrix.length + QR_QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={qrMatrixToSvgPath(matrix)} fill="#000000" />
    </svg>
  );
}

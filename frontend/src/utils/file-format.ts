const UNITS = ["B", "KB", "MB", "GB"];

/** "245678" -> "240 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;

  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${UNITS[unitIndex]}`;
}

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith("audio/");
}

/**
 * Corrige nombres de archivos que contengan caracteres mal interpretados (mojibake)
 * debido a decodificación Latin-1 de cadenas UTF-8 en cargas de archivos previas.
 */
export function formatFileName(name: string): string {
  if (!name) return "";
  try {
    // Si contiene secuencias típicas de UTF-8 interpretadas como Latin-1 (ej. Ã¡, Ã±, etc.)
    if (/[\u00C2\u00C3][\u0080-\u00BF]/.test(name)) {
      const bytes = new Uint8Array([...name].map((c) => c.charCodeAt(0)));
      const decoder = new TextDecoder("utf-8", { fatal: true });
      return decoder.decode(bytes);
    }
  } catch {
    // Mantener original ante cualquier excepción
  }
  return name;
}

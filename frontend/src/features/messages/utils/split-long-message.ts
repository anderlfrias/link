/** Límite de caracteres de UN mensaje (el backend rechaza más — `message.validator.ts`). */
export const MAX_MESSAGE_LENGTH = 4000;

/** Cuántos mensajes como máximo se genera al dividir un texto largo al enviarlo. */
export const MAX_MESSAGE_PARTS = 5;

/** Largo total máximo que se acepta en el composer: lo que entra en `MAX_MESSAGE_PARTS` mensajes. */
export const MAX_TOTAL_LENGTH = MAX_MESSAGE_LENGTH * MAX_MESSAGE_PARTS;

/** Un corte en un separador solo se prefiere si deja al menos esta fracción de la ventana en la
 * parte actual — así un salto de línea al principio no produce partes casi vacías. */
const MIN_BREAK_FRACTION = 0.5;

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Parte un texto largo en trozos de a lo sumo `maxLength` caracteres para enviarlos como mensajes
 * consecutivos. Corta preferentemente en un salto de línea y, si no, en un espacio (el separador se
 * queda al final de la parte anterior); si no hay ninguno razonable, corta duro sin partir un
 * emoji. Los trozos son segmentos consecutivos y exactos del texto: unirlos con `""` reproduce el
 * original (salvo los trozos hechos solo de espacios, que se descartan porque el backend los
 * rechazaría como vacíos). Un texto que entra en un mensaje se devuelve tal cual, en un único
 * trozo.
 *
 * El llamador valida el tope (`MAX_TOTAL_LENGTH`) antes de llamar: acá no se descarta contenido.
 */
export function splitLongMessage(text: string, maxLength: number = MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const parts: string[] = [];
  let rest = text;
  while (rest.length > maxLength) {
    const window = rest.slice(0, maxLength);
    const minBreak = Math.floor(maxLength * MIN_BREAK_FRACTION);
    let cut = Math.max(window.lastIndexOf("\n") + 1, 0);
    if (cut < minBreak) cut = Math.max(window.lastIndexOf(" ") + 1, 0);
    if (cut < minBreak) {
      cut = maxLength;
      // No dejar la mitad de un par sustituto (emoji) al final de la parte.
      if (isHighSurrogate(rest.charCodeAt(cut - 1))) cut -= 1;
    }
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);

  return parts.filter((part) => part.trim().length > 0);
}

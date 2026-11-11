/// Forma de un token de push de Expo. Solo acota el largo y los caracteres; que el
/// token exista lo decide Expo al enviar (y un token inválido se borra solo, ver
/// `notifyNewMessage`). Archivo aparte para que el validador no cargue la base.
const EXPO_TOKEN = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{8,120}\]$/;

export function isValidExpoToken(token: string): boolean {
  return EXPO_TOKEN.test(token);
}

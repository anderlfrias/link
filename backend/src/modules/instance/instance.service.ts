import env from "../../config/env";

/// Nivel de compatibilidad del API que consumen las apps móviles. Es un entero
/// propio, no la versión del backend: sube solo cuando un cambio del API rompe a
/// una app ya publicada, y la app compara este número contra el rango que soporta
/// para pedir que la actualicen (o avisar que la instalación es antigua).
export const MOBILE_API_LEVEL = 1;

export interface InstanceInfo {
  /// Constante: le permite a un cliente confirmar que detrás de la URL hay un LINK.
  app: "link";
  mobileApi: number;
  features: {
    /// Si esta instalación puede enviar notificaciones push a apps móviles.
    mobilePush: boolean;
  };
}

/// Lo que `GET /v1/instance` publica sin autenticación. A propósito no incluye la
/// versión del backend ni ningún dato de la instalación o de sus cuentas: es una
/// ruta que cualquiera puede consultar, y la versión exacta le serviría a quien
/// busca instalaciones con una vulnerabilidad conocida.
export function getInstanceInfo(): InstanceInfo {
  return {
    app: "link",
    mobileApi: MOBILE_API_LEVEL,
    features: { mobilePush: env.MOBILE_PUSH_ENABLED },
  };
}

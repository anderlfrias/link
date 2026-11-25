import env from "../../config/env";
import * as SettingsService from "../settings/settings.service";

/// Nivel de compatibilidad del API que consumen las apps móviles. Es un entero
/// propio, no la versión del backend: sube solo cuando un cambio del API rompe a
/// una app ya publicada, y la app compara este número contra el rango que soporta
/// para pedir que la actualicen (o avisar que la instalación es antigua).
export const MOBILE_API_LEVEL = 1;

export interface InstanceInfo {
  /// Constante: le permite a un cliente confirmar que detrás de la URL hay un LINK.
  app: "link";
  mobileApi: number;
  /// Nombre de la organización que escribió un admin (`AppSettings.organizationName`), o
  /// `null`. Es lo que la app muestra al vincularse, en lugar de una dirección técnica.
  organizationName: string | null;
  features: {
    /// Si la organización acepta el uso de la app móvil (`AppSettings.allowMobileApp`).
    /// Con `false` la app se niega a vincularse.
    mobileApp: boolean;
    /// Si esta instalación puede enviar notificaciones push a apps móviles.
    mobilePush: boolean;
  };
}

/// Lo que `GET /v1/instance` publica sin autenticación. A propósito no incluye la
/// versión del backend ni ningún dato de la instalación o de sus cuentas: es una
/// ruta que cualquiera puede consultar, y la versión exacta le serviría a quien
/// busca instalaciones con una vulnerabilidad conocida.
///
/// El nombre de la organización SÍ es público, pero porque un admin lo escribió para que
/// se vea al vincular la app. Los ajustes salen de la caché de `SettingsService` (se
/// invalida al guardarlos), así que esta ruta no consulta la base en cada pedido.
export async function getInstanceInfo(): Promise<InstanceInfo> {
  const settings = await SettingsService.getPublicSettings();
  return {
    app: "link",
    mobileApi: MOBILE_API_LEVEL,
    organizationName: settings.organizationName,
    features: { mobileApp: settings.allowMobileApp, mobilePush: env.MOBILE_PUSH_ENABLED },
  };
}

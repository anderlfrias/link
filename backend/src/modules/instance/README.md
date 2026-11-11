# Instance

`GET /api/v1/instance` — identificación pública de la instalación, para clientes que todavía no
tienen sesión (una app móvil que se está vinculando con este servidor).

```json
{
  "app": "link",
  "mobileApi": 1,
  "organizationName": "Clínica del Sol",
  "features": { "mobileApp": true, "mobilePush": true }
}
```

## Para qué sirve

LINK es auto-hospedado: una app móvil no trae la dirección de ningún servidor. La persona le da la
URL del sitio (escrita o por QR), la app pide `/.well-known/link-app.json` a la web para saber dónde
está el API, y con esta ruta confirma dos cosas antes de pedir credenciales:

1. que detrás de esa URL hay un LINK (`app: "link"`), y
2. que lo puede usar (`mobileApi`, ver abajo).

## `mobileApi`

Entero definido en `instance.service.ts` (`MOBILE_API_LEVEL`). **No es la versión del backend.**
Sube de a uno solo cuando un cambio del API rompe a una app ya publicada (se quita o renombra un
campo, cambia el significado de un evento de socket). Agregar campos o endpoints no lo sube.

## Qué no devuelve, y por qué

Ni la versión del backend ni nada de sus cuentas. Es una ruta sin autenticación y con el mismo
contenido para cualquiera: la versión exacta le serviría a quien busca instalaciones con una
vulnerabilidad conocida.

Sí devuelve **el nombre de la organización** (`AppSettings.organizationName`), pero porque un admin
lo escribió justamente para que se vea al vincular la app: en lugar de un dominio técnico, la
persona confirma "Clínica del Sol". Es público, y el panel de administración lo avisa. Sin nombre
(`null`) la app muestra el dominio.

## Uso de la app (`features.mobileApp`)

`AppSettings.allowMobileApp` (apagado por defecto, solo lo cambia un admin) es si la organización
acepta el uso de la app móvil. Apagado, la web no muestra "Conectar app móvil" y esta ruta informa
`mobileApp: false`; la app se niega a vincularse. Es un control de la vinculación y de lo que ofrece
la web, no un bloqueo de autenticación: un cliente ya vinculado sigue teniendo el acceso que le dan
sus credenciales.

## Límites

`instanceInfoRateLimiter` (`middlewares/rate-limit.middleware.ts`): por IP. Los ajustes salen de la
caché de `SettingsService` (se invalida al guardarlos), así que la ruta no consulta la base en cada
pedido; el límite evita usarla para generar tráfico.

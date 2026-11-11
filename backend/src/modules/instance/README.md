# Instance

`GET /api/v1/instance` — identificación pública de la instalación, para clientes que todavía no
tienen sesión (una app móvil que se está vinculando con este servidor).

```json
{ "app": "link", "mobileApi": 1, "features": { "mobilePush": true } }
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

Ni la versión del backend, ni el nombre de la organización, ni nada de sus cuentas. Es una ruta sin
autenticación y con el mismo contenido para cualquiera: la versión exacta le serviría a quien busca
instalaciones con una vulnerabilidad conocida.

## Límites

`instanceInfoRateLimiter` (`middlewares/rate-limit.middleware.ts`): por IP. No consulta la base, así
que el límite solo evita usarla para generar tráfico.

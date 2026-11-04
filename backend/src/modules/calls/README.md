# Calls

Llamadas de voz y video uno a uno, dentro de una conversación. El audio y el video viajan por WebRTC entre los dos navegadores; este módulo solo hace de **señalización** (Socket.IO), lleva el **estado** de cada llamada y deja el **registro** en el chat. Todo es por socket: no hay endpoints HTTP.

## Estados de una llamada (`Call.status`)

```text
RINGING ──aceptar──▶ ACCEPTED ──colgar──▶ COMPLETED
   │
   ├─ el receptor rechaza ──▶ REJECTED
   ├─ el receptor está en otra llamada ──▶ BUSY
   └─ cancela el llamante, o vence sin respuesta ──▶ MISSED
```

Mientras una llamada está `RINGING` o `ACCEPTED`, llamante y receptor figuran **ocupados** para cualquier otra (`findActiveCallForUser`). Por eso ninguna llamada puede quedar sonando para siempre (ver "Tiempo de timbrado").

Cada final deja un mensaje de tipo `CALL` en la conversación ("📞 Llamada de voz perdida", "📹 Videollamada rechazada", "finalizada (01:15)"...) y una fila de auditoría `END_CALL` con `{ callType, duration, status }`. Lo crea el servidor; nadie lo escribe a mano.

## Eventos de socket

Los nombres están en `call.socket.ts` (`CALL_EVENTS`); el frontend los repite en `frontend/src/constants/socket-events.ts`.

| Evento | Quién lo manda | Payload | Notas |
|---|---|---|---|
| `call:initiate` | cliente (con ack) | `{ conversationId, receiverId, type }` | Ack `{ ok: true, call }`, o `{ ok: false, isBusy: true }` si el receptor está en otra llamada |
| `call:outgoing` | servidor → el socket que llamó | `{ call }` | |
| `call:incoming` | servidor → **todas** las sesiones del receptor | `{ call }` | Solo le llega a quien está conectado en ese momento |
| `call:sync` | cliente (con ack) | — | Ack `{ ok: true, call }` con la llamada que **suena ahora** para el usuario (como llamante o receptor), o `call: null` |
| `call:accept` | cliente (con ack) | `{ callId }` | Ack `{ ok, call }` |
| `call:accepted` | servidor → el llamante (todas sus sesiones) y el socket que aceptó | `{ call }` | |
| `call:answered-elsewhere` | servidor → las **demás** sesiones del receptor | `{ callId }` | Ya la contestó otra pestaña o dispositivo: dejan de sonar sin colgar nada |
| `call:reject` | cliente (con ack) | `{ callId, reason?, message? }` | `reason`: `declined` (default) o `busy`. `message`: respuesta rápida, ver abajo |
| `call:rejected` | servidor → ambos | `{ call, reason }` | `reason`: `declined`, `busy` o `timeout` (venció sin respuesta) |
| `call:busy` | servidor → el que llamó | `{ call, receiverId, reason }` | |
| `call:signal` | cliente → servidor → el otro participante | `{ callId, targetUserId, signal }` | El destino lo decide el servidor, no el cliente (`authorizeSignal`) |
| `call:end` | cliente (con ack) | `{ callId }` | |
| `call:ended` | servidor → ambos | `{ call }` | |
| `call:error` | servidor → el socket | `{ message }` | Solo mensajes pensados para mostrarse; un error inesperado va con un texto genérico |

Los eventos que van a "todas las sesiones" de un usuario salen a su room `user:<id>`. Un cliente solo actúa sobre una llamada que tiene (mismo `call.id`): las demás pestañas ignoran el evento.

## Una llamada la lleva un socket

Quien inicia una llamada, y quien la acepta, la "lleva" en `socket.data.activeCallId`. Solo la caída de **ese** socket termina la llamada (`disconnecting`). Un usuario puede tener varias pestañas: cerrar o reconectar una que no participa no puede cortar la llamada de otra, ni rechazar una llamada que todavía suena y que el receptor ni vio. Si la llamada ya terminó (la rechazaron, venció), no se vuelve a cerrar ni a avisar.

## Tiempo de timbrado

`CALL_RING_TIMEOUT_MS` (`call.constants.ts`, **45 s**) es cuánto suena una llamada. Es un solo valor para todo:

- **El worker** `workers/call-ring-timeout.worker.ts` corre cada 5 s y pasa a `MISSED` las llamadas `RINGING` que empezaron hace más. Deja el registro "perdida" en el chat (que además le llega por push al receptor si no está conectado) y avisa a los dos con `call:rejected` y `reason: "timeout"`. El cambio de estado es condicional (`markMissedIfRinging`): si el receptor la aceptó justo antes, no la pisa. Es un worker y no un timer por llamada para que también libere las que quedaron huérfanas tras un reinicio del servidor.
- **Aceptar** una llamada que sigue `RINGING` pero ya venció se rechaza ("La llamada ya no está disponible"): el worker puede tardar hasta 5 s en pasarla a perdida.
- **El push** de llamada lleva ese tiempo como `TTL` y en `ringMs` (ver abajo).
- **El frontend** (`CALL_RING_SAFETY_MS`) tiene un tope de seguridad un poco mayor, por si se pierde el aviso del servidor.

El valor del frontend (`features/calls/constants/call.constants.ts`) se repite a mano: no hay un paquete compartido.

## Llamada que suena cuando la app no está abierta

`call:incoming` solo llega a quien está conectado en el momento de llamar. Quien recibe la llamada con la app cerrada solo ve el push; al tocarlo abre la app, y para entonces el evento ya pasó. Por eso el cliente **pregunta**: `call:sync` devuelve la llamada que suena ahora (`getPendingCall`: `RINGING` y empezada hace menos de `CALL_RING_TIMEOUT_MS`). El frontend lo hace al conectar, al recuperar la conexión y cuando la pestaña vuelve a estar visible (el navegador frena los timers de las pestañas en segundo plano y el socket puede caerse sin avisar), y muestra el modal para contestar o rechazar.

Es una consulta con acknowledgement, y no un envío del servidor al conectar, para no depender de que los listeners del cliente ya estén registrados cuando el servidor emite.

## Rechazar con una respuesta rápida

`call:reject` acepta un `message` opcional (texto de hasta `CALL_REPLY_MAX_LENGTH` = 200 caracteres, recortado). Si quien rechaza es el receptor y el motivo es `declined`, el texto sale como un **mensaje normal suyo** en la conversación, después del registro "Llamada rechazada" (`sendDeclineReply`, que usa `sendMessage`): lo ve el llamante, le llega por push si no está conectado y respeta las reglas de cualquier mensaje. No se manda si cancela el llamante, ni con `busy`, ni si la llamada ya no sonaba. Si enviarlo falla, el rechazo ya está hecho y solo queda una línea de log.

El frontend ofrece las cuatro respuestas de siempre (las de Android) y una libre: ver `IncomingCallModal.tsx`.

## Push de llamada entrante

`initiateCall` avisa por Web Push al receptor (`pushIncomingCall`, `kind: "call"`), con `TTL` igual al tiempo de timbrado y `urgency: "high"`. Sin TTL el servicio push guarda el aviso 4 semanas y un dispositivo sin conexión lo mostraba al volver, horas después de que la llamada terminó. El payload lleva `ringMs`, la duración restante en relativo (no una hora absoluta, para no depender del reloj del dispositivo), y el service worker (`frontend/public/sw.js`) deja la notificación visible ese tiempo.

Al tocarla, el service worker trae al frente una ventana de la app (sin recargarla ni abrir otra) o, si no hay ninguna, abre una; la llamada la muestra el modal global.

Una llamada **perdida** deja además un mensaje en la conversación, que genera su propio push como cualquier mensaje para quien no está conectado: no hace falta un push aparte de "llamada perdida".

## Privacidad

El texto de una respuesta rápida es contenido de un mensaje: nunca se loguea (`LOGGING_PLAN.md` §4.1). Por eso `call:reject` loguea de un error de validación solo su mensaje, y `sendDeclineReply` solo un motivo genérico.

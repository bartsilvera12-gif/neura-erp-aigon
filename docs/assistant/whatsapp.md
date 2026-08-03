# WhatsApp: Canales, Plantillas y Campañas

## Objetivo

Conectar los números de WhatsApp Business de la empresa al ERP (vía **Meta Cloud API** o
**YCloud**), recibir mensajes entrantes por webhook y enviar mensajes individuales, respuestas
de bot y **campañas masivas con plantillas aprobadas**.

## Explicación funcional

### Canales

- Se administran en `Configuración → Canales` (`/configuracion/canales`).
- Un canal = un número de WhatsApp con su proveedor (Meta o YCloud), Business Account ID y
  token de acceso. Cada canal puede vincularse a colas de atención y tener respuestas rápidas
  propias.
- Los mensajes entrantes llegan por **webhooks** (`/api/webhooks/whatsapp` y rutas de proveedor).

### Plantillas (templates)

- Para iniciar conversación o escribir **fuera de la ventana de 24 horas**, WhatsApp exige
  plantillas pre-aprobadas por Meta (categorías marketing/transaccional, con variables).
- El ERP sincroniza las plantillas del canal (`/api/campanas/templates/sync`) y guarda su estado
  (aprobada/rechazada/desconocida).

### Campañas

| Ruta | Pantalla |
|---|---|
| `/dashboard/campanas` | Listado de campañas con estado (borrador, lista, enviando, enviada, cancelada) y métricas de entrega |
| `/dashboard/campanas/nuevo` | Crear campaña |
| `/dashboard/campanas/[id]` | Detalle: destinatarios, variables, resultados |

- **Campaña:** plantilla + lista de destinatarios + mapeo de variables (ej. `{{1}}` → nombre del
  contacto). Destinatarios por importación o desde **etiquetas** (segmentos).
- Botones de plantilla pueden tener acciones (link, respuesta rápida, callback).
- Tracking de envío: enviados, entregados, fallidos; las respuestas entran al Inbox.

### Integraciones relacionadas

- **n8n + WhatsApp → CRM:** un webhook puede crear leads automáticamente en el CRM
  (`docs/WHATSAPP_CRM_AUTOMATION.md`).
- **Sorteos:** la venta de boletos por WhatsApp usa los flujos bot (ver `sorteos.md`).

## Casos de uso

- Lanzar una campaña de promoción a todos los contactos etiquetados "interesado-plan-premium".
- Reconectar con clientes inactivos usando una plantilla aprobada.
- Atender las respuestas de la campaña directamente en el Inbox.

## Flujo paso a paso — Crear y lanzar una campaña

1. **Campañas → Nueva** (`/dashboard/campanas/nuevo`).
2. Elegir canal y plantilla (debe estar **aprobada** por Meta).
3. Cargar destinatarios (importación o etiqueta) y mapear las variables de la plantilla.
4. Validar la campaña (el sistema verifica variables y números).
5. Lanzar (o programar). Seguir el progreso de entregas en el detalle.

## Preguntas frecuentes

- **¿Por qué mi mensaje libre no llega?** Fuera de la ventana de 24 h desde el último mensaje del
  cliente solo se pueden enviar plantillas aprobadas.
- **¿Cuánto tarda la aprobación de una plantilla?** La define Meta (minutos a días). El estado se
  ve tras sincronizar plantillas.
- **¿Puedo usar varios números?** Sí, un canal por número; cada uno con sus colas y plantillas.
- **¿Las respuestas de la campaña dónde caen?** En el Inbox omnicanal, ruteadas por cola.

## Errores comunes

- *Plantilla rechazada:* revisar políticas de contenido de Meta y volver a enviarla.
- *Variables sin completar:* la validación de campaña falla; mapear todas las variables.
- *Token vencido / canal desconectado:* reconfigurar el canal en Configuración → Canales.
- *Números inválidos en la importación:* corregir formato internacional (+595…).

## Capturas relacionadas

- `screenshots/marketing/02-campanas.png` — listado de campañas.
- `screenshots/marketing/03-form-nueva-campana.png` — alta de campaña.
- `screenshots/marketing/06-detalle-campana.png` — modal de detalle de campaña.
- `screenshots/configuracion/04-canales.png` — canales conectados.

# CRM Funnel

## Objetivo

Gestionar prospectos (leads) desde la captación hasta el cierre, en un pipeline visual tipo
Kanban, y convertir los ganados en clientes con un clic.

## Explicación funcional

- **Ruta principal:** `/crm` — tablero Kanban con columnas por etapa.
- **Etapas estándar:** `LEAD → CONTACTADO → NEGOCIACIÓN → GANADO / PERDIDO`
  (configurables en `/configuracion/crm`). En producción se observó además una etapa
  personalizada **"Charlando"** entre Contactado y Negociación — confirma que cada empresa
  puede tener su propio pipeline.
- Cada tarjeta muestra: empresa/contacto, valor estimado, próxima acción y su fecha.
- **Origen del prospecto:** MANUAL, FORMULARIO, WHATSAPP (vía webhook n8n), CRM, VENTA.
- Detalle del prospecto (`/crm/[id]`): datos, notas con autor y fecha, historial, botón
  "crear cliente" cuando está ganado.

## Casos de uso

- Un lead entra automáticamente desde WhatsApp (integración n8n → `/api/crm/leads`) y aparece
  en la columna LEAD con el mensaje como nota.
- El vendedor arrastra la tarjeta a CONTACTADO después de la primera llamada.
- En NEGOCIACIÓN actualiza el valor estimado y agenda la próxima acción.
- Al ganar, crea el cliente automáticamente (origen CRM) y arranca la facturación.

## Flujos paso a paso

### Cargar un prospecto manual
1. **CRM → Nuevo** (`/crm/nuevo`).
2. Completar empresa, contacto, teléfono, email, servicio de interés y valor estimado.
3. Guardar → la tarjeta aparece en LEAD.

### Avanzar el pipeline
1. En `/crm`, arrastrar la tarjeta a la etapa siguiente (drag & drop).
2. Registrar notas de cada interacción desde el detalle.
3. Definir "próxima acción" y fecha para no perder seguimiento.

### Convertir en cliente
1. Mover el prospecto a **GANADO**.
2. En el detalle, usar **Crear cliente** → se crea el cliente con origen CRM y queda vinculado.

## Preguntas frecuentes

- **¿Puedo personalizar las etapas?** Sí, en Configuración → CRM (nombres y orden).
- **¿Cómo entran los leads de WhatsApp?** Vía integración n8n: el webhook recibe el mensaje y
  llama a la API de leads; el prospecto entra con origen WHATSAPP.
- **¿Qué pasa con los perdidos?** Quedan en la columna PERDIDO con su historial (no se borran).
- **¿El valor estimado afecta algo?** Alimenta los KPIs comerciales del dashboard (valor en
  negociación, top productos en negociación).

## Errores comunes

- Prospecto duplicado: si el mismo teléfono escribe de nuevo, revisar si ya existe antes de crear.
- No aparece el botón de crear cliente: el prospecto debe estar en etapa GANADO.

## Capturas relacionadas

- `screenshots/crm/01-pipeline.png` — Kanban del funnel.
- `screenshots/crm/02-form-nuevo-prospecto.png` — alta de prospecto.

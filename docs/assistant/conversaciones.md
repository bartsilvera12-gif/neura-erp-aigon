# Conversaciones (Omnicanal)

## Objetivo

Atender en un solo lugar todas las conversaciones de los canales de mensajería de la empresa
(WhatsApp principalmente), con colas de atención, agentes, monitoreo en tiempo real, historial y
flujos automáticos (bots).

## Explicación funcional

### Pantallas

| Ruta | Pantalla |
|---|---|
| `/dashboard/conversaciones` | **Inbox**: lista de chats + panel de conversación. Filtros por canal, cola y asignación; búsqueda por nombre o número |
| `/dashboard/conversaciones-finalizadas` | Conversaciones cerradas (con motivo de cierre) |
| `/dashboard/historial-omnicanal` | Búsqueda global de interacciones históricas |
| `/dashboard/monitoreo` | Supervisión en tiempo real: colas, agentes (disponible/ocupado/receso/offline), SLA, tiempos de espera |
| `/dashboard/colas-agentes` | Redirige a Monitoreo (alias) |
| `/dashboard/conversaciones/flujos` | Gestor de flujos bot |
| `/dashboard/conversaciones/flujos/[code]` | Editor visual del flujo (nodos, opciones, reglas de recontacto) |

### Conceptos

- **Canal:** una conexión de mensajería (WhatsApp vía Meta Cloud API o YCloud). Se administran en
  `Configuración → Canales`.
- **Conversación:** hilo con un contacto; estados `nueva → asignada → esperando respuesta →
  resuelta → cerrada`. Puede estar en manos del **bot** (sesión de flujo activa) o de un **agente**.
- **Cola:** grupo de atención con prioridad, SLA objetivo y **taxonomía de cierre** (motivos:
  resolución, escalación, sin interés, datos incompletos, etc.). Los agentes se asignan a colas.
- **Ruteo:** un mensaje entrante sin agente se asigna automáticamente a una cola y a un agente
  disponible según prioridad y carga.
- **Estado del agente:** disponible / ocupado / en receso / offline, con horarios de trabajo
  configurables (`Configuración → Horarios omnicanal`).
- **Flujos (bots):** secuencias de nodos — mensaje de texto, botones, captura de texto, captura
  de imagen (con OCR), llamada HTTP, fin — con variables capturadas por sesión y **reglas de
  recontacto** (reintentos automáticos si el cliente abandona).
- **Takeover:** un agente puede intervenir manualmente una conversación que está en un flujo bot.
- **Etiquetas:** clasificación manual o por reglas de los contactos/conversaciones; permiten
  segmentar audiencias y crear campañas desde una etiqueta.

## Casos de uso

- Cliente escribe al WhatsApp de la empresa → el bot lo recibe, captura datos y deriva a la cola
  de ventas → un agente disponible lo atiende → cierra con motivo "resolución".
- El supervisor mira Monitoreo para ver cuántos chats esperan y qué agentes están disponibles.
- Soporte busca en el historial qué se le respondió a un número hace dos semanas.

## Flujos paso a paso

### Atender una conversación
1. Entrar al Inbox (`/dashboard/conversaciones`).
2. Filtrar por cola o asignación ("Mías") y abrir el chat.
3. Responder (texto o adjuntos). Usar respuestas rápidas si el canal las tiene configuradas.
4. Al terminar, cerrar la conversación eligiendo el **motivo de cierre** de la taxonomía.

### Crear/editar un flujo bot
1. Ir a **Conversaciones → Flujos**.
2. Crear flujo (nombre y código) o abrir uno existente.
3. Agregar nodos (mensajes, botones, capturas) y conectar las transiciones.
4. Probar con "test de flujo" antes de activarlo.

## Preguntas frecuentes

- **¿Por qué no veo chats en el Inbox?** Verificar el filtro de cola/asignación y que su usuario
  esté asignado a alguna cola (el encabezado avisa "Sin puesto en colas").
- **¿Cómo dejo de recibir chats?** Cambiar su estado a "en receso" u "offline" (según política
  del equipo y horarios configurados).
- **¿El bot puede pasarme la conversación?** Sí: por opción del flujo (derivación) o por takeover
  manual del agente.
- **¿Qué pasa fuera del horario laboral?** Aplican los horarios de trabajo configurados; los
  mensajes quedan en cola para el siguiente turno.

## Errores comunes

- *El cliente no recibe mensajes:* en WhatsApp, fuera de la ventana de 24 h solo pueden enviarse
  **plantillas aprobadas** (ver `whatsapp.md`).
- *Conversación "pegada" en bot:* usar takeover o reenviar el nodo actual (acción de reenvío).
- *Sin acceso al Inbox:* el módulo `conversaciones`/`omnicanal` no está habilitado, o el usuario
  no tiene puesto en colas.

## Capturas relacionadas

- `screenshots/conversaciones/01-inbox.png` — inbox con filtros.
- `screenshots/conversaciones/02-finalizadas.png` — cerradas.
- `screenshots/conversaciones/03-historial-omnicanal.png` — historial global.
- `screenshots/conversaciones/04-monitoreo.png` — monitoreo en tiempo real.
- `screenshots/conversaciones/06-flujos.png` — gestor de flujos bot (alta con ID interno,
  copiar pasos desde otro flujo, listado con canal/estado/nodos/sorteo vinculado).
- `screenshots/conversaciones/07-editor-flujo.png` — editor de flujo: pasos con tipo de nodo
  (mensaje con imagen, botones, capturas), siguiente paso, advertencias del grafo y tab de
  automatizaciones.
- `screenshots/configuracion/05-colas.png` — configuración de colas.

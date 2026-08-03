# Proyectos

## Objetivo

Gestionar proyectos por cliente en un tablero Kanban con estados personalizables, tareas con
responsables y archivos adjuntos, y control de SLA (tiempo objetivo por estado).

## Explicación funcional

| Ruta | Pantalla |
|---|---|
| `/dashboard/proyectos` | Tablero Kanban (columnas = estados configurados por la empresa) |
| `/dashboard/proyectos/nuevo` | Alta de proyecto |
| `/dashboard/proyectos/[id]` | Detalle: datos, tareas, archivos, historial de actividades |
| `/configuracion/proyectos` | Configuración de tipos, estados (color, orden, SLA) y prioridades |

### Conceptos

- **Proyecto:** cliente, nombre, tipo (catálogo propio de la empresa), estado, fechas de inicio
  y límite, SLA objetivo en horas.
- **Estados configurables:** cada estado define color, orden, si **cuenta SLA** y de qué tipo
  (interno / cliente / pausado / final), cuál es inicial y cuáles finales. Las transiciones
  válidas entre estados también se configuran.
- **Tareas:** título, descripción, responsable, fecha límite, prioridad (baja/media/alta),
  subtareas y **archivos adjuntos** (Supabase Storage).
- **Auditoría:** log de actividades (creación, cambios de estado, asignaciones) con usuario y fecha.
- Actualización en tiempo real (Realtime) del tablero.

## Casos de uso

- Implementación de un servicio para un cliente nuevo, con tareas por área.
- Mesa de soporte que mide cuánto tiempo está un ticket "esperando al cliente" (SLA tipo cliente)
  vs "en trabajo interno" (SLA interno).
- PMO que define su propio flujo de estados (ej. Backlog → En curso → QA → Entregado).

## Flujos paso a paso

### Crear un proyecto
1. **Proyectos → Nuevo** (`/dashboard/proyectos/nuevo`).
2. Elegir cliente, tipo de proyecto y completar nombre/descripcón y fechas.
3. Guardar → la tarjeta aparece en el estado inicial del tablero.

### Trabajar el tablero
1. Arrastrar la tarjeta entre columnas para cambiar de estado (solo transiciones permitidas).
2. Dentro del proyecto, crear tareas y asignar responsables y prioridades.
3. Adjuntar archivos a las tareas cuando corresponda.

### Configurar estados y SLA
1. **Configuración → Proyectos**.
2. Definir estados (nombre, color, orden), marcar cuáles cuentan SLA y el objetivo en horas.
3. Definir prioridades disponibles.

## Preguntas frecuentes

- **¿Puedo tener flujos distintos por tipo de proyecto?** Los tipos son configurables; los
  estados son por empresa.
- **¿Quién puede mover tarjetas?** Usuarios con el módulo `proyectos` habilitado.
- **¿Dónde quedan los archivos?** En el almacenamiento del sistema, vinculados a la tarea.
- **¿Cómo sé si me pasé del SLA?** El proyecto acumula tiempo en los estados que "cuentan SLA";
  el tablero/detalle lo evidencia respecto del objetivo.

## Errores comunes

- No puedo mover una tarjeta a cierto estado: la transición no está permitida por configuración.
- No aparece un estado en el tablero: revisar orden/activación en Configuración → Proyectos.

## Capturas relacionadas

- `screenshots/proyectos/01-kanban.png` — tablero Kanban.
- `screenshots/proyectos/02-form-nuevo-proyecto.png` — alta de proyecto.
- `screenshots/proyectos/03-detalle-proyecto.png` — detalle con tareas e historial.
- `screenshots/configuracion/09-proyectos.png` — configuración de estados/prioridades.

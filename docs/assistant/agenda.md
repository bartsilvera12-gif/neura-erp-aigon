# Agenda

## Objetivo

Agendar y administrar citas (reuniones, consultas, seguimientos) vinculadas a clientes o
prospectos, con vistas de calendario y prevención de superposiciones por responsable.

## Explicación funcional

- **Ruta:** `/dashboard/agenda`.
- **Vistas:** Día (timeline horario), Semana (grilla), Mes (calendario) y Listado (tabla
  filtrable por responsable, estado y rango de fechas).
- **Cita:** título, tipo (reunión/consulta/seguimiento), cliente o prospecto (o contacto manual
  con nombre y teléfono), responsable, inicio y fin, ubicación, observaciones.
- **Estados:** `pendiente → confirmada → completada / cancelada` (la cancelación pide motivo;
  una cita puede reprogramarse quedando vinculada a la original).
- **Validaciones:** fin > inicio; **no se permiten superposiciones** para el mismo responsable
  (el sistema responde con conflicto 409); rango horario laboral configurable.
- El modal de cita usa el lenguaje visual del ERP (teal #4FAEB2).
- Resumen "Hoy": próxima cita y total del día.

## Casos de uso

- Agendar la visita técnica de instalación para un cliente nuevo.
- El vendedor agenda seguimiento con un prospecto del CRM.
- Recepción reprograma una cita cancelada por el cliente.

## Flujos paso a paso

### Crear una cita
1. En `/dashboard/agenda`, clic en un horario libre (o botón Nueva cita).
2. Completar título, tipo y asociar cliente/prospecto (o contacto manual).
3. Elegir responsable, fecha/hora de inicio y fin, ubicación.
4. Guardar. Si el responsable ya tiene una cita en ese horario, el sistema lo rechaza.

### Reprogramar / cancelar
1. Abrir la cita → cambiar fecha/hora (queda referencia a la original) o cancelar con motivo.

## Preguntas frecuentes

- **¿Puedo ver solo mis citas?** Sí, filtrando por responsable en la vista de lista/semana.
- **¿La agenda envía recordatorios por WhatsApp?** Está previsto como evolución; verificar
  disponibilidad en su versión.
- **¿Por qué no puedo agendar a las 22:00?** El rango horario visible/configurado es laboral
  (p. ej. 08–18); es configurable.

## Errores comunes

- *Conflicto de horario (409):* el responsable ya tiene otra cita en ese rango.
- *Fin anterior al inicio:* corregir las horas.

## Capturas relacionadas

- `screenshots/agenda/01-calendario.png` — vista Semana con citas reales y chips de estado.
- `screenshots/agenda/02-vista-mes.png` — vista Mes.
- `screenshots/agenda/03-vista-listado.png` — vista Listado.
- `screenshots/agenda/04-vista-dia.png` — vista Día.
- `screenshots/agenda/05-modal-nueva-cita.png` — modal Nueva cita (título, responsable, tipo,
  estado, fecha/hora con presets de duración, cliente existente o contacto nuevo, ubicación).

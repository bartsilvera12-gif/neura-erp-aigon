-- Corpus del asistente — generado por scripts/assistant-ingest.ts (15 documentos)

-- Refresh completo: borra el corpus anterior e inserta el actual. NO toca conversaciones.

begin;

delete from neura.assistant_kb_chunks;

delete from neura.assistant_kb_documents;

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$agenda$KB$, $KB$agenda$KB$, $KB$Agenda$KB$, $KB$docs/assistant/agenda.md$KB$, $KB$485830485cd6406b4b4ff1ea5e8936d2c4e6f630f984ccaadff4cd64259f4af3$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$agenda$KB$, $KB$Agenda$KB$, $KB$# Agenda$KB$, '{}'::text[], 0),
    ($KB$agenda$KB$, $KB$Agenda › Objetivo$KB$, $KB$Agendar y administrar citas (reuniones, consultas, seguimientos) vinculadas a clientes o
prospectos, con vistas de calendario y prevención de superposiciones por responsable.$KB$, '{}'::text[], 1),
    ($KB$agenda$KB$, $KB$Agenda › Explicación funcional$KB$, $KB$- **Ruta:** `/dashboard/agenda`.
- **Vistas:** Día (timeline horario), Semana (grilla), Mes (calendario) y Listado (tabla
  filtrable por responsable, estado y rango de fechas).
- **Cita:** título, tipo (reunión/consulta/seguimiento), cliente o prospecto (o contacto manual
  con nombre y teléfono), responsable, inicio y fin, ubicación, observaciones.
- **Estados:** `pendiente → confirmada → completada / cancelada` (la cancelación pide motivo;
  una cita puede reprogramarse quedando vinculada a la original).
- **Validaciones:** fin > inicio; **no se permiten superposiciones** para el mismo responsable
  (el sistema responde con conflicto 409); rango horario laboral configurable.
- El modal de cita usa el lenguaje visual del ERP (teal #4FAEB2).
- Resumen "Hoy": próxima cita y total del día.$KB$, '{}'::text[], 2),
    ($KB$agenda$KB$, $KB$Agenda › Casos de uso$KB$, $KB$- Agendar la visita técnica de instalación para un cliente nuevo.
- El vendedor agenda seguimiento con un prospecto del CRM.
- Recepción reprograma una cita cancelada por el cliente.$KB$, '{}'::text[], 3),
    ($KB$agenda$KB$, $KB$Agenda › Flujos paso a paso$KB$, $KB$### Crear una cita
1. En `/dashboard/agenda`, clic en un horario libre (o botón Nueva cita).
2. Completar título, tipo y asociar cliente/prospecto (o contacto manual).
3. Elegir responsable, fecha/hora de inicio y fin, ubicación.
4. Guardar. Si el responsable ya tiene una cita en ese horario, el sistema lo rechaza.

### Reprogramar / cancelar
1. Abrir la cita → cambiar fecha/hora (queda referencia a la original) o cancelar con motivo.$KB$, '{}'::text[], 4),
    ($KB$agenda$KB$, $KB$Agenda › Preguntas frecuentes$KB$, $KB$- **¿Puedo ver solo mis citas?** Sí, filtrando por responsable en la vista de lista/semana.
- **¿La agenda envía recordatorios por WhatsApp?** Está previsto como evolución; verificar
  disponibilidad en su versión.
- **¿Por qué no puedo agendar a las 22:00?** El rango horario visible/configurado es laboral
  (p. ej. 08–18); es configurable.$KB$, '{}'::text[], 5),
    ($KB$agenda$KB$, $KB$Agenda › Errores comunes$KB$, $KB$- *Conflicto de horario (409):* el responsable ya tiene otra cita en ese rango.
- *Fin anterior al inicio:* corregir las horas.$KB$, '{}'::text[], 6),
    ($KB$agenda$KB$, $KB$Agenda › Capturas relacionadas$KB$, $KB$- `screenshots/agenda/01-calendario.png` — vista Semana con citas reales y chips de estado.
- `screenshots/agenda/02-vista-mes.png` — vista Mes.
- `screenshots/agenda/03-vista-listado.png` — vista Listado.
- `screenshots/agenda/04-vista-dia.png` — vista Día.
- `screenshots/agenda/05-modal-nueva-cita.png` — modal Nueva cita (título, responsable, tipo,
  estado, fecha/hora con presets de duración, cliente existente o contacto nuevo, ubicación).$KB$, array[$KB$screenshots/agenda/01-calendario.png$KB$, $KB$screenshots/agenda/02-vista-mes.png$KB$, $KB$screenshots/agenda/03-vista-listado.png$KB$, $KB$screenshots/agenda/04-vista-dia.png$KB$, $KB$screenshots/agenda/05-modal-nueva-cita.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$clientes$KB$, $KB$clientes$KB$, $KB$Clientes y Gestión de Clientes$KB$, $KB$docs/assistant/clientes.md$KB$, $KB$8327d06cbd65175aa7d979abe1f60cded65c56892e7969207a9a685f32910410$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes$KB$, $KB$# Clientes y Gestión de Clientes$KB$, '{}'::text[], 0),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Objetivo$KB$, $KB$Mantener la base centralizada de clientes (empresas o personas) con sus datos comerciales,
fiscales y de facturación, y dar al equipo de cobranzas un panel rápido de estado de cuenta.$KB$, '{}'::text[], 1),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Explicación funcional$KB$, $KB$### Pantallas

| Ruta | Pantalla |
|---|---|
| `/clientes` | Listado con búsqueda y filtros (estado, tipo, origen, vendedor, plan) |
| `/clientes/nuevo` | Alta de cliente |
| `/clientes/[id]` | Ficha del cliente (se abre como **modal** sobre el listado): tabs Información, Estado de cuenta, Suscripciones, Proyectos, Actividad, Notas; acciones Nueva suscripción, Factura al contado, Registrar pago, Dar de baja |
| `/clientes/[id]/tipificacion` | Registrar gestión (consulta, reclamo, promesa de pago, etc.) |
| `/gestion-clientes` | Panel de cobranzas: lista de clientes a la izquierda, facturas pendientes del seleccionado a la derecha |

### Datos del cliente

- Tipo: **empresa** o **persona**; razón social / nombre de contacto; RUC o documento.
- Contacto: teléfono, email, dirección, ciudad, país.
- Comercial: condición de pago (contado, 30 días…), moneda preferida (GS/USD), vendedor asignado,
  plan comercial.
- Fiscal (SIFEN): perfil tributario (emisor, sujeto exento, responsable excluido, receptor
  extranjero, receptor manual) y obligaciones tributarias.
- Origen: MANUAL, CRM (prospecto ganado) o VENTA.
- Estado: activo / inactivo (**baja operativa** = soft delete con auditoría).$KB$, '{}'::text[], 2),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Casos de uso$KB$, $KB$- Alta de un cliente nuevo que llegó por recomendación (origen MANUAL).
- Conversión automática desde CRM cuando un prospecto pasa a GANADO.
- Cobranzas revisa en `/gestion-clientes` quiénes tienen facturas vencidas y registra
  tipificaciones (promesa de pago, reclamo).
- Cambio de plan de un cliente de suscripción.$KB$, '{}'::text[], 3),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Flujos paso a paso$KB$, $KB$### Crear un cliente
1. Ir a **Clientes → Nuevo** (`/clientes/nuevo`).
2. Elegir tipo (empresa/persona) y completar identificación (RUC/documento).
3. Completar datos de contacto y condiciones comerciales (moneda, condición de pago, vendedor).
4. Guardar. El cliente queda **activo** y disponible para ventas/facturas.

### Registrar una tipificación (gestión)
1. Abrir la ficha del cliente → botón de tipificación.
2. Elegir tipo de gestión (Consulta / Reclamo / Seguimiento / Promesa de pago / Soporte / Cambio de plan).
3. Registrar resultado y notas. Queda en el historial con usuario y fecha.

### Dar de baja (baja operativa)
1. Ficha del cliente → acción de baja operativa.
2. El cliente pasa a **inactivo**; no se borra (queda auditoría e historial).$KB$, '{}'::text[], 4),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Preguntas frecuentes$KB$, $KB$- **¿Puedo eliminar un cliente definitivamente?** Existe una previsualización de eliminación que
  valida dependencias (facturas, pagos); si tiene movimientos se recomienda baja operativa.
- **¿Quién puede ver mis clientes?** Solo usuarios de su misma empresa (aislamiento por RLS).
- **¿Para qué sirve el perfil tributario?** Define cómo se emite la factura electrónica SIFEN
  para ese cliente (tipo de receptor).
- **¿Qué diferencia hay entre Clientes y Gestión de Clientes?** Clientes es el maestro de datos;
  Gestión de Clientes es el panel operativo de cobranza (facturas pendientes, deuda, gestiones).$KB$, '{}'::text[], 5),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Errores comunes$KB$, $KB$- RUC/documento duplicado: el sistema avisa si ya existe un cliente con esa identificación.
- No aparece el cliente en una venta: verificar que esté **activo**.
- No se puede facturar electrónicamente: falta completar el perfil tributario del cliente.$KB$, '{}'::text[], 6),
    ($KB$clientes$KB$, $KB$Clientes y Gestión de Clientes › Capturas relacionadas$KB$, $KB$- `screenshots/clientes/01-listado.png` — listado y filtros.
- `screenshots/clientes/02-form-nuevo.png` — formulario de alta.
- `screenshots/clientes/03-gestion-clientes.png` — panel de cobranzas.
- `screenshots/clientes/04-detalle-cliente.png` — modal de ficha del cliente (tabs y acciones).
- `screenshots/clientes/05-gestion-cliente-seleccionado.png` — gestión con cliente seleccionado.$KB$, array[$KB$screenshots/clientes/01-listado.png$KB$, $KB$screenshots/clientes/02-form-nuevo.png$KB$, $KB$screenshots/clientes/03-gestion-clientes.png$KB$, $KB$screenshots/clientes/04-detalle-cliente.png$KB$, $KB$screenshots/clientes/05-gestion-cliente-seleccionado.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$compras$KB$, $KB$compras$KB$, $KB$Compras, Proveedores y Gastos$KB$, $KB$docs/assistant/compras.md$KB$, $KB$0e2888fc08756930de703cd2e8a7ba3f18a170d16e4b0922a64a61bd072a93c9$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos$KB$, $KB$# Compras, Proveedores y Gastos

> ⚠️ **Nota de auditoría:** Compras y Proveedores no estaban habilitados para el usuario tester
> en producción (sin capturas). Gastos sí fue auditado visualmente.$KB$, '{}'::text[], 0),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Objetivo$KB$, $KB$Registrar el ciclo de abastecimiento: proveedores, órdenes de compra (que alimentan el
inventario y el costo promedio) y gastos operativos de la empresa.$KB$, '{}'::text[], 1),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Explicación funcional$KB$, $KB$### Compras

| Ruta | Pantalla |
|---|---|
| `/compras` | Listado de compras (filtros por proveedor, estado), exportación |
| `/compras/nueva` | Nueva compra: proveedor + producto + cantidad + costo + IVA (exenta/5/10) + tipo de pago |

- Al guardar una compra se genera un movimiento de **ENTRADA** en inventario y se recalcula el
  costo promedio del producto. Puede calcular el precio de venta sugerido por margen.

### Proveedores

| Ruta | Pantalla |
|---|---|
| `/proveedores` | Listado (nombre, RUC, contacto, condición de pago) |
| `/proveedores/nuevo` / `/proveedores/[id]/editar` | Alta / edición |
| `/proveedores/categorias` | Rubros/categorías de proveedores |

### Gastos

| Ruta | Pantalla |
|---|---|
| `/gastos` | Listado por período y categoría |
| `/gastos/nuevo` / `/gastos/[id]/editar` | Alta / edición |

- Gasto: categoría, descripción, monto, tipo (**fijo/variable**), recurrente (sí/no) y
  frecuencia (mensual/trimestral), fecha y usuario.$KB$, '{}'::text[], 2),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Casos de uso$KB$, $KB$- Reposición de stock: compra al proveedor habitual a crédito 30 días.
- Carga del alquiler como gasto fijo mensual recurrente.
- Análisis de gastos variables del trimestre.$KB$, '{}'::text[], 3),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Flujos paso a paso$KB$, $KB$### Registrar una compra
1. **Compras → Nueva** (`/compras/nueva`).
2. Elegir proveedor y producto; ingresar cantidad y costo unitario.
3. Elegir tipo de IVA y tipo de pago (contado/crédito).
4. Guardar → entrada de inventario + costo promedio actualizado.

### Registrar un gasto
1. **Gastos → Nuevo** (`/gastos/nuevo`).
2. Completar categoría, descripción, monto y tipo (fijo/variable).
3. Marcar recurrente si corresponde, con su frecuencia. Guardar.$KB$, '{}'::text[], 4),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Preguntas frecuentes$KB$, $KB$- **¿La compra actualiza el precio de venta?** Puede sugerirlo por margen, pero el precio lo
  controla el producto en Inventario.
- **¿Puedo exportar las compras?** Sí, desde el listado (exportación a Excel).
- **¿Los gastos recurrentes se generan solos?** La recurrencia queda registrada para reportes;
  verificar la generación automática según versión.$KB$, '{}'::text[], 5),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Errores comunes$KB$, $KB$- Compra sin proveedor: dar de alta el proveedor primero.
- "Sin acceso": módulos `compras`/`gastos` no habilitados para la empresa o usuario.$KB$, '{}'::text[], 6),
    ($KB$compras$KB$, $KB$Compras, Proveedores y Gastos › Capturas relacionadas$KB$, $KB$- `screenshots/gastos/01-listado.png` — listado de gastos.
- `screenshots/gastos/02-form-nuevo-gasto.png` — alta de gasto.
- Compras/Proveedores: pendientes (módulo no habilitado para el tester).$KB$, array[$KB$screenshots/gastos/01-listado.png$KB$, $KB$screenshots/gastos/02-form-nuevo-gasto.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$configuracion$KB$, $KB$configuracion$KB$, $KB$Configuración$KB$, $KB$docs/assistant/configuracion.md$KB$, $KB$3ee31a36a63843b493496e2beae7c5748f335423fe777298f2ba0d234a231393$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$configuracion$KB$, $KB$Configuración$KB$, $KB$# Configuración$KB$, '{}'::text[], 0),
    ($KB$configuracion$KB$, $KB$Configuración › Objetivo$KB$, $KB$Centralizar la parametrización de la empresa: datos de facturación, facturación electrónica
SIFEN, canales de WhatsApp, colas y equipos de atención, CRM, comisiones, proyectos, métricas y
preferencias.$KB$, '{}'::text[], 1),
    ($KB$configuracion$KB$, $KB$Configuración › Explicación funcional$KB$, $KB$| Ruta | Sección | Qué se configura |
|---|---|---|
| `/configuracion` | Hub | Accesos a todas las secciones |
| `/configuracion/facturacion` | Facturación | Prefijo y secuencia de facturas, días de vencimiento, modo (contado/crédito) |
| `/configuracion/facturacion-electronica` | SIFEN | Ambiente (test/producción), RUC, razón social, timbrado y fecha de inicio, establecimiento, punto de expedición, CSC, **certificado digital** (archivo + contraseña), actividad económica, logo del KuDE |
| `/configuracion/canales` | Canales | Números de WhatsApp conectados (Meta/YCloud), tokens, respuestas rápidas por canal |
| `/configuracion/colas` | Colas | Colas de atención: prioridad, SLA, agentes asignados, taxonomía de motivos de cierre |
| `/configuracion/omnicanal-equipos` | Equipos | Equipos de agentes y supervisores |
| `/configuracion/omnicanal-horarios` | Horarios | Horarios de trabajo de agentes, pausas, zona horaria |
| `/configuracion/conversaciones` | Omnicanal | Redirige a Canales (alias) |
| `/configuracion/crm` | CRM | Etapas del funnel y su orden |
| `/configuracion/comisiones` | Comisiones | Políticas: base de cálculo (pago registrado / factura emitida / factura pagada), escalas por tramos, equipos |
| `/configuracion/proyectos` | Proyectos | Tipos de proyecto, estados (color, orden, SLA), prioridades |
| `/configuracion/metricas` | Métricas | Metas comerciales/financieras |
| `/configuracion/politicas` | Políticas | Políticas de negocio (descuentos, retención) |
| `/configuracion/preferencias` | Preferencias | Moneda base, formatos, zona horaria |
| `/configuracion/vistas-dashboard` y `/configuracion/tableros` | Dashboard | Qué vistas/KPIs ve cada rol |$KB$, '{}'::text[], 2),
    ($KB$configuracion$KB$, $KB$Configuración › Casos de uso$KB$, $KB$- Onboarding de una empresa nueva: cargar datos fiscales, subir certificado SIFEN en ambiente
  test, conectar el número de WhatsApp, crear las colas de atención.
- Cambio de timbrado: actualizar el timbrado y su fecha de inicio antes de seguir facturando.
- Reestructura del equipo de atención: nuevas colas, reasignar agentes, ajustar horarios.$KB$, '{}'::text[], 3),
    ($KB$configuracion$KB$, $KB$Configuración › Flujos paso a paso$KB$, $KB$### Configurar facturación electrónica (SIFEN)
1. `Configuración → Facturación electrónica`.
2. Completar RUC, razón social, timbrado (y fecha de inicio), establecimiento y punto de expedición.
3. Subir el **certificado digital** (.p12) con su contraseña (se guarda cifrada) y el CSC.
4. Elegir ambiente **test** para probar; pasar a **producción** cuando las pruebas aprueben.

### Conectar un canal de WhatsApp
1. `Configuración → Canales → Nuevo`.
2. Elegir proveedor (Meta Cloud API / YCloud) y cargar identificadores y token.
3. Vincular el canal a una o más colas de atención.

### Crear una cola de atención
1. `Configuración → Colas → Nueva`.
2. Definir nombre, prioridad y SLA objetivo.
3. Asignar agentes y configurar la taxonomía de cierres.$KB$, '{}'::text[], 4),
    ($KB$configuracion$KB$, $KB$Configuración › Preguntas frecuentes$KB$, $KB$- **¿Quién puede entrar a Configuración?** Usuarios con el módulo `configuracion` (típicamente
  administradores de la empresa).
- **¿Dónde activo/desactivo módulos?** Los módulos por empresa los gestiona el **super admin**
  (panel Admin → Empresas); el admin de empresa puede asignar módulos a sus usuarios en
  `/usuarios`.
- **¿El certificado SIFEN está seguro?** Se almacena con la contraseña cifrada en el servidor.
- **¿Puedo probar la facturación sin impacto fiscal?** Sí, con ambiente SIFEN `test`.$KB$, '{}'::text[], 5),
    ($KB$configuracion$KB$, $KB$Configuración › Errores comunes$KB$, $KB$- *Certificado inválido o vencido:* SIFEN rechaza la firma; renovar el certificado.
- *Timbrado vencido / fecha de inicio incorrecta:* la SET rechaza los documentos.
- *Canal sin token válido:* los mensajes dejan de entrar/salir; regenerar el token.$KB$, '{}'::text[], 6),
    ($KB$configuracion$KB$, $KB$Configuración › Capturas relacionadas$KB$, $KB$- `screenshots/configuracion/01-hub.png` — hub de configuración.
- `screenshots/configuracion/02-facturacion.png` — facturación.
- `screenshots/configuracion/03-facturacion-electronica.png` — SIFEN.
- `screenshots/configuracion/04-canales.png` — canales.
- `screenshots/configuracion/05-colas.png` — colas.
- `screenshots/configuracion/07-crm.png` — etapas CRM.
- `screenshots/configuracion/08-comisiones.png` — comisiones.
- `screenshots/configuracion/09-proyectos.png` — proyectos.
- `screenshots/configuracion/10-preferencias.png` — preferencias.
- `screenshots/configuracion/11-omnicanal-equipos.png` — equipos.
- `screenshots/configuracion/12-omnicanal-horarios.png` — horarios.
- `screenshots/usuarios/01-listado.png`, `screenshots/usuarios/02-form-nuevo-usuario.png`,
  `screenshots/usuarios/03-detalle-usuario.png` — usuarios (el detalle es modal: datos
  personales, laborales y accesos del sistema).
- `screenshots/planes/01-listado.png`, `screenshots/planes/02-form-nuevo-plan.png`,
  `screenshots/planes/03-detalle-plan.png` — planes (detalle modal: plan de marketing con
  generación automática de tareas de contenido, límites del plan).
- `screenshots/comisiones/01-resumen.png` — módulo comisiones.$KB$, array[$KB$screenshots/configuracion/01-hub.png$KB$, $KB$screenshots/configuracion/02-facturacion.png$KB$, $KB$screenshots/configuracion/03-facturacion-electronica.png$KB$, $KB$screenshots/configuracion/04-canales.png$KB$, $KB$screenshots/configuracion/05-colas.png$KB$, $KB$screenshots/configuracion/07-crm.png$KB$, $KB$screenshots/configuracion/08-comisiones.png$KB$, $KB$screenshots/configuracion/09-proyectos.png$KB$, $KB$screenshots/configuracion/10-preferencias.png$KB$, $KB$screenshots/configuracion/11-omnicanal-equipos.png$KB$, $KB$screenshots/configuracion/12-omnicanal-horarios.png$KB$, $KB$screenshots/usuarios/01-listado.png$KB$, $KB$screenshots/usuarios/02-form-nuevo-usuario.png$KB$, $KB$screenshots/usuarios/03-detalle-usuario.png$KB$, $KB$screenshots/planes/01-listado.png$KB$, $KB$screenshots/planes/02-form-nuevo-plan.png$KB$, $KB$screenshots/planes/03-detalle-plan.png$KB$, $KB$screenshots/comisiones/01-resumen.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$conversaciones$KB$, $KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal)$KB$, $KB$docs/assistant/conversaciones.md$KB$, $KB$7978be12f9c80e85724b0ac63a236c4cd25d6277a7c44f2fe3b97c4dae5964e5$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal)$KB$, $KB$# Conversaciones (Omnicanal)$KB$, '{}'::text[], 0),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Objetivo$KB$, $KB$Atender en un solo lugar todas las conversaciones de los canales de mensajería de la empresa
(WhatsApp principalmente), con colas de atención, agentes, monitoreo en tiempo real, historial y
flujos automáticos (bots).$KB$, '{}'::text[], 1),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Explicación funcional$KB$, $KB$### Pantallas

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
  segmentar audiencias y crear campañas desde una etiqueta.$KB$, '{}'::text[], 2),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Casos de uso$KB$, $KB$- Cliente escribe al WhatsApp de la empresa → el bot lo recibe, captura datos y deriva a la cola
  de ventas → un agente disponible lo atiende → cierra con motivo "resolución".
- El supervisor mira Monitoreo para ver cuántos chats esperan y qué agentes están disponibles.
- Soporte busca en el historial qué se le respondió a un número hace dos semanas.$KB$, '{}'::text[], 3),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Flujos paso a paso$KB$, $KB$### Atender una conversación
1. Entrar al Inbox (`/dashboard/conversaciones`).
2. Filtrar por cola o asignación ("Mías") y abrir el chat.
3. Responder (texto o adjuntos). Usar respuestas rápidas si el canal las tiene configuradas.
4. Al terminar, cerrar la conversación eligiendo el **motivo de cierre** de la taxonomía.

### Crear/editar un flujo bot
1. Ir a **Conversaciones → Flujos**.
2. Crear flujo (nombre y código) o abrir uno existente.
3. Agregar nodos (mensajes, botones, capturas) y conectar las transiciones.
4. Probar con "test de flujo" antes de activarlo.$KB$, '{}'::text[], 4),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Preguntas frecuentes$KB$, $KB$- **¿Por qué no veo chats en el Inbox?** Verificar el filtro de cola/asignación y que su usuario
  esté asignado a alguna cola (el encabezado avisa "Sin puesto en colas").
- **¿Cómo dejo de recibir chats?** Cambiar su estado a "en receso" u "offline" (según política
  del equipo y horarios configurados).
- **¿El bot puede pasarme la conversación?** Sí: por opción del flujo (derivación) o por takeover
  manual del agente.
- **¿Qué pasa fuera del horario laboral?** Aplican los horarios de trabajo configurados; los
  mensajes quedan en cola para el siguiente turno.$KB$, '{}'::text[], 5),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Errores comunes$KB$, $KB$- *El cliente no recibe mensajes:* en WhatsApp, fuera de la ventana de 24 h solo pueden enviarse
  **plantillas aprobadas** (ver `whatsapp.md`).
- *Conversación "pegada" en bot:* usar takeover o reenviar el nodo actual (acción de reenvío).
- *Sin acceso al Inbox:* el módulo `conversaciones`/`omnicanal` no está habilitado, o el usuario
  no tiene puesto en colas.$KB$, '{}'::text[], 6),
    ($KB$conversaciones$KB$, $KB$Conversaciones (Omnicanal) › Capturas relacionadas$KB$, $KB$- `screenshots/conversaciones/01-inbox.png` — inbox con filtros.
- `screenshots/conversaciones/02-finalizadas.png` — cerradas.
- `screenshots/conversaciones/03-historial-omnicanal.png` — historial global.
- `screenshots/conversaciones/04-monitoreo.png` — monitoreo en tiempo real.
- `screenshots/conversaciones/06-flujos.png` — gestor de flujos bot (alta con ID interno,
  copiar pasos desde otro flujo, listado con canal/estado/nodos/sorteo vinculado).
- `screenshots/conversaciones/07-editor-flujo.png` — editor de flujo: pasos con tipo de nodo
  (mensaje con imagen, botones, capturas), siguiente paso, advertencias del grafo y tab de
  automatizaciones.
- `screenshots/configuracion/05-colas.png` — configuración de colas.$KB$, array[$KB$screenshots/conversaciones/01-inbox.png$KB$, $KB$screenshots/conversaciones/02-finalizadas.png$KB$, $KB$screenshots/conversaciones/03-historial-omnicanal.png$KB$, $KB$screenshots/conversaciones/04-monitoreo.png$KB$, $KB$screenshots/conversaciones/06-flujos.png$KB$, $KB$screenshots/conversaciones/07-editor-flujo.png$KB$, $KB$screenshots/configuracion/05-colas.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$crm$KB$, $KB$crm$KB$, $KB$CRM Funnel$KB$, $KB$docs/assistant/crm.md$KB$, $KB$6ddfe8412f18087579409382b97459623e798f6e82ea42ac4f2345086e70f135$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$crm$KB$, $KB$CRM Funnel$KB$, $KB$# CRM Funnel$KB$, '{}'::text[], 0),
    ($KB$crm$KB$, $KB$CRM Funnel › Objetivo$KB$, $KB$Gestionar prospectos (leads) desde la captación hasta el cierre, en un pipeline visual tipo
Kanban, y convertir los ganados en clientes con un clic.$KB$, '{}'::text[], 1),
    ($KB$crm$KB$, $KB$CRM Funnel › Explicación funcional$KB$, $KB$- **Ruta principal:** `/crm` — tablero Kanban con columnas por etapa.
- **Etapas estándar:** `LEAD → CONTACTADO → NEGOCIACIÓN → GANADO / PERDIDO`
  (configurables en `/configuracion/crm`). En producción se observó además una etapa
  personalizada **"Charlando"** entre Contactado y Negociación — confirma que cada empresa
  puede tener su propio pipeline.
- Cada tarjeta muestra: empresa/contacto, valor estimado, próxima acción y su fecha.
- **Origen del prospecto:** MANUAL, FORMULARIO, WHATSAPP (vía webhook n8n), CRM, VENTA.
- Detalle del prospecto (`/crm/[id]`): datos, notas con autor y fecha, historial, botón
  "crear cliente" cuando está ganado.$KB$, '{}'::text[], 2),
    ($KB$crm$KB$, $KB$CRM Funnel › Casos de uso$KB$, $KB$- Un lead entra automáticamente desde WhatsApp (integración n8n → `/api/crm/leads`) y aparece
  en la columna LEAD con el mensaje como nota.
- El vendedor arrastra la tarjeta a CONTACTADO después de la primera llamada.
- En NEGOCIACIÓN actualiza el valor estimado y agenda la próxima acción.
- Al ganar, crea el cliente automáticamente (origen CRM) y arranca la facturación.$KB$, '{}'::text[], 3),
    ($KB$crm$KB$, $KB$CRM Funnel › Flujos paso a paso$KB$, $KB$### Cargar un prospecto manual
1. **CRM → Nuevo** (`/crm/nuevo`).
2. Completar empresa, contacto, teléfono, email, servicio de interés y valor estimado.
3. Guardar → la tarjeta aparece en LEAD.

### Avanzar el pipeline
1. En `/crm`, arrastrar la tarjeta a la etapa siguiente (drag & drop).
2. Registrar notas de cada interacción desde el detalle.
3. Definir "próxima acción" y fecha para no perder seguimiento.

### Convertir en cliente
1. Mover el prospecto a **GANADO**.
2. En el detalle, usar **Crear cliente** → se crea el cliente con origen CRM y queda vinculado.$KB$, '{}'::text[], 4),
    ($KB$crm$KB$, $KB$CRM Funnel › Preguntas frecuentes$KB$, $KB$- **¿Puedo personalizar las etapas?** Sí, en Configuración → CRM (nombres y orden).
- **¿Cómo entran los leads de WhatsApp?** Vía integración n8n: el webhook recibe el mensaje y
  llama a la API de leads; el prospecto entra con origen WHATSAPP.
- **¿Qué pasa con los perdidos?** Quedan en la columna PERDIDO con su historial (no se borran).
- **¿El valor estimado afecta algo?** Alimenta los KPIs comerciales del dashboard (valor en
  negociación, top productos en negociación).$KB$, '{}'::text[], 5),
    ($KB$crm$KB$, $KB$CRM Funnel › Errores comunes$KB$, $KB$- Prospecto duplicado: si el mismo teléfono escribe de nuevo, revisar si ya existe antes de crear.
- No aparece el botón de crear cliente: el prospecto debe estar en etapa GANADO.$KB$, '{}'::text[], 6),
    ($KB$crm$KB$, $KB$CRM Funnel › Capturas relacionadas$KB$, $KB$- `screenshots/crm/01-pipeline.png` — Kanban del funnel.
- `screenshots/crm/02-form-nuevo-prospecto.png` — alta de prospecto.$KB$, array[$KB$screenshots/crm/01-pipeline.png$KB$, $KB$screenshots/crm/02-form-nuevo-prospecto.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$dashboard$KB$, $KB$dashboard$KB$, $KB$Dashboard$KB$, $KB$docs/assistant/dashboard.md$KB$, $KB$6a77e76e51d0100058bc2959ffb2ff108d744df3019903401960cc8a22f5e1e8$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$dashboard$KB$, $KB$Dashboard$KB$, $KB$# Dashboard$KB$, '{}'::text[], 0),
    ($KB$dashboard$KB$, $KB$Dashboard › Objetivo$KB$, $KB$Dar una visión 360° del negocio apenas el usuario inicia sesión: situación comercial (CRM),
financiera (facturas/pagos), de inventario y de ventas, en un solo lugar.$KB$, '{}'::text[], 1),
    ($KB$dashboard$KB$, $KB$Dashboard › Explicación funcional$KB$, $KB$- **Ruta:** `/` (home). Es la pantalla de aterrizaje tras el login.
- Organizado en **tabs/sub-vistas** por área: Comercial, Financiero, Inventario, Ventas (las
  vistas visibles dependen de los módulos habilitados y de la configuración de
  `Configuración → Vistas de dashboard`).
- Componentes típicos: tarjetas de KPI con tendencia, gráficos (líneas/barras/torta con Recharts)
  y tablas resumen.

### KPIs principales por área

| Área | KPIs |
|---|---|
| Comercial | Prospectos por etapa del funnel, clientes nuevos del mes, valor en negociación |
| Financiero | Facturas emitidas/pagadas/vencidas, saldo total adeudado, mora promedio |
| Inventario | Productos con stock bajo (< mínimo), movimientos recientes, margen promedio |
| Ventas | Facturación de hoy/mes, cantidad de ventas, ticket promedio, productos vendidos |$KB$, '{}'::text[], 2),
    ($KB$dashboard$KB$, $KB$Dashboard › Casos de uso$KB$, $KB$- El gerente entra por la mañana y revisa facturación del día anterior y facturas vencidas.
- Un supervisor comercial controla cuántos prospectos hay en "Negociación".
- El encargado de depósito detecta productos bajo stock mínimo sin entrar a Inventario.$KB$, '{}'::text[], 3),
    ($KB$dashboard$KB$, $KB$Dashboard › Flujo paso a paso$KB$, $KB$1. Iniciar sesión en `/login` con email y contraseña.
2. El sistema redirige al Dashboard (`/`).
3. Elegir la pestaña del área a revisar (Comercial / Financiero / etc.).
4. Hacer clic en un KPI o tabla para profundizar (navega al módulo correspondiente).$KB$, '{}'::text[], 4),
    ($KB$dashboard$KB$, $KB$Dashboard › Preguntas frecuentes$KB$, $KB$- **¿Por qué no veo alguna pestaña del dashboard?** Las vistas dependen de los módulos que su
  empresa tiene habilitados y de la configuración de vistas (`/configuracion/vistas-dashboard`).
- **¿Los datos son en tiempo real?** Los KPIs se calculan al cargar la página; algunos módulos
  (conversaciones, proyectos) usan Realtime, el dashboard se actualiza al refrescar.
- **¿Puedo personalizar qué KPIs veo?** Sí, desde Configuración → Vistas de dashboard (según rol).$KB$, '{}'::text[], 5),
    ($KB$dashboard$KB$, $KB$Dashboard › Errores comunes$KB$, $KB$- *"No tenés acceso a este módulo"* / redirección al dashboard: el módulo destino no está
  habilitado para su empresa o usuario.
- Dashboard vacío o en cero: la empresa todavía no cargó datos (clientes, ventas, facturas).$KB$, '{}'::text[], 6),
    ($KB$dashboard$KB$, $KB$Dashboard › Capturas relacionadas$KB$, $KB$- `screenshots/dashboard/01-dashboard-principal.png` — vista Comercial con KPIs y pipeline.
- `screenshots/dashboard/02-dashboard-financiero.png` — tab Financiero.
- `screenshots/login/01-pantalla-login.png` — pantalla de acceso.$KB$, array[$KB$screenshots/dashboard/01-dashboard-principal.png$KB$, $KB$screenshots/dashboard/02-dashboard-financiero.png$KB$, $KB$screenshots/login/01-pantalla-login.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$facturas$KB$, $KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito$KB$, $KB$docs/assistant/facturas.md$KB$, $KB$dc8993ebf674c77863f6092bbecfe92d8b39bc27947b368a1a3c0c1e503bbf52$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito$KB$, $KB$# Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito$KB$, '{}'::text[], 0),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Objetivo$KB$, $KB$Emitir y gestionar facturas (contado, crédito, suscripción), cumplir con la facturación
electrónica de Paraguay (SIFEN/SET: XML firmado, CDC, KuDE) y corregir facturas mediante
notas de crédito con trazabilidad fiscal completa.$KB$, '{}'::text[], 1),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Explicación funcional$KB$, $KB$### Facturas

- La factura nace desde la ficha del cliente (emisión) o desde el flujo de ventas/suscripciones.
- Datos: número (secuencia generada en servidor con prefijo configurable), fecha, vencimiento,
  monto, **saldo**, estado (`Pagado / Pendiente / Vencido / Anulado`), tipo
  (contado / crédito / suscripción), moneda.
- `/facturas/[id]`: detalle comercial + panel de **factura electrónica** + bloque de
  **corrección fiscal** (notas de crédito).

### Ciclo SIFEN (factura electrónica)

Estados: `borrador → generado (XML) → firmado → enviado → en_proceso → aprobado / rechazado`.

1. **Generar XML** (formato rDE v150).
2. **Firmar** con el certificado digital de la empresa (XML-DSig).
3. **Enviar a SET** (recibe-lote).
4. **Consultar lote** hasta respuesta: aprobado (CDC + KuDE + QR) o rechazado (motivo).

La configuración SIFEN por empresa (ambiente test/producción, RUC, timbrado, establecimiento,
punto de expedición, CSC, certificado y su vencimiento) vive en
`/configuracion/facturacion-electronica`. Cada paso queda auditado en eventos
(`xml_generado`, `xml_firmado`, `enviado_set`, `aprobado`, `rechazado`, `error_envio`).

### Notas de Crédito

- **Ruta:** `/notas-credito` (listado con filtros por fecha, cliente, estado ERP/SIFEN, CDC,
  motivo, errores) y `/notas-credito/[id]` (detalle + historial de eventos + rutas SIFEN).
- Se crean **desde la factura** (`/facturas/[id]`, bloque "Corrección fiscal").
- Estados ERP: `borrador → pendiente_envio_sifen → aprobada / rechazada / error / anulada_borrador`.
- Reglas de negocio claves:
  - El monto de la NC nace igual al **saldo pendiente** de la factura.
  - El motivo es obligatorio (mínimo 5 caracteres).
  - **Solo una NC activa por factura** (constraint de unicidad).
  - Si la factura todavía puede **cancelarse** (ventana horaria, sin pagos), el sistema pide
    cancelar en lugar de emitir NC.
  - El **saldo de la factura solo se impacta cuando la SET aprueba** la NC (transacción atómica).$KB$, '{}'::text[], 2),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Casos de uso$KB$, $KB$- Emitir factura mensual de suscripción a un cliente de plan.
- Reenviar a SET una factura que quedó "en_proceso".
- Cliente devuelve el servicio: emitir nota de crédito por el saldo pendiente.
- Anular un borrador de NC creado por error.$KB$, '{}'::text[], 3),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Flujos paso a paso$KB$, $KB$### Emitir factura electrónica
1. Crear/abrir la factura → panel "Factura electrónica".
2. **Generar XML** → revisar datos.
3. **Firmar** (requiere certificado vigente configurado).
4. **Enviar a SET** y luego **Consultar lote**.
5. Si aprueba: se guarda CDC, KuDE (PDF) y QR; estado `aprobado`.

### Crear una nota de crédito
1. Abrir la factura aprobada → bloque **Corrección fiscal** → "Nueva nota de crédito".
2. Confirmar el monto (saldo pendiente) y escribir el motivo (≥ 5 caracteres).
3. Guardar como borrador. Luego procesar el ciclo SIFEN (XML → firma → envío → consulta).
4. Cuando la SET aprueba, el saldo de la factura se actualiza automáticamente.$KB$, '{}'::text[], 4),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Preguntas frecuentes$KB$, $KB$- **¿Qué es el CDC?** El Código de Control del documento electrónico asignado al aprobar; es el
  identificador fiscal único del documento.
- **¿Qué es el KuDE?** La representación gráfica (PDF) del documento electrónico para el cliente.
- **¿Por qué no puedo crear una NC?** Causas típicas: la factura aún puede cancelarse, ya existe
  una NC activa para esa factura, o la factura no está aprobada en SIFEN.
- **¿Qué pasa si SET rechaza?** El documento queda `rechazado` con el motivo; no impacta saldos.
  Corregir la causa y volver a generar/enviar.
- **¿Puedo facturar en ambiente de prueba?** Sí, configurando ambiente `test` en SIFEN
  (Configuración → Facturación electrónica).$KB$, '{}'::text[], 5),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Errores comunes$KB$, $KB$- *Certificado vencido o contraseña incorrecta* → actualizar certificado en configuración SIFEN.
- *Timbrado inválido o fuera de fecha* → revisar timbrado y fecha de inicio configurados.
- *Lote en proceso mucho tiempo* → usar "Consultar lote" nuevamente; SET puede demorar.
- *RUC del receptor inválido* → corregir perfil tributario del cliente.$KB$, '{}'::text[], 6),
    ($KB$ventas$KB$, $KB$Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito › Capturas relacionadas$KB$, $KB$- `screenshots/facturas/01-notas-credito.png` — listado de notas de crédito.
- `screenshots/facturas/03-detalle-factura.png` — detalle real de factura: resumen comercial,
  panel SIFEN aprobado en producción, NC rechazada por SET con su mensaje de error y CDC.
- `screenshots/configuracion/03-facturacion-electronica.png` — configuración SIFEN.
- `screenshots/pagos/01-listado.png` — pagos contra facturas (módulo relacionado).$KB$, array[$KB$screenshots/facturas/01-notas-credito.png$KB$, $KB$screenshots/facturas/03-detalle-factura.png$KB$, $KB$screenshots/configuracion/03-facturacion-electronica.png$KB$, $KB$screenshots/pagos/01-listado.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$faq$KB$, null, $KB$Preguntas Frecuentes (transversales)$KB$, $KB$docs/assistant/faq.md$KB$, $KB$950d3a5f29251a5929b24dd6b227c11558b3a725ed810ec04dc8293dee6d07c2$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    (null, $KB$Preguntas Frecuentes (transversales)$KB$, $KB$# Preguntas Frecuentes (transversales)

> Q&A general del ERP. Las preguntas específicas de cada módulo están en su documento.$KB$, '{}'::text[], 0),
    (null, $KB$Preguntas Frecuentes (transversales) › Acceso y sesión$KB$, $KB$**¿Cómo entro al sistema?**
En `/login`, con el email y contraseña que le creó el administrador de su empresa.

**Me dice "Credenciales incorrectas".**
Verificá email y contraseña. Si persiste, el administrador puede resetear tu contraseña desde
Usuarios.

**Me dice "Tu cuenta está desactivada".**
Tu usuario fue suspendido; contactá al administrador de tu empresa.

**¿Por qué no veo un módulo que mi compañero sí ve?**
El acceso es doble: la **empresa** debe tener el módulo habilitado (lo gestiona el proveedor /
super admin) y tu **usuario** debe tenerlo asignado (lo gestiona tu administrador en Usuarios).

**Entré a una URL y me devolvió al Dashboard.**
Es el comportamiento estándar cuando tu usuario no tiene el módulo de esa pantalla.$KB$, '{}'::text[], 1),
    (null, $KB$Preguntas Frecuentes (transversales) › Datos y seguridad$KB$, $KB$**¿Otra empresa puede ver mis datos?**
No. Cada empresa está aislada (Row Level Security y/o esquema de datos dedicado por tenant).

**¿Quién puede crear usuarios?**
El administrador de la empresa, desde `/usuarios/nuevo` (define rol y módulos visibles).

**¿Qué roles existen?**
Super admin (proveedor), administrador (empresa), supervisor y usuarios operativos con módulos
asignados.$KB$, '{}'::text[], 2),
    (null, $KB$Preguntas Frecuentes (transversales) › Operación diaria$KB$, $KB$**¿En qué moneda trabaja el sistema?**
Guaraníes (GS) por defecto; ventas y facturas soportan USD con tipo de cambio.

**¿Cómo registro un cobro?**
En `Pagos`, eligiendo la factura pendiente y registrando monto, fecha, método y referencia.
El saldo de la factura se actualiza automáticamente.

**¿Cómo emito una factura electrónica?**
Ver `facturas.md`: generar XML → firmar → enviar a SET → consultar lote. Requiere SIFEN
configurado (certificado y timbrado vigentes).

**¿Cómo corrijo una factura ya aprobada?**
Con una **nota de crédito** desde el detalle de la factura (bloque Corrección fiscal).

**¿Por qué WhatsApp no me deja escribirle a un cliente?**
Si pasaron más de 24 h desde su último mensaje, solo se pueden enviar **plantillas aprobadas**
(campañas). Ver `whatsapp.md`.

**¿Las comisiones cuándo se calculan?**
Por período (típicamente mensual), según la política configurada: por pago registrado, factura
emitida o factura pagada, aplicando escalas por tramos.$KB$, '{}'::text[], 3),
    (null, $KB$Preguntas Frecuentes (transversales) › Soporte$KB$, $KB$**Encontré un error en el sistema, ¿qué hago?**
Tomá una captura de pantalla con el mensaje de error, anotá qué estabas haciendo (pantalla y
acción) y reportalo a tu administrador o al soporte del proveedor.

**¿El sistema guarda lo que hago?**
Las acciones importantes (pagos, cambios de clientes, eventos SIFEN, movimientos de stock,
cambios de proyectos) quedan auditadas con usuario y fecha.$KB$, '{}'::text[], 4)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$inventario$KB$, $KB$inventario$KB$, $KB$Inventario$KB$, $KB$docs/assistant/inventario.md$KB$, $KB$6e42461b93a90b8ac79669a74f5b71416d13859583cc19459485eb271f9bd36e$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$inventario$KB$, $KB$Inventario$KB$, $KB$# Inventario

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción,
> por lo que no hay capturas. Documentación basada en auditoría de código.$KB$, '{}'::text[], 0),
    ($KB$inventario$KB$, $KB$Inventario › Objetivo$KB$, $KB$Controlar productos, stock por depósito, valuación de inventario y todos los movimientos
(entradas por compra, salidas por venta, ajustes manuales).$KB$, '{}'::text[], 1),
    ($KB$inventario$KB$, $KB$Inventario › Explicación funcional$KB$, $KB$### Pantallas

| Ruta | Pantalla |
|---|---|
| `/inventario` | Listado de productos: SKU, costo promedio, precio, stock, margen, filtros por columna |
| `/inventario/nuevo` | Alta de producto (nombre, SKU, costo, markup → precio, stock inicial, imagen) |
| `/inventario/[id]/editar` | Edición de producto |
| `/inventario/movimientos` | Historial de movimientos (ENTRADA / SALIDA / AJUSTE) |
| `/inventario/movimientos/nuevo` | Ajuste manual de stock |
| `/inventario/categorias` | CRUD de categorías |
| `/inventario/ubicaciones` | CRUD de depósitos/ubicaciones (físicos o virtuales) |

### Conceptos

- **Producto:** nombre, SKU, código de barras, unidad de medida, categoría, ubicación principal,
  costo promedio, precio de venta, stock actual y stock mínimo, método de valuación (CPP/FIFO/LIFO).
- **Movimiento:** tipo (entrada/salida/ajuste), origen (compra, venta, ajuste manual), cantidad,
  costo unitario, usuario que lo registró (auditoría).
- **Importación/exportación Excel** de productos (plantilla, vista previa y confirmación).$KB$, '{}'::text[], 2),
    ($KB$inventario$KB$, $KB$Inventario › Casos de uso$KB$, $KB$- Cargar el catálogo inicial por Excel.
- Registrar una rotura/merma como ajuste de salida.
- Detectar productos bajo stock mínimo desde el dashboard.
- Consultar el historial de movimientos de un producto antes de un inventario físico.$KB$, '{}'::text[], 3),
    ($KB$inventario$KB$, $KB$Inventario › Flujos paso a paso$KB$, $KB$### Alta de producto
1. **Inventario → Nuevo** (`/inventario/nuevo`).
2. Completar nombre, SKU, categoría y ubicación.
3. Cargar costo; el precio puede calcularse con el markup automático.
4. Definir stock inicial y stock mínimo. Guardar.

### Ajuste manual de stock
1. **Inventario → Movimientos → Nuevo**.
2. Elegir producto, tipo (entrada/salida/ajuste), cantidad y motivo.
3. Guardar → el stock actual se actualiza y queda el movimiento auditado.

### Flujo automático
- Una **compra** confirma → movimiento de **ENTRADA** + recalcula costo promedio.
- Una **venta** confirma → movimiento de **SALIDA**.$KB$, '{}'::text[], 4),
    ($KB$inventario$KB$, $KB$Inventario › Preguntas frecuentes$KB$, $KB$- **¿Cómo importo mis productos?** Desde el listado: descargar plantilla Excel, completarla,
  subirla, revisar la vista previa y confirmar.
- **¿Puedo tener varios depósitos?** Sí, en `/inventario/ubicaciones`; cada producto tiene
  ubicación principal.
- **¿Cómo se calcula el costo?** Según el método de valuación del producto (costo promedio
  ponderado por defecto), actualizado en cada entrada.$KB$, '{}'::text[], 5),
    ($KB$inventario$KB$, $KB$Inventario › Errores comunes$KB$, $KB$- SKU duplicado al importar: corregir el Excel y reintentar (la vista previa lo marca).
- Stock negativo: revisar si faltó registrar una compra/entrada antes de la venta.
- "Sin acceso": el módulo `inventario` no está habilitado para la empresa o el usuario.$KB$, '{}'::text[], 6),
    ($KB$inventario$KB$, $KB$Inventario › Capturas relacionadas$KB$, $KB$- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).$KB$, '{}'::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$proyectos$KB$, $KB$proyectos$KB$, $KB$Proyectos$KB$, $KB$docs/assistant/proyectos.md$KB$, $KB$6aa2c0f523f99fe6df6d2b820910e49cdf4f2d7812eed25e14327514c189341b$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$proyectos$KB$, $KB$Proyectos$KB$, $KB$# Proyectos$KB$, '{}'::text[], 0),
    ($KB$proyectos$KB$, $KB$Proyectos › Objetivo$KB$, $KB$Gestionar proyectos por cliente en un tablero Kanban con estados personalizables, tareas con
responsables y archivos adjuntos, y control de SLA (tiempo objetivo por estado).$KB$, '{}'::text[], 1),
    ($KB$proyectos$KB$, $KB$Proyectos › Explicación funcional$KB$, $KB$| Ruta | Pantalla |
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
- Actualización en tiempo real (Realtime) del tablero.$KB$, '{}'::text[], 2),
    ($KB$proyectos$KB$, $KB$Proyectos › Casos de uso$KB$, $KB$- Implementación de un servicio para un cliente nuevo, con tareas por área.
- Mesa de soporte que mide cuánto tiempo está un ticket "esperando al cliente" (SLA tipo cliente)
  vs "en trabajo interno" (SLA interno).
- PMO que define su propio flujo de estados (ej. Backlog → En curso → QA → Entregado).$KB$, '{}'::text[], 3),
    ($KB$proyectos$KB$, $KB$Proyectos › Flujos paso a paso$KB$, $KB$### Crear un proyecto
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
3. Definir prioridades disponibles.$KB$, '{}'::text[], 4),
    ($KB$proyectos$KB$, $KB$Proyectos › Preguntas frecuentes$KB$, $KB$- **¿Puedo tener flujos distintos por tipo de proyecto?** Los tipos son configurables; los
  estados son por empresa.
- **¿Quién puede mover tarjetas?** Usuarios con el módulo `proyectos` habilitado.
- **¿Dónde quedan los archivos?** En el almacenamiento del sistema, vinculados a la tarea.
- **¿Cómo sé si me pasé del SLA?** El proyecto acumula tiempo en los estados que "cuentan SLA";
  el tablero/detalle lo evidencia respecto del objetivo.$KB$, '{}'::text[], 5),
    ($KB$proyectos$KB$, $KB$Proyectos › Errores comunes$KB$, $KB$- No puedo mover una tarjeta a cierto estado: la transición no está permitida por configuración.
- No aparece un estado en el tablero: revisar orden/activación en Configuración → Proyectos.$KB$, '{}'::text[], 6),
    ($KB$proyectos$KB$, $KB$Proyectos › Capturas relacionadas$KB$, $KB$- `screenshots/proyectos/01-kanban.png` — tablero Kanban.
- `screenshots/proyectos/02-form-nuevo-proyecto.png` — alta de proyecto.
- `screenshots/proyectos/03-detalle-proyecto.png` — detalle con tareas e historial.
- `screenshots/configuracion/09-proyectos.png` — configuración de estados/prioridades.$KB$, array[$KB$screenshots/proyectos/01-kanban.png$KB$, $KB$screenshots/proyectos/02-form-nuevo-proyecto.png$KB$, $KB$screenshots/proyectos/03-detalle-proyecto.png$KB$, $KB$screenshots/configuracion/09-proyectos.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$sorteos$KB$, $KB$sorteos$KB$, $KB$Sorteos$KB$, $KB$docs/assistant/sorteos.md$KB$, $KB$9d660d4e7d176df1a1d95a4cf8c95a88414dbe6a4501bde884a3fffdad37d247$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$sorteos$KB$, $KB$Sorteos$KB$, $KB$# Sorteos

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción
> (sin capturas). Documentación basada en auditoría de código y docs internas (`docs/SORTEOS_N8N.md`).$KB$, '{}'::text[], 0),
    ($KB$sorteos$KB$, $KB$Sorteos › Objetivo$KB$, $KB$Operar rifas/sorteos de punta a punta: venta de boletos por WhatsApp (bot), validación de
comprobantes de pago con OCR, generación de cupones numerados, red de revendedores con
comisiones y entrega de tickets por WhatsApp.$KB$, '{}'::text[], 1),
    ($KB$sorteos$KB$, $KB$Sorteos › Explicación funcional$KB$, $KB$### Pantallas

| Ruta | Pantalla |
|---|---|
| `/sorteos` | Listado de sorteos + KPIs (boletos y monto de hoy/mes) |
| `/sorteos/nuevo` / `/sorteos/[id]/editar` | Alta/edición: precio por boleto, máximo, fecha, datos bancarios, imagen, modo de entrega del ticket (solo texto / texto+imagen) |
| `/sorteos/[id]/revendedores` | Revendedores del sorteo: códigos, comisión %, performance |
| `/sorteos/cupones` | Cupones por estado (asignado/entregado/redimido/anulado) |
| `/sorteos/entradas` | Entradas (compras): cliente, cantidad, monto, banco, comprobante, validación |
| `/sorteos/tickets` | Tickets/comprobantes para descarga e impresión |
| `/sorteos/[id]/imprimir-cupones` | Planilla de impresión de cupones |
| `/r/[codigo]?sorteo=...` | **Link público de revendedor** → redirige a WhatsApp con mensaje precargado |

### Flujo de venta por WhatsApp (bot)

Estados de la conversación de sorteo: `nuevo lead → eligiendo boletos → datos del cliente →
esperando pago → esperando comprobante → comprobante en revisión → pago confirmado` (o
`derivado a humano / cancelado / cerrado sin respuesta`), con recordatorios automáticos a las
24/48/72 horas.

1. El cliente escribe (o entra por el link de un revendedor).
2. El bot presenta el sorteo (imagen, precio) y pregunta cuántos boletos quiere.
3. Captura datos: nombre, CI, ciudad.
4. Envía los datos bancarios y pide la **foto del comprobante**.
5. **OCR** extrae monto, banco y referencia; valida contra lo esperado (incluye reglas de
   duplicados por referencia).
6. Si es dudoso → revisión manual del operador. Si está OK → confirma.
7. Se generan los **cupones numerados** (numeración secuencial por sorteo) y se envían por
   WhatsApp (texto o imagen del ticket).

### Revendedores

- Cada revendedor tiene un **código y link público** (`/r/[codigo]`); las compras que llegan por
  ese link quedan atribuidas y generan **comisión** (% configurado).
- Métricas de clicks y conversiones por revendedor.

### Integración n8n

- `POST /api/raffles/entries/create` (con secreto compartido) registra compras desde flujos
  externos: crea/actualiza cliente, registra la entrada y genera cupones en una transacción
  atómica.$KB$, '{}'::text[], 2),
    ($KB$sorteos$KB$, $KB$Sorteos › Casos de uso$KB$, $KB$- Lanzar un sorteo de fin de año con 5.000 boletos y una red de 20 revendedores.
- El operador revisa los comprobantes marcados "en revisión" por el OCR.
- Imprimir cupones físicos para venta presencial.$KB$, '{}'::text[], 3),
    ($KB$sorteos$KB$, $KB$Sorteos › Preguntas frecuentes$KB$, $KB$- **¿Qué pasa si el cliente paga de más/menos?** El OCR compara monto esperado vs detectado;
  diferencias van a revisión manual.
- **¿Puedo anular un cupón?** Sí; el cupón pasa a estado anulado y queda trazado.
- **¿Cómo se calcula la comisión del revendedor?** monto de la entrada × % del revendedor.
- **¿Se pueden enviar los tickets como imagen?** Sí, configurando el modo de entrega del sorteo
  (texto o texto+imagen con overlay del número).$KB$, '{}'::text[], 4),
    ($KB$sorteos$KB$, $KB$Sorteos › Errores comunes$KB$, $KB$- *Comprobante ilegible:* el bot pide reenviar la foto; si persiste, pasa a revisión humana.
- *Comprobante duplicado:* la referencia bancaria ya fue usada (regla anti-duplicados).
- *El link del revendedor no atribuye:* verificar que el link incluya el código y el sorteo.$KB$, '{}'::text[], 5),
    ($KB$sorteos$KB$, $KB$Sorteos › Capturas relacionadas$KB$, $KB$- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).$KB$, '{}'::text[], 6)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$system-map$KB$, null, $KB$Mapa Funcional del ERP — Neura/Zentra$KB$, $KB$docs/assistant/system-map.md$KB$, $KB$c42eae816a1b5765d697f4d1a68fa39a45d8b71d75f2afcf5331937de925eaf9$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra$KB$, $KB$# Mapa Funcional del ERP — Neura/Zentra

> Auditoría: junio 2026. Fuente: código del repositorio + navegación real en producción.$KB$, '{}'::text[], 0),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 1. Identidad del producto$KB$, $KB$- **Producto:** ERP SaaS multiempresa para pymes paraguayas. Marca visual **Zentra** (teal `#4FAEB2`),
  proyecto/repositorio **Neura ERP**. Existe preparación para instancias self-hosted dedicadas.
- **Stack:** Next.js 16 (App Router) + React 19 + TailwindCSS 4, Supabase (PostgreSQL + Auth +
  Storage + Realtime), despliegue en Vercel. Facturación electrónica SIFEN (SET, Paraguay).
- **URL de producción auditada:** `https://sistemas.neura.com.py`$KB$, '{}'::text[], 1),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 2. Módulos (activables por empresa)$KB$, $KB$El catálogo de módulos vive en la tabla `modulos`; cada empresa habilita módulos vía
`empresa_modulos` y puede restringir por usuario vía `usuario_modulos`
(`src/lib/modulos/resolve-effective-modules.ts`).

| Módulo (slug) | Ruta principal | Resumen |
|---|---|---|
| `dashboard` | `/` | KPIs comerciales, financieros, inventario, ventas |
| `conversaciones` (+aliases `historial-omnicanal`, `conversaciones-finalizadas`, `monitoreo`, `omnicanal`) | `/dashboard/conversaciones` | Inbox omnicanal (WhatsApp), colas, agentes, flujos bot |
| `ventas` (incluye `notas_credito`) | `/ventas` | Órdenes de venta; notas de crédito |
| `inventario` | `/inventario` | Productos, movimientos, categorías, depósitos |
| `clientes` (incluye `gestion-clientes`) | `/clientes` | Cartera de clientes; panel de cobranzas |
| `compras` | `/compras` | Órdenes de compra + proveedores |
| `gastos` | `/gastos` | Gastos operativos |
| `pagos` | `/pagos` | Pagos contra facturas |
| `comisiones` | `/comisiones` | Comisiones de vendedores (políticas, escalas, períodos) |
| `usuarios` | `/usuarios` | Gestión de usuarios de la empresa |
| `configuracion` | `/configuracion` | Parámetros de empresa, SIFEN, canales, colas |
| `planes` | `/planes` | Catálogo de planes/suscripciones |
| `crm` | `/crm` | Pipeline de prospectos (Kanban) |
| `marketing` | `/marketing` | Marketing legacy |
| `marketing_ops` | `/dashboard/marketing-ops` | Piezas creativas y operaciones de marketing |
| `campanas` | `/dashboard/campanas` | Campañas WhatsApp (plantillas, envíos masivos) |
| `proyectos` | `/dashboard/proyectos` | Kanban de proyectos, tareas, SLA |
| `agenda` | `/dashboard/agenda` | Citas (día/semana/mes/lista) |
| `sorteos` | `/sorteos` | Rifas: entradas, cupones, revendedores, OCR |
| `etiquetas` | `/dashboard/etiquetas` | Segmentación de contactos de chat |
| — (super_admin) | `/admin/empresas` | Gestión de tenants y módulos |$KB$, '{}'::text[], 2),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 3. Navegación$KB$, $KB$- **Sidebar dinámico** (`src/components/layout/Sidebar.tsx`): renderiza solo los módulos
  habilitados para el usuario. Incluye búsqueda de menú, favoritos (localStorage), colapso,
  sección exclusiva de super admin e indicador de presencia.
- **Gate por ruta:** `pathRequiresModuleSlug()` mapea cada pathname al módulo requerido
  (`src/lib/modulos/route-slug-map.ts`). Si el usuario no tiene el módulo, la app **redirige al
  dashboard** (comportamiento observado en producción con el usuario tester).
- Subitems: Inventario (Productos/Movimientos/Categorías/Depósitos), Compras (Órdenes/Proveedores),
  Configuración (Facturación/Equipos), Sorteos (Tickets/Comprobantes).$KB$, '{}'::text[], 3),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 4. Multi-tenancy y seguridad (observado)$KB$, $KB$- **Modelo híbrido:**
  - Catálogo global en schema `zentra_erp`: `empresas`, `usuarios`, `modulos`, `empresa_modulos`,
    `usuario_modulos`.
  - Datos operativos: en `zentra_erp` (legacy, separación por `empresa_id` + RLS) **o** en un
    schema dedicado por tenant `erp_<slug>_<8hex>` (provisionado por RPC
    `neura_provision_empresa_data_schema`, ver migración `20260416140000_zentra_erp_full_tenant_clone.sql`).
  - La columna `empresas.data_schema` decide el schema del tenant; vacío ⇒ `zentra_erp`.
- **RLS:** funciones `empresa_id_actual()` (por email del JWT), `es_super_admin()`,
  `puede_acceder_empresa(uuid)` (`supabase/migrations/20250312000000_rls_multiempresa.sql`).
- **Roles:** `super_admin` (global, empresa_id NULL), `admin/administrador` (su empresa),
  `supervisor` (módulos asignados + omnicanal), resto (intersección empresa ∩ usuario).
- **Storage:** Supabase Storage (buckets observados: `chat_media`, `productos_imagenes`,
  XML/KuDE de SIFEN, archivos de tareas de proyectos, tickets de sorteos).$KB$, '{}'::text[], 4),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 5. Relaciones y dependencias funcionales$KB$, $KB$```
CRM (prospecto GANADO) ──crea──▶ Cliente ──▶ Facturas ──▶ Pagos ──▶ Comisiones
                                   │             │
                                   │             └─▶ Factura electrónica SIFEN ──▶ Nota de crédito
                                   ├─▶ Proyectos (Kanban, tareas, SLA)
                                   ├─▶ Agenda (citas por cliente/prospecto)
                                   └─▶ Suscripciones (Planes)

Compras ──entrada──▶ Inventario ◀──salida── Ventas
Proveedores ──▶ Compras            Gastos (independiente)

WhatsApp/Omnicanal: Canales ─▶ Conversaciones ─▶ Colas/Agentes ─▶ Cierres (taxonomía)
                       │            │
                       │            └─▶ Flujos bot (nodos, captura de datos, OCR)
                       ├─▶ Campañas (plantillas Meta/YCloud)
                       └─▶ Etiquetas (segmentación) ─▶ Campañas desde etiqueta

Sorteos: Sorteo ─▶ Conversación WhatsApp (bot) ─▶ Entrada (pago + comprobante OCR)
                   ─▶ Cupones numerados ─▶ Entrega por WhatsApp (texto/imagen)
                   └─▶ Revendedores (links públicos /r/[codigo], comisiones)

n8n (externo): webhooks ─▶ /api/crm/leads (lead desde WhatsApp)
                        ─▶ /api/raffles/entries/create (compra de sorteo)
```$KB$, '{}'::text[], 5),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 6. Puntos críticos (alto impacto si fallan)$KB$, $KB$1. **Facturación electrónica SIFEN** — certificados digitales, timbrado, XML firmado, envío a SET.
   Errores aquí tienen impacto fiscal/legal.
2. **Webhooks de WhatsApp (Meta/YCloud)** — toda la operación omnicanal y de sorteos depende de
   la recepción de mensajes entrantes.
3. **RLS / aislamiento multi-tenant** — la separación de datos entre empresas depende de RLS +
   resolución correcta de `data_schema`.
4. **Pagos y saldos de facturas** — el registro de pagos actualiza saldos; inconsistencias afectan
   cobranzas y comisiones.
5. **Motor de flujos (flow engine)** — sesiones de bot con estado; los sorteos venden a través
   de él.$KB$, '{}'::text[], 6),
    (null, $KB$Mapa Funcional del ERP — Neura/Zentra › 7. Permisos observados en producción (usuario tester)$KB$, $KB$Con el usuario tester de esta auditoría, las siguientes rutas **redirigen al dashboard** (módulos
no habilitados para su empresa): `/inventario*`, `/compras*`, `/proveedores*`, `/ventas*`,
`/sorteos*`, `/marketing`, `/dashboard/marketing-ops`, `/dashboard/colas-agentes`.
El resto de los módulos (dashboard, clientes, CRM, gastos, pagos, comisiones, planes, agenda,
proyectos, conversaciones, campañas, notas de crédito, usuarios, configuración) fue accesible
y está capturado en `screenshots/`.$KB$, '{}'::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$ventas$KB$, $KB$ventas$KB$, $KB$Ventas$KB$, $KB$docs/assistant/ventas.md$KB$, $KB$6a6968abffcc004e2ddaf0b0300f47f9047bdb11ba8312ffb2369a38a86650a5$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$ventas$KB$, $KB$Ventas$KB$, $KB$# Ventas

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción
> (sin capturas). Documentación basada en auditoría de código.$KB$, '{}'::text[], 0),
    ($KB$ventas$KB$, $KB$Ventas › Objetivo$KB$, $KB$Registrar órdenes de venta multi-producto, al contado o a crédito, en guaraníes o dólares,
con cálculo automático de IVA, descontando stock del inventario.$KB$, '{}'::text[], 1),
    ($KB$ventas$KB$, $KB$Ventas › Explicación funcional$KB$, $KB$| Ruta | Pantalla |
|---|---|
| `/ventas` | Listado de ventas + KPIs (facturación de hoy, cantidad, ticket promedio, productos vendidos) |
| `/ventas/nueva` | Nueva venta: cliente + líneas de producto + moneda + totales |

### Conceptos

- **Venta:** número de control, cliente, fecha, moneda (GS/USD) y tipo de cambio, tipo
  (CONTADO / CRÉDITO con plazo en días), observaciones.
- **Línea de venta:** producto, cantidad, precio, tipo de IVA (EXENTA / 5% / 10%); subtotal,
  IVA y total calculados automáticamente.
- Al confirmar, genera el movimiento de **SALIDA** en inventario.
- La factura (documento fiscal) se gestiona en el módulo de **Facturas/SIFEN** (ver
  `facturas.md`); la venta es la orden comercial.$KB$, '{}'::text[], 2),
    ($KB$ventas$KB$, $KB$Ventas › Casos de uso$KB$, $KB$- Venta de mostrador al contado en guaraníes.
- Venta a crédito 30 días a un cliente con condición de pago acordada.
- Venta en USD con tipo de cambio del día.$KB$, '{}'::text[], 3),
    ($KB$ventas$KB$, $KB$Ventas › Flujo paso a paso$KB$, $KB$1. **Ventas → Nueva** (`/ventas/nueva`).
2. Seleccionar cliente (buscador).
3. Agregar productos línea por línea (combobox de productos); ajustar cantidad y precio.
4. Verificar el IVA por línea y los totales calculados.
5. Elegir moneda y tipo de venta (contado/crédito + plazo).
6. Guardar → descuenta stock y queda en el listado con su número de control.$KB$, '{}'::text[], 4),
    ($KB$ventas$KB$, $KB$Ventas › Preguntas frecuentes$KB$, $KB$- **¿Una venta emite factura electrónica automáticamente?** No necesariamente: el ciclo SIFEN
  (XML → firma → envío a SET) se gestiona desde la factura (ver `facturas.md`).
- **¿Puedo vender sin stock?** Revisar la política de la empresa; el sistema registra la salida
  y puede quedar stock negativo si no hay control estricto.
- **¿Dónde veo el ticket promedio?** En el encabezado del listado de ventas y en el dashboard.$KB$, '{}'::text[], 5),
    ($KB$ventas$KB$, $KB$Ventas › Errores comunes$KB$, $KB$- Producto no aparece en el combobox: verificar que exista en Inventario y esté activo.
- Total en USD incorrecto: revisar el tipo de cambio ingresado.
- "Sin acceso": módulo `ventas` no habilitado.$KB$, '{}'::text[], 6),
    ($KB$ventas$KB$, $KB$Ventas › Capturas relacionadas$KB$, $KB$- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).$KB$, '{}'::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

with d as (
  insert into neura.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values ($KB$whatsapp$KB$, $KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas$KB$, $KB$docs/assistant/whatsapp.md$KB$, $KB$602e7e6855ceff5beb29df746443b727c5ed7a4d55913fc484ade016e1cc7e6a$KB$)
  returning id
)
insert into neura.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas$KB$, $KB$# WhatsApp: Canales, Plantillas y Campañas$KB$, '{}'::text[], 0),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Objetivo$KB$, $KB$Conectar los números de WhatsApp Business de la empresa al ERP (vía **Meta Cloud API** o
**YCloud**), recibir mensajes entrantes por webhook y enviar mensajes individuales, respuestas
de bot y **campañas masivas con plantillas aprobadas**.$KB$, '{}'::text[], 1),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Explicación funcional$KB$, $KB$### Canales

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
- **Sorteos:** la venta de boletos por WhatsApp usa los flujos bot (ver `sorteos.md`).$KB$, '{}'::text[], 2),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Casos de uso$KB$, $KB$- Lanzar una campaña de promoción a todos los contactos etiquetados "interesado-plan-premium".
- Reconectar con clientes inactivos usando una plantilla aprobada.
- Atender las respuestas de la campaña directamente en el Inbox.$KB$, '{}'::text[], 3),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Flujo paso a paso — Crear y lanzar una campaña$KB$, $KB$1. **Campañas → Nueva** (`/dashboard/campanas/nuevo`).
2. Elegir canal y plantilla (debe estar **aprobada** por Meta).
3. Cargar destinatarios (importación o etiqueta) y mapear las variables de la plantilla.
4. Validar la campaña (el sistema verifica variables y números).
5. Lanzar (o programar). Seguir el progreso de entregas en el detalle.$KB$, '{}'::text[], 4),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Preguntas frecuentes$KB$, $KB$- **¿Por qué mi mensaje libre no llega?** Fuera de la ventana de 24 h desde el último mensaje del
  cliente solo se pueden enviar plantillas aprobadas.
- **¿Cuánto tarda la aprobación de una plantilla?** La define Meta (minutos a días). El estado se
  ve tras sincronizar plantillas.
- **¿Puedo usar varios números?** Sí, un canal por número; cada uno con sus colas y plantillas.
- **¿Las respuestas de la campaña dónde caen?** En el Inbox omnicanal, ruteadas por cola.$KB$, '{}'::text[], 5),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Errores comunes$KB$, $KB$- *Plantilla rechazada:* revisar políticas de contenido de Meta y volver a enviarla.
- *Variables sin completar:* la validación de campaña falla; mapear todas las variables.
- *Token vencido / canal desconectado:* reconfigurar el canal en Configuración → Canales.
- *Números inválidos en la importación:* corregir formato internacional (+595…).$KB$, '{}'::text[], 6),
    ($KB$campanas$KB$, $KB$WhatsApp: Canales, Plantillas y Campañas › Capturas relacionadas$KB$, $KB$- `screenshots/marketing/02-campanas.png` — listado de campañas.
- `screenshots/marketing/03-form-nueva-campana.png` — alta de campaña.
- `screenshots/marketing/06-detalle-campana.png` — modal de detalle de campaña.
- `screenshots/configuracion/04-canales.png` — canales conectados.$KB$, array[$KB$screenshots/marketing/02-campanas.png$KB$, $KB$screenshots/marketing/03-form-nueva-campana.png$KB$, $KB$screenshots/marketing/06-detalle-campana.png$KB$, $KB$screenshots/configuracion/04-canales.png$KB$]::text[], 7)
) as x(module_slug, heading, content, screenshot_paths, sort_order);

commit;
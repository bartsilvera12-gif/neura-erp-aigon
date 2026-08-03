# Clientes y Gestión de Clientes

## Objetivo

Mantener la base centralizada de clientes (empresas o personas) con sus datos comerciales,
fiscales y de facturación, y dar al equipo de cobranzas un panel rápido de estado de cuenta.

## Explicación funcional

### Pantallas

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
- Estado: activo / inactivo (**baja operativa** = soft delete con auditoría).

## Casos de uso

- Alta de un cliente nuevo que llegó por recomendación (origen MANUAL).
- Conversión automática desde CRM cuando un prospecto pasa a GANADO.
- Cobranzas revisa en `/gestion-clientes` quiénes tienen facturas vencidas y registra
  tipificaciones (promesa de pago, reclamo).
- Cambio de plan de un cliente de suscripción.

## Flujos paso a paso

### Crear un cliente
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
2. El cliente pasa a **inactivo**; no se borra (queda auditoría e historial).

## Preguntas frecuentes

- **¿Puedo eliminar un cliente definitivamente?** Existe una previsualización de eliminación que
  valida dependencias (facturas, pagos); si tiene movimientos se recomienda baja operativa.
- **¿Quién puede ver mis clientes?** Solo usuarios de su misma empresa (aislamiento por RLS).
- **¿Para qué sirve el perfil tributario?** Define cómo se emite la factura electrónica SIFEN
  para ese cliente (tipo de receptor).
- **¿Qué diferencia hay entre Clientes y Gestión de Clientes?** Clientes es el maestro de datos;
  Gestión de Clientes es el panel operativo de cobranza (facturas pendientes, deuda, gestiones).

## Errores comunes

- RUC/documento duplicado: el sistema avisa si ya existe un cliente con esa identificación.
- No aparece el cliente en una venta: verificar que esté **activo**.
- No se puede facturar electrónicamente: falta completar el perfil tributario del cliente.

## Capturas relacionadas

- `screenshots/clientes/01-listado.png` — listado y filtros.
- `screenshots/clientes/02-form-nuevo.png` — formulario de alta.
- `screenshots/clientes/03-gestion-clientes.png` — panel de cobranzas.
- `screenshots/clientes/04-detalle-cliente.png` — modal de ficha del cliente (tabs y acciones).
- `screenshots/clientes/05-gestion-cliente-seleccionado.png` — gestión con cliente seleccionado.

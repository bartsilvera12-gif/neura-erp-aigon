# Facturas, Facturación Electrónica (SIFEN) y Notas de Crédito

## Objetivo

Emitir y gestionar facturas (contado, crédito, suscripción), cumplir con la facturación
electrónica de Paraguay (SIFEN/SET: XML firmado, CDC, KuDE) y corregir facturas mediante
notas de crédito con trazabilidad fiscal completa.

## Explicación funcional

### Facturas

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
  - El **saldo de la factura solo se impacta cuando la SET aprueba** la NC (transacción atómica).

## Casos de uso

- Emitir factura mensual de suscripción a un cliente de plan.
- Reenviar a SET una factura que quedó "en_proceso".
- Cliente devuelve el servicio: emitir nota de crédito por el saldo pendiente.
- Anular un borrador de NC creado por error.

## Flujos paso a paso

### Emitir factura electrónica
1. Crear/abrir la factura → panel "Factura electrónica".
2. **Generar XML** → revisar datos.
3. **Firmar** (requiere certificado vigente configurado).
4. **Enviar a SET** y luego **Consultar lote**.
5. Si aprueba: se guarda CDC, KuDE (PDF) y QR; estado `aprobado`.

### Crear una nota de crédito
1. Abrir la factura aprobada → bloque **Corrección fiscal** → "Nueva nota de crédito".
2. Confirmar el monto (saldo pendiente) y escribir el motivo (≥ 5 caracteres).
3. Guardar como borrador. Luego procesar el ciclo SIFEN (XML → firma → envío → consulta).
4. Cuando la SET aprueba, el saldo de la factura se actualiza automáticamente.

## Preguntas frecuentes

- **¿Qué es el CDC?** El Código de Control del documento electrónico asignado al aprobar; es el
  identificador fiscal único del documento.
- **¿Qué es el KuDE?** La representación gráfica (PDF) del documento electrónico para el cliente.
- **¿Por qué no puedo crear una NC?** Causas típicas: la factura aún puede cancelarse, ya existe
  una NC activa para esa factura, o la factura no está aprobada en SIFEN.
- **¿Qué pasa si SET rechaza?** El documento queda `rechazado` con el motivo; no impacta saldos.
  Corregir la causa y volver a generar/enviar.
- **¿Puedo facturar en ambiente de prueba?** Sí, configurando ambiente `test` en SIFEN
  (Configuración → Facturación electrónica).

## Errores comunes

- *Certificado vencido o contraseña incorrecta* → actualizar certificado en configuración SIFEN.
- *Timbrado inválido o fuera de fecha* → revisar timbrado y fecha de inicio configurados.
- *Lote en proceso mucho tiempo* → usar "Consultar lote" nuevamente; SET puede demorar.
- *RUC del receptor inválido* → corregir perfil tributario del cliente.

## Capturas relacionadas

- `screenshots/facturas/01-notas-credito.png` — listado de notas de crédito.
- `screenshots/facturas/03-detalle-factura.png` — detalle real de factura: resumen comercial,
  panel SIFEN aprobado en producción, NC rechazada por SET con su mensaje de error y CDC.
- `screenshots/configuracion/03-facturacion-electronica.png` — configuración SIFEN.
- `screenshots/pagos/01-listado.png` — pagos contra facturas (módulo relacionado).

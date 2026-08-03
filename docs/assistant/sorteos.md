# Sorteos

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción
> (sin capturas). Documentación basada en auditoría de código y docs internas (`docs/SORTEOS_N8N.md`).

## Objetivo

Operar rifas/sorteos de punta a punta: venta de boletos por WhatsApp (bot), validación de
comprobantes de pago con OCR, generación de cupones numerados, red de revendedores con
comisiones y entrega de tickets por WhatsApp.

## Explicación funcional

### Pantallas

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
  atómica.

## Casos de uso

- Lanzar un sorteo de fin de año con 5.000 boletos y una red de 20 revendedores.
- El operador revisa los comprobantes marcados "en revisión" por el OCR.
- Imprimir cupones físicos para venta presencial.

## Preguntas frecuentes

- **¿Qué pasa si el cliente paga de más/menos?** El OCR compara monto esperado vs detectado;
  diferencias van a revisión manual.
- **¿Puedo anular un cupón?** Sí; el cupón pasa a estado anulado y queda trazado.
- **¿Cómo se calcula la comisión del revendedor?** monto de la entrada × % del revendedor.
- **¿Se pueden enviar los tickets como imagen?** Sí, configurando el modo de entrega del sorteo
  (texto o texto+imagen con overlay del número).

## Errores comunes

- *Comprobante ilegible:* el bot pide reenviar la foto; si persiste, pasa a revisión humana.
- *Comprobante duplicado:* la referencia bancaria ya fue usada (regla anti-duplicados).
- *El link del revendedor no atribuye:* verificar que el link incluya el código y el sorteo.

## Capturas relacionadas

- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).

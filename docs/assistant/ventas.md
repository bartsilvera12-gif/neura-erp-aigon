# Ventas

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción
> (sin capturas). Documentación basada en auditoría de código.

## Objetivo

Registrar órdenes de venta multi-producto, al contado o a crédito, en guaraníes o dólares,
con cálculo automático de IVA, descontando stock del inventario.

## Explicación funcional

| Ruta | Pantalla |
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
  `facturas.md`); la venta es la orden comercial.

## Casos de uso

- Venta de mostrador al contado en guaraníes.
- Venta a crédito 30 días a un cliente con condición de pago acordada.
- Venta en USD con tipo de cambio del día.

## Flujo paso a paso

1. **Ventas → Nueva** (`/ventas/nueva`).
2. Seleccionar cliente (buscador).
3. Agregar productos línea por línea (combobox de productos); ajustar cantidad y precio.
4. Verificar el IVA por línea y los totales calculados.
5. Elegir moneda y tipo de venta (contado/crédito + plazo).
6. Guardar → descuenta stock y queda en el listado con su número de control.

## Preguntas frecuentes

- **¿Una venta emite factura electrónica automáticamente?** No necesariamente: el ciclo SIFEN
  (XML → firma → envío a SET) se gestiona desde la factura (ver `facturas.md`).
- **¿Puedo vender sin stock?** Revisar la política de la empresa; el sistema registra la salida
  y puede quedar stock negativo si no hay control estricto.
- **¿Dónde veo el ticket promedio?** En el encabezado del listado de ventas y en el dashboard.

## Errores comunes

- Producto no aparece en el combobox: verificar que exista en Inventario y esté activo.
- Total en USD incorrecto: revisar el tipo de cambio ingresado.
- "Sin acceso": módulo `ventas` no habilitado.

## Capturas relacionadas

- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).

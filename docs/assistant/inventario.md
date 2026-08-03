# Inventario

> ⚠️ **Nota de auditoría:** el usuario tester no tenía habilitado este módulo en producción,
> por lo que no hay capturas. Documentación basada en auditoría de código.

## Objetivo

Controlar productos, stock por depósito, valuación de inventario y todos los movimientos
(entradas por compra, salidas por venta, ajustes manuales).

## Explicación funcional

### Pantallas

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
- **Importación/exportación Excel** de productos (plantilla, vista previa y confirmación).

## Casos de uso

- Cargar el catálogo inicial por Excel.
- Registrar una rotura/merma como ajuste de salida.
- Detectar productos bajo stock mínimo desde el dashboard.
- Consultar el historial de movimientos de un producto antes de un inventario físico.

## Flujos paso a paso

### Alta de producto
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
- Una **venta** confirma → movimiento de **SALIDA**.

## Preguntas frecuentes

- **¿Cómo importo mis productos?** Desde el listado: descargar plantilla Excel, completarla,
  subirla, revisar la vista previa y confirmar.
- **¿Puedo tener varios depósitos?** Sí, en `/inventario/ubicaciones`; cada producto tiene
  ubicación principal.
- **¿Cómo se calcula el costo?** Según el método de valuación del producto (costo promedio
  ponderado por defecto), actualizado en cada entrada.

## Errores comunes

- SKU duplicado al importar: corregir el Excel y reintentar (la vista previa lo marca).
- Stock negativo: revisar si faltó registrar una compra/entrada antes de la venta.
- "Sin acceso": el módulo `inventario` no está habilitado para la empresa o el usuario.

## Capturas relacionadas

- Pendientes (módulo no habilitado para el usuario tester — ver `recommendations.md`).

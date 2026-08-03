# Compras, Proveedores y Gastos

> ⚠️ **Nota de auditoría:** Compras y Proveedores no estaban habilitados para el usuario tester
> en producción (sin capturas). Gastos sí fue auditado visualmente.

## Objetivo

Registrar el ciclo de abastecimiento: proveedores, órdenes de compra (que alimentan el
inventario y el costo promedio) y gastos operativos de la empresa.

## Explicación funcional

### Compras

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
  frecuencia (mensual/trimestral), fecha y usuario.

## Casos de uso

- Reposición de stock: compra al proveedor habitual a crédito 30 días.
- Carga del alquiler como gasto fijo mensual recurrente.
- Análisis de gastos variables del trimestre.

## Flujos paso a paso

### Registrar una compra
1. **Compras → Nueva** (`/compras/nueva`).
2. Elegir proveedor y producto; ingresar cantidad y costo unitario.
3. Elegir tipo de IVA y tipo de pago (contado/crédito).
4. Guardar → entrada de inventario + costo promedio actualizado.

### Registrar un gasto
1. **Gastos → Nuevo** (`/gastos/nuevo`).
2. Completar categoría, descripción, monto y tipo (fijo/variable).
3. Marcar recurrente si corresponde, con su frecuencia. Guardar.

## Preguntas frecuentes

- **¿La compra actualiza el precio de venta?** Puede sugerirlo por margen, pero el precio lo
  controla el producto en Inventario.
- **¿Puedo exportar las compras?** Sí, desde el listado (exportación a Excel).
- **¿Los gastos recurrentes se generan solos?** La recurrencia queda registrada para reportes;
  verificar la generación automática según versión.

## Errores comunes

- Compra sin proveedor: dar de alta el proveedor primero.
- "Sin acceso": módulos `compras`/`gastos` no habilitados para la empresa o usuario.

## Capturas relacionadas

- `screenshots/gastos/01-listado.png` — listado de gastos.
- `screenshots/gastos/02-form-nuevo-gasto.png` — alta de gasto.
- Compras/Proveedores: pendientes (módulo no habilitado para el tester).

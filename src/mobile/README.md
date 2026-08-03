# `src/mobile/`

UI **mobile independiente** del ERP. Diseño propio, no responsive de la versión
desktop. Se monta solo cuando el `DeviceRouter` (en `src/shared/device/`) detecta
un viewport < 1024px o un User-Agent mobile.

## Estructura

- `layout/` — shell mobile (`MobileAppShell`, `MobileHeader`, `BottomNav`).
- `pages/` — pantallas mobile, una por módulo (se irán agregando módulo por módulo).
- `components/` — componentes mobile reutilizables (cards, sheets, drawers, etc.).

## Regla de oro

**Cero lógica de negocio acá.** Todo lo que sea fetching, validación, transformación
o estado, consumirlo desde `src/shared/`. Si descubrís que un hook compartido no
existe todavía, primero crealo en `shared/` y después usalo.

## Migración por módulo

Cada módulo se porta como sigue:

1. **Refactor a shared/** — extraer hooks de datos, tipos y utilidades del componente
   desktop hacia `shared/`. Verificar que desktop sigue funcionando igual.
2. **Construir la pantalla mobile** — crear el archivo correspondiente en `mobile/pages/`,
   consumiendo los hooks compartidos.
3. **Activar en la página** — actualizar el `page.tsx` del módulo para usar
   `<DeviceRouter desktop={...} mobile={...} />`.

Hasta que un módulo no tenga su contraparte mobile lista, el DeviceRouter cae al
desktop como fallback para esa ruta (los usuarios mobile siguen viendo la versión
parchada con responsive).

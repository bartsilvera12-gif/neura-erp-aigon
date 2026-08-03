# `src/shared/`

Capa **compartida** entre la UI desktop (`src/components/`, `src/app/**/components/`)
y la UI mobile (`src/mobile/`). Acá vive todo lo que NO es presentación:

- `device/` — detección de dispositivo y DeviceRouter.
- `hooks/` — hooks de data fetching (SWR) y estado global compartido.
- `types/` — tipos de dominio compartidos (Proyecto, Cliente, etc.).
- `api/` — wrappers de fetch a los endpoints del ERP.
- `utils/` — utilidades puras (formatters, validaciones, helpers).

Regla: **NO debe haber JSX** en esta carpeta (excepto `DeviceRouter.tsx` que es un
server component "lógico", no visual).

## Migración

Esta carpeta se va llenando módulo por módulo durante la Fase 2 del refactor mobile
(ver `MOBILE_PLAN.md`). El criterio para mover algo acá:

- Si el código se usa (o se va a usar) tanto desde desktop como desde mobile.
- Si es lógica de negocio, fetching, validación o transformación de datos.
- Si NO depende del DOM ni de componentes visuales.

Mucho de lo que va a vivir acá ya existe en `src/lib/` — la idea es ir consolidando
ahí lentamente sin romper imports existentes.

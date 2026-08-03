# Auditoría Mobile — ERP Neura

**Viewport objetivo:** 375–430px (mobile, primariamente iOS Safari y Chrome Android)
**Fecha:** 2026-06-10
**Stack:** Next.js 16 (App Router) + TypeScript + Tailwind
**Alcance:** `src/components/` (shell global) + `src/app/**` (módulos del ERP). Solo auditoría; **no se modificó código**.

---

## Resumen ejecutivo

- **Módulos auditados:** ~30 (Dashboard, Conversaciones, CRM, Proyectos, Ventas, Compras, Inventario, Clientes, Pagos, Notas crédito, Comisiones, Gastos, Sorteos, Campañas, Marketing Ops, Configuración, Usuarios, Planes, Admin Empresas, Agenda, Monitoreo, Gerencia, Historial omnicanal, Etiquetas, Facturas, etc.).
- **Hallazgos severidad alta:** 14
- **Hallazgos severidad media:** 18
- **Hallazgos severidad baja:** 7
- **Veredicto general:** el ERP **no fue diseñado para mobile**. El shell impide su uso real bajo 768px (sidebar fija 260px, sin drawer, sin botón hamburguesa). Aun arreglando la shell, decenas de pantallas requieren rediseño porque dependen de tablas anchas (`min-w-[900–1200px]`), modales `max-w-5xl/7xl` con altura `h-[88–94vh]` y kanban con `min-w-max`.
- **Módulos sin problemas mayores (relativo):** Login (`/login`), Facturas detalle (`/facturas/[id]`) — usa `max-w-6xl mx-auto` con paddings responsive; Configuración portada (`/configuracion`) — usa `sm:grid-cols-2 xl:grid-cols-3` correctamente.
- **Módulos más críticos (ordenados por severidad+cantidad):**
  1. **Shell global** (Sidebar + Header + AppShell) — bloquea TODAS las pantallas.
  2. **Conversaciones / Inbox omnicanal** (`/dashboard/conversaciones`) — layout tipo desktop multi-panel (lista + chat + drawer), 68 ocurrencias `text-xs/text-sm` en inputs, filtros con `min-w-[12rem]` cada uno.
  3. **Proyectos Kanban** (`/dashboard/proyectos`) — `max-w-[1800px]`, columnas con `min-w-max`, modal detalle `h-[88vh] max-w-5xl`.
  4. **CRM funnel** (`/crm`) — Kanban `min-w-max`, KPIs en `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` (en 375px caben pero las cards quedan ilegibles).
  5. **Pagos** (`/pagos`) — dos tablas con `min-w-[960px]` y `min-w-[1040px]`.
  6. **Gestión Clientes** (`/gestion-clientes`) — tabla `min-w-[1040px]`, grid hasta `xl:grid-cols-5`.
  7. **Notas de crédito** (`/notas-credito`) — tabla `min-w-[1200px]`, KPIs `xl:grid-cols-6`.
  8. **Sorteos** (cupones, entradas, tickets) — tablas `min-w-[960–1140px]`.

---

## Hallazgos globales (shell, sidebar, header)

### G1. Sidebar siempre visible y no operable en mobile
- **Archivo:** `src/components/layout/Sidebar.tsx`
- **Línea:** 577–584 (raíz `motion.aside`), 581 `animate={{ width: collapsed ? 80 : 260 }}`.
- **Severidad:** **alta** (crítico — bloquea todo el ERP en mobile).
- **Problema:** El sidebar es un `aside` flex-shrink-0 con ancho fijo 260px (o 80px colapsado). En un viewport de 375px ocupa **69% del ancho**, dejando ~115px para el contenido. No hay breakpoint mobile, no se oculta, no es un drawer. El botón "colapsar" reduce a 80px (21% del viewport) y aun así es desperdicio.
- **Solución recomendada:** convertir el sidebar en un `Sheet` / Drawer en `<md` (768px). Trigger hamburguesa en el Header (ver G2). Mantener `motion.aside` solo en `md:flex`. Patrón: `className="hidden md:flex"` en el aside + un componente `<MobileSidebar>` con `Sheet` controlado por estado en el Header.

### G2. Header sin botón hamburguesa, controles solo del lado derecho
- **Archivo:** `src/components/layout/Header.tsx`
- **Línea:** 82–142.
- **Severidad:** **alta**.
- **Problema:** `h-16` justificado a la derecha (`justify-end`), solo notificaciones + avatar. No expone botón para abrir el sidebar/menú; tampoco título de página ni breadcrumb. En mobile, sin sidebar accesible, el usuario queda sin navegación.
- **Solución recomendada:** agregar a la izquierda un botón hamburguesa `md:hidden` que controle el drawer del Sidebar. Opcional: título de la ruta actual (truncado) al centro.

### G3. AppShell con `p-6` (24px) en `<main>` sin variante mobile
- **Archivo:** `src/components/AppShell.tsx`
- **Línea:** 33 — `<main ... className="... p-6">`.
- **Severidad:** **media**.
- **Problema:** padding 24px en mobile consume 48px del ancho útil (de 375 → 327px). Combinado con G1, las páginas tienen ~67px útiles si el sidebar siguiera visible.
- **Solución recomendada:** `p-4 sm:p-6` (o `px-4 py-4 sm:p-6`).

### G4. Botón colapsar sidebar < 44x44
- **Archivo:** `src/components/layout/Sidebar.tsx` línea 602–609.
- **Severidad:** baja.
- **Problema:** `rounded-lg p-2` con icono `h-5 w-5`. Target ~36x36. Y los `<button>` de favorito/expand usan `p-1 h-3.5 w-3.5` (target ~22x22) — fuera de mínimo táctil. Aplica al sidebar entero (líneas 271–291, 359–370).
- **Solución recomendada:** subir a `p-2.5` mínimo y aplicar zonas táctiles ≥40px en touch.

---

## Patrones recurrentes (consolidados — ver módulos abajo para referencias)

> Mejor consolidarlos acá que repetir el mismo hallazgo en cada módulo.

### P1. Tablas con `min-w-[900–1200px]` sin scroll container que limite al viewport
- **Aparición:** `pagos/page.tsx:464,645` (960/1040), `notas-credito/NotasCreditoListClient.tsx:375` (1200), `comisiones/page.tsx:397` (980), `planes/page.tsx:320` (900), `campanas/CampanasListClient.tsx:334` (900), `sorteos/entradas/page.tsx:264` (960), `sorteos/cupones/page.tsx:240` (1140), `conversaciones-finalizadas/FinalizedClosuresClient.tsx:434` (1000), `gestion-clientes/page.tsx:1191` (1040).
- **Severidad:** **alta** en todas.
- **Problema:** El `min-w-[]` aplica al `<table>`. Si el padre no tiene `overflow-x-auto` confinado a una zona, el scroll horizontal contamina toda la página y los headers del shell.
- **Solución recomendada genérica:** envolver cada tabla en `<div className="-mx-4 sm:mx-0 overflow-x-auto"><table>…</table></div>`. **O mejor**: bajo `md`, renderizar una **lista de cards** en lugar de la tabla (lista por fila con label/valor en stack vertical). Crear un componente `ResponsiveTable` reutilizable.

### P2. Modales `h-[88–94vh]` con `max-w-4xl/5xl/6xl/7xl`
- **Aparición:** `clientes/components/ClienteDetalleModal.tsx:56` (`h-[92vh] max-w-6xl`), `usuarios/components/UsuarioNuevoModal.tsx:50` y `UsuarioDetalleModal.tsx:58` (`h-[94vh] max-w-7xl`), `planes/components/PlanNuevoModal.tsx:50` y `PlanDetalleModal.tsx:58` (`max-w-7xl`), `dashboard/proyectos/components/ProyectoDetalleModal.tsx:65` (`max-w-5xl`), `configuracion/colas/components/ColaEditorModal.tsx:61` (`max-w-4xl`), `dashboard/marketing-ops/components/MarketingOpsPiezaDetalleModal.tsx:82` (`max-w-5xl`), `notas-credito/components/NotaCreditoDetalleModal.tsx:50`.
- **Severidad:** **alta**.
- **Problema:** En mobile, `max-w-7xl` (~80rem) se reduce al viewport pero los layouts internos (formularios `grid-cols-2`, tabs horizontales, dos columnas de detalle) no colapsan. `h-[94vh]` deja 6vh = ~50px para el chrome del browser y la barra inferior de iOS, recortando el footer del modal.
- **Solución recomendada genérica:** en mobile el modal debería ser **full-screen** (`inset-0 w-full h-[100dvh] rounded-none`), con `max-h-[100dvh]` y scroll interno; pasar a `max-w-Xl rounded-2xl` solo en `sm:` o `md:`. Usar `dvh` en vez de `vh` (iOS).

### P3. Formularios con `grid grid-cols-2` o `grid-cols-3` sin variante mobile
- **Aparición:** `compras/nueva/page.tsx:422,507,644,690` (`grid-cols-2/3` directo), `inventario/nuevo/page.tsx:376,489,550,665` (`grid-cols-2/3` directo), `inventario/[id]/editar/page.tsx:318,468,502,519`, `inventario/movimientos/nuevo/page.tsx:114,145`, `clientes/[id]/tipificacion/page.tsx:189`, `clientes/components/ClienteDetalleClient.tsx:1564,1584,1595,1611,1693,1733,1769,1797,1900,2417`, `dashboard/agenda/components/CitaFormModal.tsx:287,323,394,404` (`grid-cols-3/2` directo), `configuracion/politicas/page.tsx:39,90`, `configuracion/preferencias/page.tsx:45,70`, `usuarios/components/UsuarioDetalleClient.tsx:556,572,593,616,760`.
- **Severidad:** **alta** cuando son formularios con inputs (`compras/nueva`, `inventario/nuevo`, `clientes/tipificacion`, `CitaFormModal`); **media** cuando son detalles read-only.
- **Solución recomendada genérica:** sustituir todos los `grid-cols-2` "duros" por `grid grid-cols-1 sm:grid-cols-2`. Ídem `grid-cols-3` → `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### P4. Inputs `text-xs` / `text-sm` (font-size < 16px) — zoom en iOS Safari
- **Aparición:** patrón ubicuo. Conteo en `ConversacionesClient.tsx`: 68 ocurrencias. También en `dashboard/historial/page.tsx:185`, `ventas/page.tsx:252`, `proveedores/page.tsx:88`, prácticamente todos los modales y formularios.
- **Severidad:** **media** (no rompe pero produce zoom involuntario al tap-focus en iOS).
- **Solución recomendada genérica:** definir clase utilitaria `input-mobile` con `text-base sm:text-sm` (16px en mobile, 14px en desktop) y aplicarla globalmente a `<input>`, `<select>`, `<textarea>`. **O** setear `<meta name="viewport" content="..., maximum-scale=1">` (no recomendado — bloquea accesibilidad). La primera opción es la correcta.

### P5. KPIs en `grid-cols-2` con cards densas
- **Aparición:** `page.tsx:910,1465,1965,2264` (Dashboard), `crm/page.tsx:896` (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`), `notas-credito/NotasCreditoListClient.tsx:234` (`sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6`), `dashboard/etiquetas/EtiquetasClient.tsx:671`, `dashboard/gerencia/GerenciaClient.tsx:145`, `dashboard/monitoreo/page.tsx:225`, `gestion-clientes/page.tsx:981`, `pagos/page.tsx:298`, `gastos/page.tsx:131`, `usuarios/page.tsx:187`, `comisiones/page.tsx:367,503,637,771,788,810`.
- **Severidad:** **media**. En 375px, las cards con valores monetarios `Gs. 12.345.678` con `text-2xl` se desbordan o se truncan.
- **Solución recomendada genérica:** habilitar scroll horizontal de KPIs en mobile (`flex overflow-x-auto snap-x` con cards `w-[80%] snap-center`) **o** apilar `grid-cols-1` en mobile cuando los valores son largos. El dashboard ya usa `clamp(font-size)` con container queries (línea 1150), pero solo aplica al `FinMontoGs` — extender el patrón.

### P6. Filtros horizontales con muchos elementos `min-w-[150–220px]`
- **Aparición:** `clientes/page.tsx:514–583` (4 selects), `dashboard/proyectos/ProyectosKanbanClient.tsx:527–598` (5 selects), `planes/page.tsx:234–277`, `campanas/CampanasListClient.tsx:252–295`, `dashboard/conversaciones/ConversacionesClient.tsx:2319–2399` (3+ selects `min-w-[12rem]`).
- **Severidad:** **media**.
- **Problema:** en mobile el `flex flex-wrap` los apila uno por línea — usable pero ocupa 5–6 filas. Cada select arrastra `min-w-[150px]` y un padding generoso.
- **Solución recomendada genérica:** botón "Filtros (N)" que abre un `Sheet`/Drawer con los filtros en stack vertical en mobile; mantener barra inline en desktop.

### P7. Kanban con `min-w-max`/`flex` que solo scrollea horizontal
- **Aparición:** `crm/page.tsx:929–930` (`min-w-max items-start gap-3` columnas con `w-[280px]` típicamente), `dashboard/proyectos/ProyectosKanbanClient.tsx:474` (`max-w-[1800px]` + bandeja columnas).
- **Severidad:** **alta** en mobile.
- **Problema:** Kanban es inherentemente desktop. En mobile, scrollear horizontalmente entre 5+ columnas + intentar arrastrar cards con dnd es inviable.
- **Solución recomendada:** bajo `md`, exponer una vista alternativa: select de etapa + lista vertical de cards de esa etapa; o tabs por etapa con swipe.

### P8. Botones de acción de fila < 44x44
- **Aparición:** `dashboard/proyectos/ProyectosKanbanClient.tsx` (botones de iconos `h-3.5 w-3.5` en cards), botones favoritos/expand de Sidebar (G4), botones ⋯ de tablas.
- **Severidad:** baja-media.
- **Solución:** subir hit-area mediante `p-2.5` o pseudo-elemento `::before` que expanda touch-target.

---

## Módulo: Dashboard (`/`)

### D1. Dashboards financiero/gerencia asumen ≥1024px
- **Archivo:** `src/app/page.tsx`
- **Líneas:** 942 (`lg:grid-cols-2`), 1038 (`sm:grid-cols-3`), 1466 (`xl:grid-cols-4`), 1736 (`lg:grid-cols-2`), 1845 (`lg:grid-cols-5`), 1999 (`lg:grid-cols-3`), 2264 (`xl:grid-cols-4`), 2372 (`lg:grid-cols-2`).
- **Severidad:** **media**.
- **Problema:** los `grid-cols-1 lg:grid-cols-X` colapsan correctamente en mobile, pero el archivo tiene >2300 líneas con tablas (línea 1074 y 1091 con `max-w-[160px]/[140px]/[120px] truncate`). La tabla "Altas del período" no tiene `min-w-[]` pero sigue saliendo del viewport por la cantidad de columnas (6).
- **Solución:** P1 (responsive table → cards en mobile).

### D2. Métricas con `text-2xl/3xl` para Gs. larguísimos
- **Líneas:** 1130–1162 — el componente `FinMontoGs` ya usa `clamp` y container queries. **Bien**.
- **Severidad:** baja. Verificación: los demás `MetricCard` (ej. `crm/page.tsx`) no aplican este patrón → riesgo de overflow.

---

## Módulo: Conversaciones (`/dashboard/conversaciones`)

### C1. Layout multi-panel asume desktop
- **Archivo:** `src/app/dashboard/conversaciones/ConversacionesClient.tsx`
- **Severidad:** **alta**.
- **Problema:** la UI es un Inbox tipo Slack/Front: lista de conversaciones + panel de mensajes + drawer de contacto. En 375px hay que tomar una decisión: tabs/swipe entre paneles, o ruteo separado por panel.
- **Solución:** rediseño: bajo `md`, mostrar UN solo panel a la vez con navegación tipo iOS (back button entre lista → chat → detalle).

### C2. Header del módulo con filtros densos
- **Líneas:** 2319–2399 — 3 selects con `min-w-[11–12rem]` + búsqueda `max-w-[14rem]` + label flex (líneas 2340, 2366, 2394).
- **Severidad:** alta.
- **Solución:** P6 (filtros en sheet).

### C3. Inputs y selects `text-xs` masivos
- **Conteo:** 68 ocurrencias `text-xs/text-sm` en el archivo. Líneas 1995, 2319, 2332, 2345, 2371, 2399 son inputs/selects.
- **Severidad:** media (zoom iOS).
- **Solución:** P4.

### C4. Toggle "Ocultar/Mostrar barra" — `text-[11px]` y `h-3.5 w-3.5`
- **Líneas:** 2107–2151.
- **Severidad:** baja. Target táctil chico.

---

## Módulo: Historial omnicanal (`/dashboard/historial`)

### H1. Layout split aside + section
- **Archivo:** `src/app/dashboard/historial/page.tsx`
- **Líneas:** 201–228. `aside w-full max-w-[360px]` al lado de `section flex-1`.
- **Severidad:** **alta** en mobile: caben los dos pero el aside `max-w-[360px]` ocupa 96% del viewport; el panel derecho queda en ~15px.
- **Solución:** colapsar a flujo único (lista → detalle con back button) bajo `md`.

### H2. Inputs `text-sm` (línea 185)
- Patrón P4.

---

## Módulo: Proyectos (`/dashboard/proyectos`)

### Pr1. Kanban — ver P7
- **Archivo:** `ProyectosKanbanClient.tsx:474–600`.

### Pr2. Modal de detalle `h-[88vh] max-w-5xl`
- **Archivo:** `components/ProyectoDetalleModal.tsx:65`. Patrón P2.

### Pr3. Detalle interno (`ProyectoDetalleInner.tsx`)
- **Líneas:** 1090 `max-w-5xl space-y-6 p-6`, 1135 `min-w-[180px]`, 1257–1292 (`max-w-[55%]` en `<dd>` — funciona ok), 1795 `min-w-[150px]`, 2325 `max-w-[140px] truncate`.
- **Severidad:** media. El `p-6` mobile es excesivo (P3 ya cubre `space-y-6 p-6` → necesita `p-4 sm:p-6`).
- **Solución:** revisar paddings y stacks de hijos.

### Pr4. ClienteSearchSelect — `min-w-[200px]` (línea 42)
- En mobile el padre debe permitirle apilarse con `flex-wrap`.

---

## Módulo: CRM (`/crm`)

### CR1. Pipeline kanban — P7
- **Archivo:** `crm/page.tsx:929`.

### CR2. KPIs `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` (línea 896)
- **Severidad:** media. En 375px caben 2 columnas pero las cards `MetricCard` con valores `Gs. ...` se ven apretadas (sin clamp como `FinMontoGs`).

### CR3. Formularios prospecto — `grid-cols-2 sm:` (ProspectoNuevoForm, ProspectoDetalleForm)
- Patrón P3. Buenos (`sm:grid-cols-2`) — colapsan a 1 col bajo `sm`.

---

## Módulo: Ventas

### V1. Lista `/ventas` — tabla simple
- **Archivo:** `ventas/page.tsx`. Métricas `grid-cols-2 md:grid-cols-4` (línea 203, OK). Filtros input con `min-w-64` (línea 252). Hay `overflow-x-auto` (1 ocurrencia) que envuelve la tabla. **Aceptable**.
- **Severidad:** baja.

### V2. Nueva venta (`/ventas/nueva`)
- **Archivo:** `ventas/nueva/page.tsx`. `max-w-7xl` (línea 390), `grid-cols-1 md:grid-cols-2` (396). Form colapsa bien en mobile pero el contenedor `max-w-7xl` no impone padding mobile.
- **Severidad:** baja-media.

---

## Módulo: Compras

### Co1. Nueva compra (`/compras/nueva`)
- **Archivo:** `compras/nueva/page.tsx`.
- **Líneas:** 422, 507, 644 (`grid grid-cols-2 gap-4/6`), 690 (`grid-cols-3`). **Patrón P3 — todos sin variante mobile**.
- **Severidad:** **alta**.

### Co2. Listado (`/compras`)
- Una tabla con `overflow-x-auto`. Severidad baja.

---

## Módulo: Inventario

### I1. `/inventario` (lista)
- KPIs `grid-cols-2 md:grid-cols-4` (línea 168) — OK.
- Filtro `min-w-[14rem]` (línea 226) — patrón P6.
- Tabla con `overflow-x-auto`.

### I2. `/inventario/nuevo` y `/inventario/[id]/editar`
- **Archivos:** `inventario/nuevo/page.tsx:332` (`max-w-5xl`), 376, 489, 550, 665 (`grid-cols-2/3` directos) — **P3 alta**.
- **`/editar/page.tsx:293` (`max-w-5xl`), 318, 468, 502, 519** — idéntico.
- **Severidad:** **alta**.

### I3. `/inventario/movimientos/nuevo`
- **Líneas:** 114, 145 — `grid-cols-2 gap-6`. P3 alta.

### I4. `/inventario/ubicaciones`
- Línea 121: `grid grid-cols-1 md:grid-cols-4` — OK, colapsa.

---

## Módulo: Clientes

### Cl1. `/clientes` (lista) — filtros densos
- **Líneas:** 514–583 — 4 selects `min-w-[140–200px]`. Patrón P6.

### Cl2. `ClienteDetalleModal` — `h-[92vh] max-w-6xl`
- **Archivo:** `components/ClienteDetalleModal.tsx:56`. Patrón P2 (alta).

### Cl3. `ClienteDetalleClient.tsx` — múltiples `grid-cols-2/3` duros
- **Líneas:** 1564, 1584, 1595, 1611 (`grid-cols-2`), 1693, 1733 (`grid-cols-3`), 1769, 1797, 1900, 2417 (`grid-cols-2`). **P3 alta** (formularios + detalles).
- **Línea 125, 1128:** `grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7` para barras horizontales — funciona pero las barras `h-8 flex-1 max-w-[7rem]` quedan muy chicas en 375px / 2 cols. Severidad media.

### Cl4. `ClienteNuevoForm.tsx`
- **Líneas:** 469, 517, 542, 579, 676, 739 — `grid gap-4 sm:grid-cols-2` ✓ (colapsa).
- **Línea 854:** `grid grid-cols-2 gap-4` directo — P3 (media).

### Cl5. `/clientes/[id]/tipificacion`
- **Línea 145:** `max-w-4xl` + **línea 189:** `grid grid-cols-2 gap-4 mb-4` directo. P3 alta.

---

## Módulo: Pagos

### Pg1. Dos tablas grandes
- **Archivo:** `pagos/page.tsx`. Líneas 464 (`min-w-[960px]`), 645 (`min-w-[1040px]`). Patrón P1 alta.
- KPIs `sm:grid-cols-3` (línea 298) — OK.
- Filtros `min-w-[10rem]` x3 + búsqueda `min-w-[14rem]` (líneas 359–377) — patrón P6.

### Pg2. Celdas `min-w-[12rem] lg:min-w-[16rem]`
- Líneas 487, 668. Refuerza el desbordamiento (P1).

---

## Módulo: Notas de crédito

### NC1. Tabla `min-w-[1200px]`
- **Archivo:** `notas-credito/NotasCreditoListClient.tsx:375`. **P1 alta** (la más ancha de todas).
- KPIs `xl:grid-cols-6` (línea 234) — colapsa pero `text-2xl` puede desbordar (P5).

### NC2. Modal detalle (`NotaCreditoDetalleModal.tsx:50`) `h-[92vh] max-w-5xl` — P2 alta.

### NC3. Detalle página (`NotaCreditoDetalleClient.tsx:86,177`)
- `max-w-5xl px-4 py-8` ✓.
- `grid grid-cols-1 sm:grid-cols-2` ✓.

---

## Módulo: Comisiones

### Cm1. Tabla `min-w-[980px]` (línea 397) — P1 alta.
### Cm2. KPIs múltiples con `lg:grid-cols-4/5` — P5 media.
### Cm3. `min-w-[200px]` en celdas (línea 348) — refuerza desbordamiento.

---

## Módulo: Gastos

### G1. `/gastos` lista
- Filtros `sm:grid-cols-3` (línea 131) ✓.
- Tabla con `overflow-x-auto`, columnas con `max-w-[280px] truncate` (línea 264). Aceptable.
- **Severidad:** baja.

### G2. `/gastos/nuevo` y `/gastos/[id]/editar` — no auditados en detalle (requiere verificación).

---

## Módulo: Sorteos

### S1. `/sorteos` lista
- Tabla en `SorteosListClient.tsx` con `overflow-x-auto`.

### S2. `/sorteos/tickets` — tabla `min-w-[14rem]` filtros + tabla con `overflow-x-auto`.
- Línea 157: `max-w-6xl` + `space-y-6` (P3 padding mobile).
- Severidad media.

### S3. `/sorteos/entradas` — tabla `min-w-[960px]` (línea 264). **P1 alta**.

### S4. `/sorteos/cupones` — tabla `min-w-[1140px]` (línea 240). **P1 alta**.

### S5. `/sorteos/[id]/imprimir-cupones/PhysicalCouponsPrintClient.tsx`
- Línea 468: `max-w-5xl`. Línea 594: input `min-w-[200px]` con `text-sm`. P4 media. Vista de impresión — uso mobile improbable.

### S6. `/sorteos/conversaciones`, `/sorteos/[id]/revendedores*` — no auditados al detalle (requiere verificación).

---

## Módulo: Campañas

### Ca1. `/dashboard/campanas` (lista)
- **Archivo:** `CampanasListClient.tsx`. Tabla `min-w-[900px]` (línea 334) — P1 alta.
- KPIs `sm:grid-cols-3` (línea 225) ✓.
- Filtros con `min-w-[150px]` (252, 280, 295) — P6.

### Ca2. `/dashboard/campanas/[id]` detalle
- **Archivo:** `CampanasDetailClient.tsx`. `sm:grid-cols-4` (557), `sm:grid-cols-2` (849), `overflow-x-auto`. Aceptable.

### Ca3. `/dashboard/campanas/nuevo` — no auditado al detalle.

---

## Módulo: Marketing Ops

### MO1. `MarketingOpsClient.tsx`
- Línea 309: `max-w-[1600px]`. Línea 504: celda `max-w-[280px]`. Tabla con `overflow-x-auto`. Media.

### MO2. `MarketingOpsPiezaDetalleModal.tsx:82` — `h-[90vh] max-w-5xl`. P2 alta.
### MO3. `MarketingOpsPiezaDetalleClient.tsx:140` — `max-w-6xl p-4 md:p-6` ✓.

---

## Módulo: Marketing (legacy)

### M1. `/marketing/page.tsx`
- Línea 284: `grid-cols-2 gap-3 md:grid-cols-5` ✓.
- Línea 375: `grid-cols-2 lg:grid-cols-5` ✓.
- **Línea 746:** `grid min-w-[640px] grid-cols-7 gap-1 p-2` — **calendario semanal con 7 columnas y `min-w-[640px]`**. En 375px no entra. P1/P7 — **alta**.
- Línea 471: botón `min-w-[140px]` y línea 320 `min-w-[150px]`.

---

## Módulo: Gestión Clientes

### GC1. `/gestion-clientes`
- KPIs `lg:grid-cols-4` (línea 981) ✓.
- Grid `xl:grid-cols-5` (línea 1056) ✓.
- **Línea 1142:** `grid grid-cols-2 gap-1.5 ... sm:grid-cols-3 lg:grid-cols-7` — en mobile cabe pero con `text-xs` apretado.
- **Línea 1191:** tabla `min-w-[1040px]` — **P1 alta**.
- Línea 629, 1020: `min-w-[200px] / [10rem]` — patrón filtros.

---

## Módulo: Configuración

### Cf1. Portada (`/configuracion`)
- `max-w-6xl px-4 sm:px-6 lg:px-8` + grid `sm:grid-cols-2 xl:grid-cols-3` ✓. **Sin problemas mayores**.

### Cf2. `/configuracion/proyectos`
- Línea 357: `sm:grid-cols-3` ✓.
- Líneas 447, 565: `grid gap-4 md:grid-cols-4` ✓.
- Línea 667: `lg:grid-cols-2` ✓.
- Línea 680: `min-w-[180px]` en cards — patrón filtros/cards. Severidad baja.
- Línea 695: `sm:grid-cols-2` ✓.

### Cf3. `/configuracion/politicas`, `/preferencias`
- `grid grid-cols-2 gap-4` directos (politicas 39, 90; preferencias 45, 70) — **P3 media** (read-only mayormente).
- `grid-cols-2 gap-3 sm:grid-cols-4` (124, 96) — el primero queda 2-col en mobile, OK.

### Cf4. `/configuracion/colas` (lista) y `ColaEditor.tsx`
- Lista `max-w-4xl` ✓ (`/configuracion/colas/page.tsx:123`).
- `ColaEditor.tsx`: filas `min-w-[200px]` (643, 735) + tabla pequeña. Media.
- `ColaEditorModal.tsx:61` — `h-[90vh] max-w-4xl`. P2 alta.

### Cf5. `/configuracion/omnicanal-horarios`
- `max-w-4xl px-4 sm:px-6 lg:px-8` ✓ (línea 158), grid `sm:grid-cols-2` ✓ (220). **OK**.

### Cf6. `/configuracion/omnicanal-equipos`
- `max-w-4xl space-y-8` (135), grid `sm:grid-cols-2` (178) ✓.

### Cf7. `/configuracion/canales`, `[channelId]`
- `CanalesHubInner.tsx:149` — `max-w-6xl`. Padding por shell.
- Detalle (línea 129): `truncate max-w-[200px]`. OK.

### Cf8. `/configuracion/conversaciones/flujos/[flowCode]`
- **Archivo enorme** (3000+ líneas). Líneas 1325, 1329, 2769: `min-w-[180–220px]`. Línea 1441: `max-w-[11rem]`. Línea 2756: `max-w-[min(100%,16rem)] truncate`. Tablas, paneles laterales — **requiere rediseño** para mobile. Severidad media-alta.

### Cf9. `/configuracion/crm/page.tsx`
- Línea 639: `max-w-[11rem] flex-col gap-1 text-right sm:max-w-none sm:flex-row` — buen patrón mobile-first.

### Cf10. `/configuracion/tableros/page.tsx:15` — `sm:grid-cols-2` ✓.

---

## Módulo: Usuarios

### U1. `/usuarios` lista
- KPIs `sm:grid-cols-3` (línea 187) ✓.
- Tabla con `overflow-x-auto`. Celda email `max-w-[220px] truncate` (línea 297). Aceptable.

### U2. `UsuarioDetalleClient.tsx`
- Líneas 556, 572, 593, 616, 760 — `grid grid-cols-2 gap-x-8 gap-y-4` directo. **P3 media**.

### U3. `UsuarioNuevoModal.tsx:50` y `UsuarioDetalleModal.tsx:58` — `h-[94vh] max-w-7xl`. **P2 alta**.

---

## Módulo: Planes

### Pl1. `/planes` lista
- **Línea 320:** tabla `min-w-[900px]` — **P1 alta**.
- Filtros `min-w-[150–200px]` (234, 263, 277) — P6.

### Pl2. `PlanNuevoModal.tsx:50` y `PlanDetalleModal.tsx:58` — `h-[94vh] max-w-7xl`. **P2 alta**.

### Pl3. `PlanDetalleClient.tsx`
- Líneas 551, 571, 648: `min-w-[110–140px]` en celdas. Acepable si la tabla padre tiene `overflow-x-auto`.

---

## Módulo: Admin Empresas

### AE1. `/admin/empresas` lista — tabla con `overflow-x-auto`. OK.
### AE2. `/admin/empresas/[id]` y `/editar` y `/nueva`
- Contienen tablas y formularios — no auditadas línea a línea. **Requiere verificación**.

---

## Módulo: Agenda

### Ag1. `/dashboard/agenda/AgendaClient.tsx`
- Línea 309: `min-w-[180px]` en filtros (P6).

### Ag2. `views/MonthView.tsx`
- Líneas 32, 39: `grid grid-cols-7` (días de la semana). **Sin escape mobile**. En 375px ≈ 53px por celda — pixeles muy apretados pero "funciona". Media.
- **Solución:** vista por semana o por día bajo `md`.

### Ag3. `CitaFormModal.tsx`
- Líneas 287, 323: `grid-cols-3 gap-3` directo. **P3 alta**.
- Líneas 394, 404: `grid-cols-2 gap-3`. P3 media.

### Ag4. `RangoHorarioConfig.tsx:30` — `grid-cols-2` directo. Bajo cobertura.

---

## Módulo: Monitoreo

### Mo1. `/dashboard/monitoreo`
- KPIs `grid-cols-2 ... lg:grid-cols-6` (línea 225) — P5.
- Tabla con `overflow-x-auto`. Tarjetas con `max-w-[18rem]` y `max-w-[200px]` (578, 706). Acceptable.

---

## Módulo: Gerencia

### Ge1. `/dashboard/gerencia/GerenciaClient.tsx`
- KPIs `grid-cols-2 sm:grid-cols-3 lg:grid-cols-6` (línea 145) — P5.
- Grids `lg:grid-cols-3` (155, 184, 204), `lg:grid-cols-2` (233). Colapsan ✓.
- Línea 288: `grid grid-cols-2 gap-x-4 gap-y-3` directo — P3 media (read-only).

---

## Módulo: Etiquetas

### Et1. `/dashboard/etiquetas/EtiquetasClient.tsx`
- Línea 671: `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` ✓.
- Línea 717: `grid-cols-1 md:grid-cols-2 lg:grid-cols-4` ✓.
- Línea 1170: `grid-cols-2 gap-3 md:grid-cols-3` ✓.
- Tabla con `overflow-x-auto`. Mensajes con `max-w-[80%]` (línea 956) — OK.

---

## Módulo: Conversaciones finalizadas

### Cf1. `FinalizedClosuresClient.tsx`
- **Línea 434:** tabla `min-w-[1000px]` — **P1 alta**.
- `max-w-[1400px] mx-auto` (238) + `px-4 md:px-6` ✓.

---

## Módulo: Facturas

### F1. `/facturas/[id]`
- `max-w-6xl mx-auto py-6 px-4 sm:px-6` ✓ (línea 164). `grid-cols-2 sm:grid-cols-3 gap-3` ✓ (200). **Aceptable**. Severidad baja.

---

## Módulo: Proveedores

### Pv1. `/proveedores` — input búsqueda `min-w-[240px]` (línea 88), tabla `overflow-x-auto`. Media.
### Pv2. `ProveedorForm.tsx:73` — `sm:grid-cols-2` ✓.
### Pv3. `/proveedores/categorias` — tabla `overflow-x-auto`. OK.

---

## Apéndice — Módulos sin issues mayores

- `/login` (`src/app/login/page.tsx`) — `max-w-[22rem] sm:max-w-sm` ✓.
- `/facturas/[id]` — paddings y grids responsive.
- `/configuracion` (portada) — usa el patrón correcto.
- `/configuracion/omnicanal-horarios` y `/omnicanal-equipos` — `max-w-4xl` con `sm:` breakpoints.
- `/configuracion/tableros` — solo `sm:grid-cols-2`.
- `ProveedorForm`, `ClienteNuevoForm` (mayormente — un par de `grid-cols-2` directos), `ProspectoNuevoForm`, `ProspectoDetalleForm` — usan `sm:grid-cols-2` correctamente.

## Apéndice — Cobertura y limitaciones

Audité con un mix de lectura directa de los archivos más voluminosos (Sidebar, Header, AppShell, ConversacionesClient, dashboard `page.tsx`) + barridos `grep` por patrones (`<table`, `min-w-[`, `max-w-(4xl..7xl|[)`, `grid-cols-[2-9]`, `text-xs/text-sm`, `overflow-x-auto`). **No audité línea por línea**:

- `/admin/empresas/[id]/page.tsx`, `/[id]/editar/page.tsx`, `/nueva/page.tsx` — solo confirmado que contienen `<table>` y formularios.
- `/sorteos/[id]/revendedores`, `/sorteos/[id]/revendedores/[revId]/editar`, `/sorteos/conversaciones`, `/sorteos/[id]/editar` — no inspeccionados a fondo. **Requiere verificación**.
- `/dashboard/sorteos/*` (variantes dashboard) — idem.
- `/gastos/nuevo`, `/gastos/[id]/editar`, `/usuarios/nuevo` — no inspeccionados al detalle. **Requiere verificación** (probable P3/P4 por patrón).
- `/dashboard/conversaciones/configuracion`, `/operacion`, `/flujos` (lista) — solo grep, no lectura completa.
- `/dashboard/colas-agentes` — no inspeccionado al detalle. **Requiere verificación**.
- `/configuracion/comisiones`, `/configuracion/metricas`, `/configuracion/vistas-dashboard`, `/configuracion/facturacion`, `/configuracion/facturacion-electronica` — no inspeccionados.
- `/dashboard/etiquetas-preview`, `/dashboard/marketing-ops/piezas/[id]` — no inspeccionados.
- `/usuarios/[id]` — solo via `UsuarioDetalleClient.tsx`, sin la página completa.

## Recomendaciones de orden de ataque

1. **Shell global (G1, G2, G3)** — bloquea todo. Sin esto, ningún otro fix se aprecia en mobile.
2. **Patrón P4 (font-size inputs)** — fix global vía clase utilitaria; impacta toda la app.
3. **Patrón P3 (`grid-cols-2/3` duros)** — sweep mecánico (`grid-cols-2` → `grid-cols-1 sm:grid-cols-2`), bajo riesgo.
4. **Patrón P1 (tablas anchas)** — definir `ResponsiveTable` y migrar páginas de listado (pagos, notas-credito, sorteos, comisiones, planes, campañas, gestión-clientes).
5. **Patrón P2 (modales full-screen mobile)** — refactor de los wrappers `XxxModal.tsx` que comparten estructura.
6. **Patrón P7 (Kanban)** — vista alternativa por etapa en mobile (proyectos, CRM).
7. **Patrón P6 (filtros)** — sheet de filtros con contador.

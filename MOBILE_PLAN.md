# Plan Mobile — ERP Neura (Arquitectura dual desktop / mobile)

**Stack real:** Next.js 16 (App Router) + TypeScript + Tailwind. No es Vite.
**Fecha:** 2026-06-10
**Objetivo:** una versión mobile *independiente* con UI propia (`src/mobile/`), reutilizando exclusivamente la capa de datos/lógica (`src/shared/`) con la versión desktop actual (`src/desktop/`). Selección por viewport vía `DeviceRouter`.
**Pre-lectura obligatoria:** `MOBILE_AUDIT.md` (en la raíz). Este plan asume su contexto.

---

## 1. Análisis del estado actual

### 1.1 Estructura `src/`
```
src/
  app/            → App Router. Rutas en page.tsx (server) + *Client.tsx (client) por módulo.
  components/     → UI compartida: shell (AppShell, layout/Sidebar, layout/Header),
                    chrome (AuthGuard, BootContext, ThemeProvider, ZentraLoader)
                    y componentes por dominio (clientes/, crm/, gestion-clientes/,
                    inventario/, pagos/, sorteos/, usuarios/, ui/, assistant/, chat/, etc.).
  lib/            → Capa de lógica por dominio (28 carpetas: clientes, proyectos, chat,
                    pagos via gestion-clientes, ventas, compras, inventario, crm,
                    nota-credito, comisiones, gastos, sorteos, marketing-ops, agenda,
                    facturacion, sifen, supabase, auth, etc.). Cada dominio expone
                    storage.ts + types.ts + helpers específicos.
  hooks/          → Casi vacío. Solo useFacturaSifenEstados.ts.
  middleware.ts
  app/api/        → ~40 namespaces de API routes (clientes, pagos, proyectos,
                    chat, sorteos, etc.).
```

### 1.2 Patrón de fetching (qué realmente hay)
Mezcla, no homogéneo:

- **Server Components → server actions / data helpers**. Las `page.tsx` raíz (ej. `src/app/dashboard/proyectos/page.tsx`, `src/app/dashboard/conversaciones/page.tsx`) son async server components que llaman a helpers de `lib/<dominio>/...-server.ts` (`resolveDataSchemaForCurrentUserServer`, `getChatDataSchemaForCurrentUser`, `getConversacionesInboxBootstrap`) y pasan los datos como props al client component.
- **Client Components → `useState` + `useEffect` + storage**. Ej.:
  - `src/app/clientes/page.tsx:378-387`: `useEffect(() => { getClientes(...).then(setClientes) }, [])`.
  - `src/app/pagos/page.tsx`: usa `getFacturas` (de `lib/gestion-clientes/storage.ts`) y `getClientes` (de `lib/clientes/storage.ts`) dentro de `useEffect`.
- **`fetchWithSupabaseSession`** (`src/lib/api/fetch-with-supabase-session.ts`): wrapper de fetch que adjunta JWT de Supabase, invocado tanto desde componentes (`ProyectosKanbanClient.tsx:18`, `pagos/page.tsx:10`, `Sidebar.tsx:42`) como desde storage functions.
- **Cliente Supabase directo del browser**: `createBrowserClientForSchema` / `getBrowserSupabaseForEmpresaData` para queries multitenant (multi-schema). Ej. `clientes/storage.ts:3`, `ProyectosKanbanClient.tsx:19`.
- **NO hay SWR, react-query, ni RTK Query**. Sin caché compartida entre pantallas: cada `useEffect` refetchea desde cero. Sin revalidación, sin invalidación cross-component.

### 1.3 Patrón de estado global
- **Solo `BootContext`** (`src/components/BootContext.tsx`, 36 líneas). Expone `{ sidebarReady, setSidebarReady }` para que `AuthGuard` espere a que el `Sidebar` termine de cargar los módulos del usuario.
- **No hay Zustand, Redux, Jotai, ni stores de feature**. Cada componente tiene su propio `useState` para filtros, modales abiertos, etc.
- **No hay Context de usuario/empresa global**. El "usuario actual" se resuelve por demanda con `getCurrentUser()` (`lib/auth.ts`).
- **localStorage** se usa puntualmente para preferencias (`CLIENTES_COLUMNAS_STORAGE_KEY` en clientes/page.tsx, `getFavoritos` del menú).

### 1.4 Capa `lib/` ya separada (parcial)
Cada dominio en `lib/<dominio>/` típicamente tiene:
- `storage.ts` → CRUD client-side (queries Supabase + fetch a `/api`).
- `types.ts` → tipos TypeScript del dominio.
- `*-server.ts` → helpers exclusivos de server (RSC / route handlers).
- helpers de dominio (`enrich-proyectos.ts`, `sla-from-historial.ts`, `tipo-servicio-catalogo.ts`, etc.).

Ejemplos concretos (puramente lógica, sin UI):
- `lib/clientes/storage.ts` exporta `getClientes`, `getCliente`, `saveCliente`, `updateCliente`, `softDeleteCliente`, `getNotasCliente`, `addNotaCliente`, `toggleEstado`, `clienteNombre`, `construirPatchActualizacionCliente`.
- `lib/gestion-clientes/storage.ts` exporta `getFacturas`, `saveFactura`, `getTipificaciones`, `saveTipificacion`.
- `lib/proyectos/` ya tiene `brief-data.ts`, `proyecto-estados-config.ts`, `proyecto-prioridades-config.ts`, `sla-from-historial.ts`, `historial-enrich.ts` — todo lógica pura.

**Conclusión:** `lib/` es la base de `shared/`. Está bien encarada pero sin disciplina (no todos los dominios tienen `storage.ts`; el fetching duplicado vive a veces en `lib/`, a veces en el componente).

### 1.5 Lógica embebida en componentes (ejemplos concretos)

1. **`src/app/dashboard/proyectos/ProyectosKanbanClient.tsx:71-100`** — Helpers `isEntregado`, `getPostentregaInfo` (cálculo de días post-entrega + SLA), constantes `ESTADO_ENTREGADO_CODIGO`, `POSTENTREGA_PERIODO_DIAS`. Lógica de dominio dentro del componente.
2. **`src/app/clientes/page.tsx:16-21, 78-89`** — `formatFecha`, `avatarToneFor`, `avatarInitial` (utilidades visuales pero también de dominio: derivar tono estable desde nombre).
3. **`src/app/clientes/page.tsx:208-337`** — `buildClienteColumns(mapNombreTipo)` define las 12 columnas configurables de la tabla con su lógica de render. Si las columnas son las mismas en mobile (aunque la presentación cambie), conviene mover la definición a `shared/`.
4. **`src/app/pagos/page.tsx:77-80`** — `formatFecha` reimplementada (otro duplicado). Tabs `pendientes | cobrados` con lógica de partición de facturas que vive en el componente.
5. **`src/app/dashboard/conversaciones/ConversacionesClient.tsx` (3361 líneas, 101 `useState/useEffect`)** — el peor caso: fetching, filtros, suscripción realtime, parsing de mensajes, persistencia de borradores, drag/drop adjuntos. **Todo el dominio embebido en un solo client component**. Sin extracción esto es inportable a mobile.
6. **`src/app/page.tsx` (Dashboard, 2847 líneas)** — KPIs financieros, gerenciales, comerciales calculados in-line. El componente `FinMontoGs` con `clamp(font-size)` (líneas 1130-1162) es buena lógica reutilizable que hoy vive ahí.

### 1.6 Estado responsive ya aplicado (4 commits)
Visible en `git log --oneline -20`:
- `7591232 fix(mobile): modales full-screen en mobile (P2)` — 19 modales.
- `4469687 fix(mobile): grids 1-col en <sm (P3)` — ~50 grids.
- `80a442f fix(mobile): font-size 16px en inputs en <md (P4)` — anti-zoom iOS.
- `435a9b1 feat(mobile): sidebar como sheet en mobile + botón hamburguesa`.

`AppShell.tsx` ya tiene la lógica de drawer mobile (`mobileSidebarOpen`, `STANDALONE_ROUTES = ["/login"]`, backdrop, `p-4 sm:p-6` en `<main>`). Es decir, **la rama mobile actual es la desktop con parches**, no una UI separada.

---

## 2. Inventario de módulos / páginas

| Módulo | Paths (page.tsx) | Tipo | Componentes principales | Complejidad mobile |
|---|---|---|---|---|
| **Login** | `src/app/login/page.tsx` | form simple | inline | baja |
| **Dashboard** | `src/app/page.tsx` (2847 líneas) | dashboard | inline, `FinMontoGs` | alta |
| **Gerencia** | `src/app/dashboard/gerencia/page.tsx` | dashboard | `GerenciaClient` | media |
| **Reportes** | `src/app/reportes/page.tsx`, `/conciliacion`, `/ventas`, `/estado-cuenta` | dashboard + lista | inline | media |
| **Conversaciones (Inbox)** | `src/app/dashboard/conversaciones/page.tsx` + `ConversacionesClient.tsx` (3361 líneas) | inbox multi-panel | `ConversacionesClient`, AssistantWidget, drawers | **muy alta** |
| **Conversaciones — config** | `/dashboard/conversaciones/configuracion`, `/operacion`, `/flujos`, `/flujos/[flowCode]`, `/historial` | mixto (lista + editor) | inline grande | media-alta |
| **Conversaciones finalizadas** | `/dashboard/conversaciones-finalizadas/page.tsx` | lista | `FinalizedClosuresClient` | media |
| **Historial omnicanal** | `/dashboard/historial-omnicanal/page.tsx`, `/dashboard/historial/page.tsx` | split-pane (lista+detalle) | inline | alta |
| **Monitoreo** | `/dashboard/monitoreo/page.tsx` | dashboard + tabla | inline | media |
| **Colas agentes** | `/dashboard/colas-agentes/page.tsx` | lista operativa | inline | media |
| **Etiquetas** | `/dashboard/etiquetas/page.tsx` (+ preview) | tablero + lista | `EtiquetasClient` | media |
| **Ventas — lista** | `/ventas/page.tsx` | lista + KPIs | inline | baja-media |
| **Ventas — nueva** | `/ventas/nueva/page.tsx` | form largo | inline | media |
| **Compras — lista** | `/compras/page.tsx` | lista | inline | baja |
| **Compras — nueva** | `/compras/nueva/page.tsx` | form largo | inline | alta (P3 fuerte) |
| **Inventario — productos** | `/inventario/page.tsx` | lista + filtros | inline | media |
| **Inventario — nuevo/editar** | `/inventario/nuevo`, `/inventario/[id]/editar` | form largo | inline | alta |
| **Inventario — movimientos** | `/inventario/movimientos`, `/movimientos/nuevo` | lista + form | inline | media |
| **Inventario — categorías / ubicaciones** | `/inventario/categorias`, `/inventario/ubicaciones` | lista | inline | baja |
| **Clientes — lista** | `/clientes/page.tsx` (792 líneas) | lista configurable + KPIs | `ClienteNuevoModal`, `ClienteDetalleModal`, `EdgeScrollArea` | alta |
| **Clientes — detalle** | `/clientes/[id]/page.tsx`, `/clientes/[id]/tipificacion` | detalle multi-tab | `ClienteDetalleClient` (>2400 líneas) | **muy alta** |
| **Clientes — nuevo** | `/clientes/nuevo/page.tsx` | form largo | `ClienteNuevoForm` | media |
| **Pagos** | `/pagos/page.tsx` (882 líneas) | tabs lista + lista (pendientes/cobrados) | `RegistrarPagoModal` | alta |
| **Gestión Clientes** | `/gestion-clientes/page.tsx` | dashboard + tabla ancha | inline | alta |
| **Notas crédito — lista** | `/notas-credito/page.tsx` | lista + KPIs | `NotasCreditoListClient` | alta |
| **Notas crédito — detalle** | `/notas-credito/[id]/page.tsx` | detalle | `NotaCreditoDetalleClient`, `NotaCreditoDetalleModal` | media |
| **Comisiones** | `/comisiones/page.tsx` | KPIs + tabla ancha | inline | alta |
| **Gastos — lista** | `/gastos/page.tsx` | lista + filtros | inline | baja |
| **Gastos — nuevo/editar** | `/gastos/nuevo`, `/gastos/[id]/editar` | form | inline | media |
| **CRM Funnel** | `/crm/page.tsx` (969 líneas), `/crm/[id]`, `/crm/nuevo` | kanban + KPIs + detalle | `ProspectoNuevoForm`, `ProspectoDetalleForm` | **alta** (kanban) |
| **Proyectos** | `/dashboard/proyectos/page.tsx` (+ Kanban 931 líneas), `/[id]`, `/nuevo` | kanban + detalle modal | `ProyectoDetalleModal`, `ProyectoDetalleInner` | **muy alta** (kanban + modal denso) |
| **Marketing legacy** | `/marketing/page.tsx` | calendario semanal + KPIs | inline | alta (calendario 7 col) |
| **Marketing Ops — lista** | `/dashboard/marketing-ops/page.tsx` | tabla + filtros | `MarketingOpsClient` | media |
| **Marketing Ops — pieza** | `/dashboard/marketing-ops/piezas/[id]/page.tsx` | detalle | `MarketingOpsPiezaDetalleClient`, `MarketingOpsPiezaDetalleModal` | media |
| **Campañas — lista** | `/dashboard/campanas/page.tsx` | lista + KPIs | `CampanasListClient` | media |
| **Campañas — detalle** | `/dashboard/campanas/[id]/page.tsx` | detalle | `CampanasDetailClient` | media |
| **Campañas — nuevo** | `/dashboard/campanas/nuevo/page.tsx` | wizard form | inline | media |
| **Agenda** | `/dashboard/agenda/page.tsx` | calendario + form modal | `AgendaClient`, `MonthView`, `CitaFormModal` | alta |
| **Sorteos — lista** | `/sorteos/page.tsx`, `/dashboard/sorteos` | lista | `SorteosListClient` | baja |
| **Sorteos — tickets / entradas / cupones** | `/sorteos/tickets`, `/sorteos/entradas`, `/sorteos/cupones` | tablas anchas | inline | alta (P1) |
| **Sorteos — revendedores** | `/sorteos/[id]/revendedores`, `/[revId]/editar` | lista + form | inline | media (no auditado al detalle) |
| **Sorteos — imprimir cupones** | `/sorteos/[id]/imprimir-cupones` | vista de impresión | `PhysicalCouponsPrintClient` | (no aplica mobile) |
| **Sorteos — conversaciones** | `/sorteos/conversaciones/page.tsx` | mixto | inline | media (no auditado) |
| **Usuarios — lista** | `/usuarios/page.tsx` | lista + KPIs | `UsuarioNuevoModal` | baja-media |
| **Usuarios — detalle** | `/usuarios/[id]/page.tsx` | detalle multi-bloque | `UsuarioDetalleClient`, `UsuarioDetalleModal` | media |
| **Usuarios — nuevo** | `/usuarios/nuevo/page.tsx` | form | inline | media |
| **Planes — lista** | `/planes/page.tsx` | tabla ancha + filtros | `PlanNuevoModal` | alta |
| **Planes — detalle** | `/planes/[id]/page.tsx`, `/planes/nuevo` | detalle | `PlanDetalleClient` | media |
| **Proveedores** | `/proveedores/page.tsx`, `/nuevo`, `/[id]/editar`, `/categorias` | lista + form | `ProveedorForm` | media |
| **Admin Empresas** | `/admin/empresas/page.tsx`, `/[id]`, `/[id]/editar`, `/nueva` | lista + form | inline | media |
| **Facturas — detalle** | `/facturas/[id]/page.tsx` | detalle (impresión) | inline | baja |
| **Configuración (portada)** | `/configuracion/page.tsx` | grid de cards | inline | baja |
| **Configuración — submódulos** | `/configuracion/colas`, `/colas/[queueId]`, `/canales`, `/canales/[channelId]`, `/canales/nuevo`, `/comisiones`, `/conversaciones`, `/conversaciones/flujos`, `/conversaciones/flujos/[flowCode]` (3000+ líneas), `/crm`, `/facturacion`, `/facturacion-electronica`, `/metricas`, `/omnicanal-equipos`, `/omnicanal-horarios`, `/politicas`, `/preferencias`, `/proyectos`, `/tableros`, `/vistas-dashboard` | mixto: formularios admin, editores, tableros | varios `*ColaEditor`, `*FlowEditor` | media → alta (`flujos/[flowCode]`) |

**Total módulos primarios:** ~38. **Total páginas (`page.tsx`):** 103.

---

## 3. Capa `shared/` propuesta — qué extraer por módulo

> Regla: **NO inventar APIs.** Solo extraer lo que ya existe en `lib/` o que está embebido en componentes y se identificó arriba. El nombre de los hooks (`useXxx`) representa el wrapper trivial sobre la storage function existente, con `useState`/`useEffect` adentro — para que tanto desktop como mobile compartan loading/error/refetch.

### Convención propuesta
```
src/shared/
  domain/<dominio>/
    types.ts            ← mover desde lib/<dominio>/types.ts
    api.ts              ← mover desde lib/<dominio>/storage.ts (queries + mutations)
    hooks.ts            ← NUEVO: useXxx que envuelven api.ts con useState/useEffect
    config.ts           ← constantes, mapas, catálogos estáticos (estados, prioridades, etc.)
    server.ts           ← lo que hoy es lib/<dominio>/*-server.ts
    util.ts             ← helpers puros (formateadores, derivaciones)
  api/                  ← fetch-with-supabase-session, error mapping
  supabase/             ← clients, schema resolver
  auth/                 ← getCurrentUser, super-admin helpers
  format/               ← formatFecha, formatMonedaGs, etc. (deduplicar)
  ui-tokens/            ← (opcional) tokens de color/spacing si ambos consumen
```

### Por módulo

**Clientes**
- Hooks: `useClientes(opts)`, `useCliente(id)`, `useGuardarCliente()`, `useActualizarCliente()`, `useEliminarCliente()`, `useNotasCliente(id)`, `useToggleEstadoCliente()`.
- Tipos: `Cliente`, `EstadoCliente`, `NotaCliente`, `PerfilTributarioCliente`, `NuevoClienteData`, `ActualizarClienteInput`.
- Util: `clienteNombre`, `construirPatchActualizacionCliente`, `formatFecha`, `avatarToneFor`, `avatarInitial` (extraer de `clientes/page.tsx:16-89`), `buildClienteColumns` (extraer de `clientes/page.tsx:208-337` — solo la definición data, el render JSX queda en cada UI).
- Catálogos: `tipo-servicio-catalogo.ts`, `use-map-nombre-tipo-servicio.ts`, `fetch-tipos-servicio-form.ts` (ya en `lib/clientes/`).

**Proyectos**
- Hooks: `useProyectos(filtros)`, `useProyecto(id)`, `useEstadosProyecto(dataSchema)`, `usePrioridadesProyecto()`, `useMoverProyecto()`, `useCrearProyecto()`, `useArchivarProyecto()`, `useEliminarProyecto()`, `useHistorialProyecto(id)`.
- Tipos: `ProyectoCard`, `EstadoRow`, `PrioridadConfig`, `PostentregaInfo`.
- Util: `isEntregado`, `getPostentregaInfo`, `ESTADO_ENTREGADO_CODIGO`, `POSTENTREGA_PERIODO_DIAS` (extraer de `ProyectosKanbanClient.tsx:71-100`), `formatPrioridad`, helpers de SLA (ya en `lib/proyectos/sla-from-historial.ts`, `sla-badge.ts`).

**Conversaciones (chat omnicanal)**
- Hooks: `useConversacionesInbox(bootstrap)`, `useConversacion(id)`, `useMensajes(conversacionId)`, `useEnviarMensaje()`, `useEnviarMedia()`, `useAsignarCola()`, `useEtiquetasConversacion(id)`, `useFlujosChat()`, `usePresenciaOperativa()`.
- Tipos: ver `lib/chat/` (no enumerados — el dominio tiene 14 endpoints API).
- Util: parsing de borradores (`localStorage`), formateo de timestamps de chat.
- **Server-only**: `getConversacionesInboxBootstrap`, `getChatDataSchemaForCurrentUser`.

**Pagos / Gestión Clientes (facturación)**
- Hooks: `useFacturas(clienteId?)`, `useFacturasPendientes(filtros)`, `useFacturasCobradas(filtros)`, `useGuardarFactura()`, `useRegistrarPago()`, `useTipificaciones(clienteId)`, `useGuardarTipificacion()`.
- Tipos: `Factura`, `Tipificacion`, `EstadoFacturaUI`.
- Util: `formatFecha`, `enRangoCalendario`, `rangoDesdeHastaInputs`, `toCalendarDateStr` (ya en `lib/fechas/calendario.ts`).

**CRM**
- Hooks: `useProspectos(filtros)`, `useProspecto(id)`, `useEtapasFunnel()`, `useMoverProspecto()`, `useCrearProspecto()`, `useConvertirProspectoACliente()`.
- Tipos: en `lib/crm/`.
- Util: KPI calculators del funnel (hoy embebidos en `crm/page.tsx`).

**Ventas / Compras / Inventario**
- Hooks por entidad: `useVentas`, `useCrearVenta`, `useCompras`, `useCrearCompra`, `useProductos`, `useMovimientosInventario`, `useUbicaciones`, `useCategoriasInventario`.
- Tipos: `Venta`, `Compra`, `Producto`, `MovimientoInventario`, `Ubicacion`, `Categoria`.
- Server helpers: `lib/ventas/server/`.

**Notas crédito** — `useNotasCredito(filtros)`, `useNotaCredito(id)`, `useEmitirNotaCredito()`. Tipos en `lib/nota-credito/`.

**Comisiones** — `useResumenComisiones(periodo)`, `usePoliticaComisiones()`, `usePreviewComisiones()`. Tipos en `lib/comisiones/`.

**Gastos** — `useGastos(filtros)`, `useGasto(id)`, `useCrearGasto()`. Tipos en `lib/gastos/`.

**Sorteos** — `useSorteos`, `useSorteo(id)`, `useTickets`, `useEntradas`, `useCupones`, `useRevendedores(sorteoId)`. Tipos en `lib/sorteos/`.

**Campañas / Marketing Ops** — `useCampanas`, `useCampana(id)`, `useTemplatesCampana`, `usePiezasMarketingOps`, `usePiezaMarketingOps(id)`. Tipos existentes en `lib/campaigns/` y `lib/marketing-ops/`.

**Agenda** — `useCitas(rango)`, `useDisponibilidad(usuarioId, fecha)`, `useResumenAgenda(periodo)`, `useCrearCita()`. Tipos en `lib/agenda/`.

**Usuarios** — `useUsuarios`, `useUsuario(id)`, `useCrearUsuario()`, `useActualizarUsuario()`, `useModulosEmpresa()` (ya parcial en `lib/empresas/actions.ts`). Tipos en `lib/usuarios/`.

**Planes** — `usePlanes(filtros)`, `usePlan(id)`, `useCrearPlan()`. Tipos en `lib/planes/`.

**Proveedores** — `useProveedores`, `useProveedor(id)`, `useCategoriasProveedor`.

**Admin Empresas** — `useEmpresas` (super-admin), `useEmpresa(id)`, `useCrearEmpresa()`.

**Configuración** — hooks por sub-feature: `useFlujosChat`, `useFlujoChat(code)`, `useColasChat`, `useCanales`, `useEquiposOmnicanal`, `useHorariosOmnicanal`, `usePoliticasComerciales`, `usePreferencias`, `useConfigProyectos`, `useConfigCRM`, `useTableros`, `useVistasDashboard`, `useMetricas`, `useFacturacionConfig`, `useFacturacionElectronica`.

**Dashboard (raíz `/`)** — extraer cálculos KPI a `shared/domain/dashboard/`: `useResumenFinanciero(periodo)`, `useResumenComercial(periodo)`, `useResumenGerencial(periodo)`. Componente `FinMontoGs` (formato Gs. con `clamp`) → mover a `shared/format/` como helper `formatMontoGsCSS` + el componente lo deja cada UI.

**Reportes** — `useReporteVentas`, `useReporteConciliacion`, `useReporteEstadoCuenta(empresaId)`.

### Util/format/shared horizontal
Deduplicar entre componentes:
- `formatFecha` (aparece reimplementada en `clientes/page.tsx:16`, `pagos/page.tsx:77`, varios más).
- `formatMonedaGs` (varios componentes con `Intl.NumberFormat` inline).
- `truncate`, `slugify`, `normalizeSearch` (`Sidebar.tsx:67-73`).
- `avatarToneFor`/`avatarInitial`.

---

## 4. UX mobile propuesta — por módulo

> 3-6 líneas por módulo. Lineamientos transversales: bottom-sheet para filtros, full-screen modals para formularios largos, swipe-back en detalle, FAB sólo cuando hay acción primaria única.

**Dashboard (`/`)** — Stack vertical. Header con saludo + selector de período (sheet). Carrusel horizontal de KPI cards (`snap-x`, una visible). Secciones colapsables: Financiero, Comercial, Gerencial. Cada gráfico full-width con altura controlada (`aspect-[3/2]`).

**Gerencia** — Idéntico patrón al Dashboard; KPIs en cards de ancho full. Sin tablas anchas: convertir cada fila a card con label/valor.

**Reportes** — Pantalla portada con lista de reportes (cards). Cada reporte abre pantalla propia con filtros en sheet + KPIs + lista (no tabla).

**Conversaciones** — Patrón iOS Messages: pantalla A lista de conversaciones (avatar + nombre + último mensaje + unread badge). Tap → pantalla B chat full-screen. Pantalla C drawer de contacto/detalle accesible vía botón en el header del chat (push o bottom-sheet alto). Filtros + búsqueda en header de A (sheet). Composer fijo abajo con safe-area inset. Sin presencia/asignación inline — botón "Acciones" en header del chat (action sheet).

**Conversaciones — config/operación/flujos** — Pantalla de "Más" con tarjetas por sub-feature. `flujos/[flowCode]` (3000+ líneas): vista mobile no edita, solo *visualiza* el flujo en lista vertical de nodos. Edición → "Abrir en desktop" o redirect.

**Conversaciones finalizadas** — Lista de cards con cierre/cliente/fecha. Tap → detalle full-screen.

**Historial omnicanal** — Lista paginada de eventos. Sin split-pane. Filtros en sheet. Tap evento → pantalla detalle.

**Monitoreo** — KPIs en carrusel + lista de agentes/colas en cards. Pull-to-refresh.

**Ventas — lista** — Cards (cliente + total + fecha + estado SIFEN). Filtros en sheet. FAB "Nueva venta".

**Ventas — nueva** — Wizard de 3 pasos full-screen: 1) Cliente, 2) Items, 3) Cobro + emisión. Botón "Siguiente" sticky bottom.

**Compras — lista / nueva** — Idéntico patrón a Ventas.

**Inventario — productos** — Cards (foto + nombre + stock + precio). Búsqueda sticky. FAB "Nuevo". Tap → detalle (tabs: Datos / Stock / Movimientos).

**Inventario — nuevo/editar** — Form full-screen, secciones plegables. Stack 1-col siempre.

**Inventario — movimientos** — Lista de cards. Filtros en sheet. FAB "Nuevo movimiento".

**Clientes — lista** — Cards (avatar + empresa + contacto + chips de estado/origen/tipo-servicio). Búsqueda sticky. Filtros en sheet con contador. Selector de "vista" reemplaza columnas configurables. FAB "Nuevo cliente".

**Clientes — detalle** — Pantalla full-screen con tabs scrolleables horizontalmente (Resumen / Datos / Tributario / Servicios / Notas / Tipificación / Historial). Acciones primarias en menú "···". Edición → modal full-screen tab a tab.

**Clientes — nuevo** — Wizard 3 pasos: 1) Identificación, 2) Contacto, 3) Tributario/Servicio.

**Pagos** — Tabs sticky arriba (Pendientes / Cobrados). Cada tab es una lista de cards (cliente + monto + vencimiento + chip estado). Tap card → bottom-sheet con "Registrar pago" / "Ver factura". Filtros en sheet.

**Gestión Clientes** — Lista de cards con barra horizontal de KPIs en carrusel arriba. Tap cliente → mismo detalle que módulo Clientes (compartido).

**Notas crédito — lista** — Cards. Filtros en sheet. KPIs en carrusel.

**Notas crédito — detalle** — Full-screen, secciones plegables.

**Comisiones** — KPIs en carrusel. Lista de comisiones por usuario/período como cards expandibles. Sin tabla.

**Gastos — lista** — Cards (categoría + monto + fecha). FAB "Nuevo gasto". Filtros en sheet.

**Gastos — nuevo/editar** — Form full-screen, stack 1-col.

**CRM Funnel** — En mobile, kanban se reemplaza por **vista por etapa**: selector segmentado (chips horizontales scrolleables) en header con cuenta por etapa; debajo, lista vertical de cards de la etapa activa. Mover etapa = action sheet "Mover a..." en cada card. KPIs en carrusel arriba.

**Proyectos** — Mismo patrón que CRM (selector de etapa + lista). Card incluye SLA badge + post-entrega chip. Tap card → detalle full-screen con tabs (Resumen / Brief / Historial / Archivos). Sin modal `h-[88vh]`.

**Marketing legacy** — Vista semanal de calendario → **vista diaria** en mobile (un día por pantalla, swipe horizontal entre días). Lista de slots con tap a detalle.

**Marketing Ops — lista** — Cards con thumbnail. Filtros en sheet.

**Marketing Ops — pieza** — Full-screen, secciones plegables. Visor de pieza con zoom.

**Campañas — lista** — Cards. KPIs en carrusel.

**Campañas — detalle** — Tabs scrolleables: Resumen / Audiencia / Mensajes / Métricas.

**Campañas — nuevo** — Wizard 4-5 pasos full-screen.

**Agenda** — Default: vista **agenda** (lista cronológica del día) en lugar de calendario mensual. Selector de día arriba (strip de 7 días swipeable + tap a calendario en sheet). FAB "Nueva cita". Tap cita → bottom-sheet con detalle.

**Sorteos — lista** — Cards (nombre + fechas + estado + premios).

**Sorteos — tickets/entradas/cupones** — Cards. Filtros en sheet. Búsqueda destacada.

**Sorteos — revendedores** — Lista de cards.

**Sorteos — imprimir cupones** — Mensaje "Vista solo en desktop" + link a abrir en navegador desktop. No portar.

**Usuarios — lista** — Cards (avatar + nombre + rol + chips). FAB "Nuevo".

**Usuarios — detalle** — Full-screen, secciones plegables. Edición full-screen tab a tab.

**Planes — lista** — Cards. Filtros en sheet.

**Planes — detalle / nuevo** — Full-screen, secciones plegables.

**Proveedores** — Cards. Form full-screen.

**Admin Empresas** — Cards. Form full-screen. (super-admin)

**Facturas — detalle** — Ya es razonable. Layout vertical, accionables abajo (Imprimir / SIFEN / Anular) en action sheet.

**Configuración (portada)** — Lista vertical de filas con icono + título + chevron (no grid). Tap → pantalla del sub-módulo.

**Configuración — submódulos**:
- Sub-features de admin densas (`flujos/[flowCode]`, `colas/[queueId]`, `canales/[channelId]`) → **read-only en mobile**, edición en desktop.
- Sub-features simples (`omnicanal-horarios`, `omnicanal-equipos`, `politicas`, `preferencias`, `tableros`, `vistas-dashboard`) → forms full-screen con stack 1-col.

**Login** — Compartido con desktop (no duplicar).

---

## 5. Navegación mobile global

### 5.1 Bottom Nav (5 ítems máx)
Basado en frecuencia de uso y orden en `Sidebar.tsx:90-203`:

1. **Dashboard** (`/`) — `LayoutDashboard`
2. **Conversaciones** (`/dashboard/conversaciones`) — `MessageCircle` (con badge de no leídos)
3. **Clientes** (`/clientes`) — `Users`
4. **Proyectos** (`/dashboard/proyectos`) — `FolderKanban`
5. **Más** (sheet) — `Menu` / `MoreHorizontal`

### 5.2 Pantalla "Más"
Sheet *o* página dedicada (`/m/mas`) con grid/lista del resto de módulos, agrupados:
- **Comercial:** Ventas, CRM, Gestión Clientes, Pagos, Notas crédito, Comisiones, Gastos
- **Operación:** Inventario, Compras, Proveedores, Agenda, Marketing Ops, Campañas, Marketing, Sorteos, Etiquetas
- **Visibilidad:** Gerencia, Reportes, Monitoreo, Historial omnicanal, Conversaciones finalizadas, Colas agentes
- **Administración:** Usuarios, Planes, Configuración, Admin Empresas (super-admin)
- **Favoritos** (sección arriba): respeta `getFavoritos()` (`lib/favorites.ts`) ya implementado.

### 5.3 Sub-navegación dentro de módulos
- **Tabs**: chips horizontales scrolleables (`snap-x`) bajo el header. Pattern shared en `mobile/components/TabBar.tsx`.
- **Selectores de filtro/etapa**: chips scrolleables con contador.
- **Pasos de wizard**: indicador `1 / 4` arriba + botón "Atrás" en header + CTA sticky bottom.

### 5.4 Header mobile
- Alto: `h-12` (48px) por defecto, `h-14` cuando hay tabs/búsqueda debajo.
- Izquierda: botón **back** (`/dashboard/conversaciones/[id]`) **o** logo (en pantallas raíz de bottom nav).
- Centro: título de pantalla, truncado.
- Derecha: 1–2 acciones primarias (`Search`, `Filter`, `MoreHorizontal`). Resto en menú `···`.
- Safe-area inset top respetada (`pt-[env(safe-area-inset-top)]`).
- En pantallas raíz: no hay back; el bottom nav cumple esa función.

---

## 6. Mapa desktop → mobile

| Componente desktop actual | Contraparte mobile propuesta | Notas |
|---|---|---|
| `src/components/AppShell.tsx` | `src/mobile/shell/MobileAppShell.tsx` | Sin sidebar; BottomNav + Header propios. |
| `src/components/layout/Sidebar.tsx` | (no aplica) — reemplazado por `BottomNav` + sheet "Más" | Lógica de módulos/favoritos a `shared/hooks/useModulosUsuario`. |
| `src/components/layout/Header.tsx` | `src/mobile/shell/MobileHeader.tsx` | Compacto, contextual por pantalla. |
| `src/components/AuthGuard.tsx` | (compartido) — vive en `src/shared/auth/AuthGuard.tsx` | No duplicar. |
| `src/components/BootContext.tsx` | (compartido) → `src/shared/state/BootContext.tsx` | |
| `src/components/ThemeProvider.tsx` | (compartido) | |
| `src/components/ZentraLoader.tsx` | `src/mobile/components/MobileLoader.tsx` (más liviano) o compartir | Compartir si es razonable. |
| `src/app/page.tsx` (Dashboard) | `src/mobile/screens/dashboard/DashboardScreen.tsx` | Hooks `useResumenFinanciero`, etc. |
| `src/app/dashboard/gerencia/GerenciaClient.tsx` | `src/mobile/screens/gerencia/GerenciaScreen.tsx` | |
| `src/app/dashboard/conversaciones/ConversacionesClient.tsx` | `src/mobile/screens/conversaciones/InboxScreen.tsx` + `ChatScreen.tsx` + `ContactoDrawer.tsx` | El archivo desktop (3361 líneas) primero hay que partirlo en `shared/domain/chat/hooks.ts`. |
| `src/app/dashboard/proyectos/ProyectosKanbanClient.tsx` | `src/mobile/screens/proyectos/ProyectosListScreen.tsx` + `ProyectoDetalleScreen.tsx` | Vista por etapa. |
| `src/app/dashboard/proyectos/components/ProyectoDetalleModal.tsx` | `src/mobile/screens/proyectos/ProyectoDetalleScreen.tsx` (push, no modal) | |
| `src/app/dashboard/proyectos/components/ProyectoDetalleInner.tsx` | `src/mobile/screens/proyectos/components/ProyectoDetalleBody.tsx` | Hoy es shared entre página y modal — perfecto para `shared/`. |
| `src/app/clientes/page.tsx` | `src/mobile/screens/clientes/ClientesListScreen.tsx` | |
| `src/app/clientes/components/ClienteNuevoModal.tsx` | `src/mobile/screens/clientes/ClienteNuevoScreen.tsx` (push full-screen) | |
| `src/app/clientes/components/ClienteDetalleModal.tsx` | `src/mobile/screens/clientes/ClienteDetalleScreen.tsx` | |
| `src/app/clientes/components/ClienteDetalleClient.tsx` (>2400 líneas) | `src/mobile/screens/clientes/ClienteDetalleScreen.tsx` (subpantallas por tab) | Lo grande hay que descomponer en `shared/`. |
| `src/app/clientes/nuevo/page.tsx` | `src/mobile/screens/clientes/ClienteNuevoScreen.tsx` (wizard) | |
| `src/app/clientes/[id]/tipificacion/page.tsx` | `src/mobile/screens/clientes/TipificacionScreen.tsx` | |
| `src/app/pagos/page.tsx` | `src/mobile/screens/pagos/PagosScreen.tsx` (tabs Pendientes/Cobrados) | |
| `src/components/pagos/RegistrarPagoModal.tsx` | `src/mobile/screens/pagos/RegistrarPagoSheet.tsx` | Bottom sheet. |
| `src/app/gestion-clientes/page.tsx` | `src/mobile/screens/gestion-clientes/GestionClientesScreen.tsx` | |
| `src/app/notas-credito/NotasCreditoListClient.tsx` | `src/mobile/screens/notas-credito/NotasCreditoListScreen.tsx` | |
| `src/app/notas-credito/components/NotaCreditoDetalleModal.tsx` | `src/mobile/screens/notas-credito/NotaCreditoDetalleScreen.tsx` | |
| `src/app/comisiones/page.tsx` | `src/mobile/screens/comisiones/ComisionesScreen.tsx` | |
| `src/app/gastos/page.tsx` | `src/mobile/screens/gastos/GastosListScreen.tsx` | |
| `src/app/gastos/nuevo/page.tsx` | `src/mobile/screens/gastos/GastoFormScreen.tsx` | |
| `src/app/crm/page.tsx` | `src/mobile/screens/crm/CRMFunnelScreen.tsx` (vista por etapa) | |
| `src/app/crm/[id]/page.tsx` | `src/mobile/screens/crm/ProspectoDetalleScreen.tsx` | |
| `src/app/crm/nuevo/page.tsx` | `src/mobile/screens/crm/ProspectoNuevoScreen.tsx` | |
| `src/app/ventas/page.tsx` | `src/mobile/screens/ventas/VentasListScreen.tsx` | |
| `src/app/ventas/nueva/page.tsx` | `src/mobile/screens/ventas/VentaNuevaWizard.tsx` | |
| `src/app/compras/page.tsx`, `/compras/nueva/page.tsx` | `src/mobile/screens/compras/*` | |
| `src/app/inventario/page.tsx`, `/nuevo`, `/[id]/editar`, `/movimientos`, `/categorias`, `/ubicaciones` | `src/mobile/screens/inventario/*` | |
| `src/app/dashboard/agenda/AgendaClient.tsx` | `src/mobile/screens/agenda/AgendaScreen.tsx` (vista día) | |
| `src/app/dashboard/agenda/components/CitaFormModal.tsx` | `src/mobile/screens/agenda/CitaFormSheet.tsx` | |
| `src/app/dashboard/marketing-ops/MarketingOpsClient.tsx` | `src/mobile/screens/marketing-ops/MarketingOpsScreen.tsx` | |
| `src/app/dashboard/marketing-ops/piezas/[id]/.../MarketingOpsPiezaDetalleClient.tsx` | `src/mobile/screens/marketing-ops/PiezaDetalleScreen.tsx` | |
| `src/app/dashboard/campanas/CampanasListClient.tsx` | `src/mobile/screens/campanas/CampanasListScreen.tsx` | |
| `src/app/dashboard/campanas/[id]/CampanasDetailClient.tsx` | `src/mobile/screens/campanas/CampanaDetalleScreen.tsx` | |
| `src/app/marketing/page.tsx` | `src/mobile/screens/marketing/MarketingScreen.tsx` (vista día) | |
| `src/app/dashboard/etiquetas/EtiquetasClient.tsx` | `src/mobile/screens/etiquetas/EtiquetasScreen.tsx` | |
| `src/app/usuarios/page.tsx`, `[id]`, `/nuevo` | `src/mobile/screens/usuarios/*` | |
| `src/app/planes/*` | `src/mobile/screens/planes/*` | |
| `src/app/proveedores/*` | `src/mobile/screens/proveedores/*` | |
| `src/app/admin/empresas/*` | `src/mobile/screens/admin-empresas/*` | |
| `src/app/sorteos/*`, `/dashboard/sorteos/*` | `src/mobile/screens/sorteos/*` | Imprimir-cupones queda desktop-only. |
| `src/app/dashboard/monitoreo/page.tsx` | `src/mobile/screens/monitoreo/MonitoreoScreen.tsx` | |
| `src/app/dashboard/colas-agentes/page.tsx` | `src/mobile/screens/colas-agentes/ColasAgentesScreen.tsx` | |
| `src/app/dashboard/historial-omnicanal/page.tsx`, `historial/page.tsx` | `src/mobile/screens/historial/*` | |
| `src/app/dashboard/conversaciones-finalizadas/FinalizedClosuresClient.tsx` | `src/mobile/screens/conversaciones-finalizadas/FinalizadasScreen.tsx` | |
| `src/app/reportes/*` | `src/mobile/screens/reportes/*` | |
| `src/app/configuracion/page.tsx` (+ submódulos) | `src/mobile/screens/configuracion/*` (algunos desktop-only) | Ver §4. |
| `src/app/facturas/[id]/page.tsx` | `src/mobile/screens/facturas/FacturaDetalleScreen.tsx` | |
| `src/app/login/page.tsx` | (compartido, no duplicar) | |

**Componentes UI primitivos** (`src/components/ui/`): mantenerlos compartidos (Button, Input, Select base, `EdgeScrollArea`) — los selectores de tamaño/padding ya están bien con Tailwind. Crear `src/mobile/components/` para primitivos nuevos: `BottomSheet`, `Sheet`, `TabBar`, `Carousel`, `Chips`, `FAB`, `ListCard`, `StickyCTA`.

---

## 7. DeviceRouter — diseño técnico (Next.js App Router)

### 7.1 Detección server-side (anti-flash)
**Middleware** (`src/middleware.ts`) parsea `User-Agent` y setea cookie `device-hint`:
```
// pseudocódigo
const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua) && noOverridenCookie;
if (!req.cookies.has("device")) {
  res.cookies.set("device", isMobile ? "mobile" : "desktop", { maxAge: 60*60*24*365 });
}
```
La cookie `device` (`mobile|desktop`) es la fuente de verdad para el server render.

### 7.2 Lectura en server component
En `src/app/layout.tsx` (root layout) o en un `AppShellSelector.tsx` (server):
```
import { cookies } from "next/headers";
const device = (cookies().get("device")?.value === "mobile") ? "mobile" : "desktop";
return device === "mobile" ? <MobileAppShell>{children}</MobileAppShell> : <DesktopAppShell>{children}</DesktopAppShell>;
```
Cada `page.tsx` (server) podría renderizar **el mismo data-fetching** y entregar al shell. La rama UI se decide en el shell, no en cada página → evita N pages dobles.

**Alternativa más limpia**: dual `page.tsx` por ruta usando el patrón de Next.js de **parallel routes / route groups**:
```
src/app/
  (desktop)/
    layout.tsx           → DesktopAppShell
    clientes/page.tsx    → import { default } from "@/desktop/screens/clientes"
  (mobile)/
    layout.tsx           → MobileAppShell
    clientes/page.tsx    → import { default } from "@/mobile/screens/clientes"
  layout.tsx             → DeviceLayoutSelector (server) que monta uno u otro
```
Sin embargo, App Router **no** soporta nativamente cambiar de route group por cookie. La forma factible es **un solo layout que recibe la cookie y renderiza una de las dos screens**:
```
src/app/clientes/page.tsx (server component):
  const device = cookies().get("device")?.value;
  // data fetching shared aquí
  return device === "mobile"
    ? <MobileClientesScreen data={data} />
    : <DesktopClientesScreen data={data} />;
```
Esto se puede encapsular en un helper:
```ts
export function renderForDevice(server: ServerContext, screens: {
  desktop: React.ComponentType<P>; mobile: React.ComponentType<P>;
}, props: P);
```
**Decisión recomendada:** opción simple — **un wrapper `<DeviceRouter desktop={A} mobile={B} {...props} />`** (server component) que lee la cookie. Cada `page.tsx` queda:
```tsx
export default async function Page() {
  const data = await fetchSharedData();
  return <DeviceRouter desktop={DesktopClientes} mobile={MobileClientes} data={data} />;
}
```

### 7.3 Detección client-side (corrección)
Hook `useDeviceType()` en `src/shared/state/useDeviceType.ts`:
```ts
const mq = window.matchMedia("(max-width: 767px)");
// estado inicial = mq.matches; listener 'change' para resize/orientation.
// Si el server pintó "desktop" pero matchMedia dice "mobile" → setear cookie y `router.refresh()`
// (solo si el desfase persiste tras debounce, para evitar loop).
```
**Cuándo el cliente "corrige"**:
- iPad con UA tipo desktop pero ancho < 768 → corrige a mobile.
- Desktop redimensionado a < 768 → corrige.
- Mobile en landscape sobre 768 → corrige a desktop (decisión: aceptar o forzar).

### 7.4 Anti-flash
- SSR pinta la rama correcta desde el primer byte (no hay flash de la otra rama).
- Hidratación: la rama renderizada coincide con la cookie → no hay mismatch.
- Si la cookie no existe (primer visit) y el UA es ambiguo → SSR pinta desktop (default seguro) y el cliente corrige *sin* flicker visible si la rama es la misma; con flicker si es la otra. **Mitigación**: el middleware setea la cookie en la primera request (UA-based), así la segunda nav ya es correcta.

### 7.5 Dónde montar
- `src/app/layout.tsx` (root): mantiene providers compartidos (ThemeProvider, BootProvider, AuthGuard).
- Shell `DesktopAppShell` / `MobileAppShell` se monta **dentro de cada `page.tsx`** vía `DeviceRouter` *o* se elige un único `<AppShellSelector>` server component en el root que lee la cookie. **Recomendado: en el root, una sola decisión.**

### 7.6 Rutas standalone
`/login` ya está en `STANDALONE_ROUTES` (`AppShell.tsx:9`). Mantener un único componente, con CSS responsive (ya es razonable). No duplicar.

### 7.7 Política para tablet / ambiguos
Recomendación: **breakpoint a 768px**. iPads portrait (768px exacto) caen a desktop. iPad landscape (1024px+) ya es desktop. Android tablets de 7" (600-720px) → mobile.

### 7.8 Toggle manual
Footer del bottom nav "Más" → opción "Ver versión escritorio" que setea cookie `device=desktop` y hace `router.refresh()`. Reverso disponible en menú de usuario desktop. Evita lock-in.

---

## 8. Plan de ejecución por fases

### Fase 2 — Refactor a `src/shared/`
Orden propuesto (de menos a más fricción):

1. **`shared/format/`, `shared/api/`, `shared/supabase/`, `shared/auth/`** — utilidades horizontales. Bajo riesgo, alto reuso. Deduplicar `formatFecha`, `formatMonedaGs`, mover `fetchWithSupabaseSession`, `getCurrentUser`, clients Supabase. **1 sesión.**
2. **`shared/state/BootContext`, `useDeviceType`, cookie helpers** — base del DeviceRouter. **0.5 sesión.**
3. **`shared/domain/clientes/`** — `lib/clientes/` ya está bien estructurado; mover y crear `hooks.ts`. **1 sesión.** Validar contra `clientes/page.tsx` y `clientes/[id]/page.tsx`.
4. **`shared/domain/gestion-clientes/`** (facturas/tipificaciones) — pequeño. **0.5 sesión.**
5. **`shared/domain/pagos/`** — basado en gestion-clientes. **0.5 sesión.**
6. **`shared/domain/proyectos/`** — extraer helpers `isEntregado/getPostentregaInfo/getEstadoCfg` del cliente. Mover `brief-data`, `historial-*`, `sla-*`, configs. **1-1.5 sesión.**
7. **`shared/domain/crm/`** — análogo a proyectos. **1 sesión.**
8. **`shared/domain/ventas/`, `compras/`, `inventario/`** — paralelos. **1 sesión c/u.**
9. **`shared/domain/agenda/`, `gastos/`, `proveedores/`, `comisiones/`, `nota-credito/`, `usuarios/`, `planes/`, `sorteos/`, `campanas/`, `marketing-ops/`** — la mayoría son CRUD simple. **2-3 sesiones para todos juntos.**
10. **`shared/domain/dashboard/` y `reportes/`** — extraer cálculos KPI del Dashboard gigante (`page.tsx` 2847 líneas). **2 sesiones** (es donde más lógica está embebida).
11. **`shared/domain/chat/`** — el dragón. Hay que partir `ConversacionesClient.tsx` (3361 líneas) en hooks. **2-3 sesiones**, posiblemente más. Hacerlo **al final** de Fase 2 cuando ya hay rodaje del patrón.
12. **`shared/domain/configuracion/`** — sub-features. Mucho volumen, prioridad solo en lo que mobile va a consumir (read-only). **1-2 sesiones.**

**Total Fase 2 estimado:** 15–20 sesiones.

**Cómo mantener desktop intacto durante Fase 2:** mover `lib/<dominio>/storage.ts` → `shared/domain/<dominio>/api.ts` y dejar un **shim** (`lib/<dominio>/storage.ts` que re-exporta de `shared/`). Esto evita tocar imports en los componentes desktop. En una pasada final, codemod los imports.

### Fase 3 — Construcción mobile
Orden lockstep con Fase 2 (cuando un dominio está en `shared/`, se construye su screen mobile). Pero el **shell** y la **navegación** primero:

1. **DeviceRouter + MobileAppShell + BottomNav + MobileHeader + primitivos mobile** (`BottomSheet`, `Sheet`, `TabBar`, `Carousel`, `Chips`, `FAB`, `ListCard`). **2 sesiones.**
2. **Screens del bottom nav primero** (en orden de impacto):
   - DashboardScreen — **1-2 sesiones**.
   - Conversaciones (Inbox + Chat + Contacto) — **3-4 sesiones** (módulo más difícil, no subestimar).
   - Clientes (Lista + Detalle + Nuevo + Tipificación) — **2-3 sesiones**.
   - Proyectos (Lista por etapa + Detalle + Nuevo) — **2 sesiones**.
   - "Más" + estructura de navegación secundaria. **0.5 sesión.**
3. **Resto de módulos** en bloques de 2-3 por sesión para los simples (Gastos, Proveedores, Reportes, Ventas, Compras, Notas crédito, Comisiones, Planes, Usuarios, Sorteos básico, Campañas, Marketing Ops, Agenda, Etiquetas, Monitoreo, Historial, Conversaciones-finalizadas, Configuración portada). **8-10 sesiones.**
4. **Pulido**: scroll-restore, gestures (swipe-back), pull-to-refresh, safe-area, performance audit. **2 sesiones.**

**Total Fase 3 estimado:** 18–24 sesiones.

**Módulos específicamente difíciles** (no subestimar):
- **Conversaciones** (Inbox omnicanal) — UX inherentemente compleja, realtime, media, borradores, presencia.
- **Proyectos / CRM Kanban** — convertir Kanban a vista por etapa requiere UX dedicada.
- **Dashboard** — partir y curar KPIs (qué mostrar, qué no, cómo agrupar).
- **Clientes/Detalle** — 2400+ líneas con muchas tabs.
- **Configuración / flujos** — gran parte se va a "desktop-only".

---

## 9. Riesgos y decisiones pendientes

| # | Decisión | Recomendación |
|---|---|---|
| 1 | **¿Tablet → desktop o mobile?** | **Desktop a partir de 768px.** iPads se usan generalmente en landscape (≥1024px) y la UI desktop ya es funcional ahí; portrait queda en zona muerta pero es minoritario. |
| 2 | **¿Mantener los 4 commits responsive o revertir para tener `src/desktop/` pristine?** | **Mantener.** Beneficios: (a) mientras la mobile UI no esté lista, el desktop "parchado" sigue siendo usable en mobile; (b) los fixes (font-size inputs anti-zoom, modales full-screen) son **mejoras independientes** del shell y siguen valiendo en mobile UI propia; (c) revertir cuesta retrabajo. **Excepción**: el commit del sidebar como sheet mobile (`435a9b1`) se puede dejar pero el componente que renderice mobile será siempre el nuevo `MobileAppShell` — el Sidebar drawer queda como path muerto a limpiar al final. |
| 3 | **¿Bottom nav fijo o se oculta al scrollear?** | **Fijo.** En un ERP los usuarios cambian de módulo frecuentemente; un nav oculto genera fricción. Excepción posible: ocultar en pantallas modales/wizard full-screen donde el CTA bottom toma su lugar. |
| 4 | **¿Login se duplica?** | **No.** Compartido. CSS responsive ya es razonable. |
| 5 | **¿Páginas de impresión (`sorteos/imprimir-cupones`)?** | **Desktop-only.** Mostrar mensaje en mobile con CTA "Abrir en desktop". |
| 6 | **¿Configuración densa (`flujos/[flowCode]`, `colas/[queueId]`, `canales/[channelId]`) se porta?** | **Read-only en mobile** (visualización), edición solo en desktop. Documentar el corte. |
| 7 | **Cache compartida cross-screen** | Hoy NO hay (cada `useEffect` refetchea). Recomendado: introducir **react-query o SWR** en `shared/hooks/`. Costo de la decisión: dependencia + curva. Beneficio: invalidación cruzada, optimistic updates, menos requests. **Recomendación: introducir SWR (más liviano)** en Fase 2 desde el día 1; envolver storage en hooks SWR. Si se decide no, los hooks `useXxx` siguen funcionando pero sin caché. **Esta es la decisión más importante** porque condiciona la API de los hooks. |
| 8 | **Toggle "ver desktop" en mobile** | Sí. Cookie override + `router.refresh()`. |
| 9 | **Realtime en mobile (Conversaciones)** | Necesario. Validar que el patrón actual de suscripciones Supabase (`createBrowserClientForSchema`) funciona igual; probablemente sí. |
| 10 | **Bundle size mobile** | Vigilar: no importar componentes desktop en screens mobile. ESLint rule `no-restricted-imports` con boundaries `src/desktop/* → no import desde src/mobile/*` y viceversa. |
| 11 | **Naming convention de rutas** | Decidido implícitamente: **misma URL para ambas plataformas**, DeviceRouter elige render. Alternativa `/m/*` no recomendada — duplica deep links, fragmenta analytics. |
| 12 | **Componente `EdgeScrollArea`** | Hoy usado en `/clientes` para scroll lateral. En mobile no aplica (cards verticales). Mantener para desktop, no portar. |
| 13 | **Cómo manejar páginas que el usuario landea desde una URL profunda en mobile cuando la UI mobile aún no existe** (mientras Fase 3 está en curso) | **Fallback a desktop render** automático: si `MobileScreen` no existe para esa ruta, `DeviceRouter` cae a desktop. Implementar como prop opcional `mobile`. |

---

## 10. Cosas que NO se pueden determinar solo del código

- **Conversaciones (Inbox omnicanal)** — `ConversacionesClient.tsx` tiene 3361 líneas y 101 hooks. Hay realtime, presencia, asignación a colas, flujos, media, borradores. **Requiere sesión de UX dedicada** antes de portar: definir qué se hace realtime en mobile, qué se muestra del drawer de contacto, cómo se manejan adjuntos pesados, política de notificaciones push.
- **Proyectos detalle** (`ProyectoDetalleInner.tsx`) — el archivo es grande y tiene secciones (brief, historial, archivos, SLA) que probablemente necesitan re-priorización en mobile. Requiere review con usuario.
- **CRM funnel** — la transición Kanban → "vista por etapa" suena fácil pero la UX de "mover prospecto entre etapas" sin drag&drop necesita un patrón concreto (action sheet vs. swipe vs. botón). Requiere prototipo.
- **Configuración `flujos/[flowCode]`** (3000+ líneas) — no se inspeccionó al detalle. Probablemente necesita ser desktop-only; confirmar.
- **Dashboard** (2847 líneas) — qué KPIs son "must" en mobile y cuáles son "nice to have" es decisión de negocio. Hoy todo está mezclado.
- **Sorteos sub-páginas** (`/sorteos/[id]/revendedores`, `/sorteos/conversaciones`, `/sorteos/[id]/editar`) — no auditadas al detalle en el AUDIT (sección "Cobertura y limitaciones"). Requieren walk-through.
- **Reportes** — el módulo es nuevo (commit `97ace35`); las pantallas reales aún están MVP/placeholder.
- **Performance**: hasta no medir en device real (no DevTools), no se sabe si el bundle mobile podrá excluir react-pdf, chart libraries pesadas, dnd-kit (no se usa en mobile).
- **Decisión SWR vs. nada** (riesgo #7) requiere alineación previa.

---

## Apéndice — Módulos que requieren inspección adicional antes de Fase 2

Heredado del `MOBILE_AUDIT.md §"Cobertura y limitaciones"`:
- `/admin/empresas/[id]/page.tsx`, `/[id]/editar/page.tsx`, `/nueva/page.tsx`
- `/sorteos/[id]/revendedores`, `/sorteos/[id]/revendedores/[revId]/editar`, `/sorteos/conversaciones`, `/sorteos/[id]/editar`, `/dashboard/sorteos/*`
- `/gastos/nuevo`, `/gastos/[id]/editar`, `/usuarios/nuevo`
- `/dashboard/conversaciones/configuracion`, `/operacion`, `/flujos` (lista)
- `/dashboard/colas-agentes`
- `/configuracion/comisiones`, `/configuracion/metricas`, `/configuracion/vistas-dashboard`, `/configuracion/facturacion`, `/configuracion/facturacion-electronica`
- `/dashboard/etiquetas-preview`, `/dashboard/marketing-ops/piezas/[id]`
- `/usuarios/[id]` (la página, no solo el client component)

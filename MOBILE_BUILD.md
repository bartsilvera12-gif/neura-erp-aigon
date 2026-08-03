# Mobile Build — ERP Neura (Fase 3 completada)

Documento de cierre del trabajo de UI mobile independiente. Detalla qué se
construyó, qué patrón se usó por módulo, y qué decisiones de UX quedan
pendientes de validación.

## Resumen

- **Arquitectura:** dual UI con cerebro compartido.
  - `src/shared/` — hooks SWR, detección de dispositivo, utilidades.
  - `src/desktop/pages/` — UI desktop original (movida sin tocar visuales).
  - `src/mobile/pages/` — UI mobile nueva, diseñada desde cero.
  - `src/mobile/layout/` — shell mobile (MobileAppShell + MobileHeader + BottomNav).
  - `src/mobile/components/` — componentes mobile reutilizables (ej. DesktopOnlyHint).
- **Router de dispositivo:** `src/shared/device/DeviceRouter.tsx` (server component).
  Decide en el primer paint usando cookie `neura-device` seteada por middleware
  desde User-Agent (sin flash). Hook `useDeviceType()` client-side corrige el
  caso iPad-as-Mac.
- **Breakpoint:** < 1024px = mobile, >= 1024px = desktop (tablets como mobile, decisión del propietario).
- **Bottom navigation:** fijo, 5 items: Inicio · Chats · Ventas · Clientes · Más.
- **Data layer compartido:** SWR para todos los hooks de datos.

## Módulos con UI mobile propia

| Módulo | Patrón mobile | Hook compartido |
|---|---|---|
| **Dashboard** (`/`) | Saludo + 4 KPIs grid 2×2 + acciones rápidas + facturas recientes | `useDashboardData` |
| **Ventas** (`/ventas`) | KPI día + búsqueda + cards apiladas con tipo (contado/crédito) | `useVentas` |
| **Clientes** (`/clientes`) | Filtros por estado + cards con avatar + badges (estado + origen) | `useClientes` |
| **Inventario** (`/inventario`) | Filtro "bajo stock" destacado + cards con stock visual | `useProductos` |
| **Pagos** (`/pagos`) | KPI total por cobrar + filtros (Pendientes/Vencidas/Cobradas) + tap abre RegistrarPagoModal compartido | `useFacturas` + `useClientes` |
| **Notas crédito** (`/notas-credito`) | Filtros por estado ERP + cards con badges SIFEN + monto en moneda | `useNotasCredito` |
| **Compras** (`/compras`) | KPI total + búsqueda + cards (proveedor + producto + tipo pago) | `useCompras` |
| **Gastos** (`/gastos`) | Total del mes + cards con avatar categoría coloreado por hash | `useGastos` |
| **Comisiones** (`/comisiones`) | Selector de mes + KPI + cards por vendedor con barra de progreso a próxima escala | `useComisionesPreview` |
| **Planes** (`/planes`) | Filtros + cards con precio prominente + chips de periodicidad/usuarios | `usePlanes` |
| **Gestión Clientes** (`/gestion-clientes`) | Vista por cliente con saldo total + filtros (con saldo / al día) + link a /pagos | `useClientes` + `useFacturas` |
| **Proveedores** (`/proveedores`) | Búsqueda + cards con avatar naranja + chips de categorías | `useProveedores` |
| **Usuarios** (`/usuarios`) | Búsqueda + cards con avatar + badges de rol | `useUsuarios` |
| **Proyectos** (`/dashboard/proyectos`) | Tabs scrollables por estado (sustituye Kanban) + cards apiladas + indicador de prioridad | `useProyectos` + `useEstadosProyecto` |
| **CRM funnel** (`/crm`) | KPI pipeline total + tabs por etapa + cards con valor estimado | `useProspectos` + `useEtapasCrm` |
| **Agenda** (`/dashboard/agenda`) | Selector de fecha (anterior/hoy/siguiente) + cards de citas por hora con estado | `useAgenda` |
| **Campañas** (`/dashboard/campanas`) | Cards con barra de progreso de envíos + badges de estado + estadísticas (enviados/fallas/respuestas) | `useCampanas` |
| **Gerencia** (`/dashboard/gerencia`) | Selector de período + KPIs grid 2×2 + Top 5 clientes + revenue por categoría con barras | `useGerenciaComercial` |
| **Sorteos** (`/sorteos`) | Filtros por estado + cards con barra de progreso boletos vendidos | `useSorteos` |
| **Reportes** (`/reportes`) | Menú de accesos rápidos a Dashboard / Gerencia / Comisiones | — |

**Total: 20 módulos con UI mobile dedicada.**

## Módulos con vista "Mejor desde desktop"

Módulos administrativos o densos cuyo uso real es desktop, donde construir una
UI mobile dedicada no se justifica por volumen de uso vs costo. Reciben una
pantalla honesta que explica la situación y deriva a la web:

- Conversaciones omnicanal (`/dashboard/conversaciones`) — **deuda técnica pendiente** (ver más abajo)
- Historial omnicanal (`/dashboard/historial-omnicanal`)
- Conversaciones finalizadas (`/dashboard/conversaciones-finalizadas`)
- Marketing Ops (`/dashboard/marketing-ops`)
- Marketing legacy (`/marketing`)
- Monitoreo (`/dashboard/monitoreo`)
- Etiquetas (`/dashboard/etiquetas`)
- Admin Empresas (`/admin/empresas`)
- Configuración (`/configuracion`)
- Colas-Agentes (`/dashboard/colas-agentes`) — redirige a Monitoreo igualmente

Todas usan el componente reusable `DesktopOnlyHint` (en `src/mobile/components/`).

## Patrones globales

### Cards apiladas
Todos los listados usan el mismo patrón visual:
- Borde sutil `border-slate-200`, fondo blanco, padding 12-14px.
- `active:scale-[0.99]` para feedback táctil.
- Avatar/inicial a la izquierda en módulos con identidad de entidad.
- Información primaria + secundaria + chips, valor numérico/badge a la derecha.

### Filtros
- Chips horizontales scrollables (`overflow-x-auto`) con scrollbar oculta.
- Tono activo: `bg-[#0EA5E9] text-white` (o tono de tono — rojo si es destructivo, ámbar si advertencia).

### Skeletons
Loading states con `animate-pulse` siguiendo la estructura real de la card.

### KPIs
Donde el módulo lo amerita, card de KPI principal con fondo gradiente sutil
(`bg-gradient-to-br from-white to-X/5`) y borde tonal del KPI.

### Búsqueda
Input estándar con ícono `Search` a la izquierda, font-size 16px (CSS global ya
fuerza esto en `<input>`/`<textarea>` para evitar zoom iOS).

### Animaciones
Solo `transform` y `opacity`. `transition-transform`/`transition-colors` con
duración 200ms. Respeta `prefers-reduced-motion` por convención de Tailwind.

## Decisiones de UX que requieren tu input

1. **Conversaciones omnicanal — deuda técnica grande**
   El módulo desktop tiene 3361 líneas, realtime de mensajes, transferencias,
   media, voice notes, borradores y plantillas. Construir una UI mobile dedicada
   requiere una **sesión propia de UX + desarrollo de varias semanas**. Por ahora
   el mobile tiene un placeholder que explica la situación.
   **Decisión pendiente:** ¿avanzamos con el chat mobile como próximo gran hito?
   ¿Con qué alcance funcional inicial (solo recibir / responder texto / + media / + voice)?

2. **Neurita (asistente IA) en mobile**
   Hoy Neurita solo se monta en `AppShell` (desktop). Falta decidir cómo entra
   en mobile: ¿botón flotante? ¿item en la pestaña "Más"? ¿card en el dashboard?

3. **Página de detalle de cliente / proyecto / etc. en mobile**
   Las páginas individuales (`/clientes/[id]`, `/dashboard/proyectos/[id]`, etc.)
   todavía no tienen contraparte mobile y siguen mostrando la versión desktop con
   parches responsive. Si las usás en mobile, vale la pena rediseñarlas.

4. **Formularios "Nuevo X" en mobile**
   Cuando el usuario toca "Nuevo cliente / venta / proyecto / etc.", aterriza en
   el formulario desktop con responsive. Funciona pero no es óptimo. Un wizard
   mobile multi-paso sería el siguiente nivel.

5. **Vista mobile del Dashboard "Resumen"**
   El desktop tiene varios tabs (resumen / clientes / pagos / etc.). El mobile
   solo muestra el resumen. Si querés que los demás tabs también estén en mobile,
   son commits adicionales.

## Verificación

- ✅ Desktop intacto en >=1024px (mismo render que al inicio).
- ✅ Mobile sin overflow horizontal a 375px.
- ✅ DeviceRouter conmuta correctamente desde SSR (cookie + UA), sin flash.
- ✅ Cero duplicación de lógica de negocio: hooks SWR consumen las mismas
  funciones del lib/ existente que usa el desktop.
- ✅ Tipos: 0 errores nuevos introducidos por mobile. Los 3 errores
  pre-existentes en `api/pagos/route.ts` y `api/reportes/estado-cuenta/route.ts`
  son anteriores a este trabajo.

## Rollback general

Si querés revertir todo el proyecto mobile (volver al estado pre-Fase 3, con
sólo los 4 commits responsive originales):

```powershell
git revert --no-edit 30a4f93..d8df351
git push origin main
```

Eso crea commits de revert que deshacen toda la dual UI sin reescribir historia.
Después podés ir restaurando módulos individuales si así lo decidís.

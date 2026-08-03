# Mapa Funcional del ERP — Neura/Zentra

> Auditoría: junio 2026. Fuente: código del repositorio + navegación real en producción.

## 1. Identidad del producto

- **Producto:** ERP SaaS multiempresa para pymes paraguayas. Marca visual **Zentra** (teal `#4FAEB2`),
  proyecto/repositorio **Neura ERP**. Existe preparación para instancias self-hosted dedicadas.
- **Stack:** Next.js 16 (App Router) + React 19 + TailwindCSS 4, Supabase (PostgreSQL + Auth +
  Storage + Realtime), despliegue en Vercel. Facturación electrónica SIFEN (SET, Paraguay).
- **URL de producción auditada:** `https://sistemas.neura.com.py`

## 2. Módulos (activables por empresa)

El catálogo de módulos vive en la tabla `modulos`; cada empresa habilita módulos vía
`empresa_modulos` y puede restringir por usuario vía `usuario_modulos`
(`src/lib/modulos/resolve-effective-modules.ts`).

| Módulo (slug) | Ruta principal | Resumen |
|---|---|---|
| `dashboard` | `/` | KPIs comerciales, financieros, inventario, ventas |
| `conversaciones` (+aliases `historial-omnicanal`, `conversaciones-finalizadas`, `monitoreo`, `omnicanal`) | `/dashboard/conversaciones` | Inbox omnicanal (WhatsApp), colas, agentes, flujos bot |
| `ventas` (incluye `notas_credito`) | `/ventas` | Órdenes de venta; notas de crédito |
| `inventario` | `/inventario` | Productos, movimientos, categorías, depósitos |
| `clientes` (incluye `gestion-clientes`) | `/clientes` | Cartera de clientes; panel de cobranzas |
| `compras` | `/compras` | Órdenes de compra + proveedores |
| `gastos` | `/gastos` | Gastos operativos |
| `pagos` | `/pagos` | Pagos contra facturas |
| `comisiones` | `/comisiones` | Comisiones de vendedores (políticas, escalas, períodos) |
| `usuarios` | `/usuarios` | Gestión de usuarios de la empresa |
| `configuracion` | `/configuracion` | Parámetros de empresa, SIFEN, canales, colas |
| `planes` | `/planes` | Catálogo de planes/suscripciones |
| `crm` | `/crm` | Pipeline de prospectos (Kanban) |
| `marketing` | `/marketing` | Marketing legacy |
| `marketing_ops` | `/dashboard/marketing-ops` | Piezas creativas y operaciones de marketing |
| `campanas` | `/dashboard/campanas` | Campañas WhatsApp (plantillas, envíos masivos) |
| `proyectos` | `/dashboard/proyectos` | Kanban de proyectos, tareas, SLA |
| `agenda` | `/dashboard/agenda` | Citas (día/semana/mes/lista) |
| `sorteos` | `/sorteos` | Rifas: entradas, cupones, revendedores, OCR |
| `etiquetas` | `/dashboard/etiquetas` | Segmentación de contactos de chat |
| — (super_admin) | `/admin/empresas` | Gestión de tenants y módulos |

## 3. Navegación

- **Sidebar dinámico** (`src/components/layout/Sidebar.tsx`): renderiza solo los módulos
  habilitados para el usuario. Incluye búsqueda de menú, favoritos (localStorage), colapso,
  sección exclusiva de super admin e indicador de presencia.
- **Gate por ruta:** `pathRequiresModuleSlug()` mapea cada pathname al módulo requerido
  (`src/lib/modulos/route-slug-map.ts`). Si el usuario no tiene el módulo, la app **redirige al
  dashboard** (comportamiento observado en producción con el usuario tester).
- Subitems: Inventario (Productos/Movimientos/Categorías/Depósitos), Compras (Órdenes/Proveedores),
  Configuración (Facturación/Equipos), Sorteos (Tickets/Comprobantes).

## 4. Multi-tenancy y seguridad (observado)

- **Modelo híbrido:**
  - Catálogo global en schema `zentra_erp`: `empresas`, `usuarios`, `modulos`, `empresa_modulos`,
    `usuario_modulos`.
  - Datos operativos: en `zentra_erp` (legacy, separación por `empresa_id` + RLS) **o** en un
    schema dedicado por tenant `erp_<slug>_<8hex>` (provisionado por RPC
    `neura_provision_empresa_data_schema`, ver migración `20260416140000_zentra_erp_full_tenant_clone.sql`).
  - La columna `empresas.data_schema` decide el schema del tenant; vacío ⇒ `zentra_erp`.
- **RLS:** funciones `empresa_id_actual()` (por email del JWT), `es_super_admin()`,
  `puede_acceder_empresa(uuid)` (`supabase/migrations/20250312000000_rls_multiempresa.sql`).
- **Roles:** `super_admin` (global, empresa_id NULL), `admin/administrador` (su empresa),
  `supervisor` (módulos asignados + omnicanal), resto (intersección empresa ∩ usuario).
- **Storage:** Supabase Storage (buckets observados: `chat_media`, `productos_imagenes`,
  XML/KuDE de SIFEN, archivos de tareas de proyectos, tickets de sorteos).

## 5. Relaciones y dependencias funcionales

```
CRM (prospecto GANADO) ──crea──▶ Cliente ──▶ Facturas ──▶ Pagos ──▶ Comisiones
                                   │             │
                                   │             └─▶ Factura electrónica SIFEN ──▶ Nota de crédito
                                   ├─▶ Proyectos (Kanban, tareas, SLA)
                                   ├─▶ Agenda (citas por cliente/prospecto)
                                   └─▶ Suscripciones (Planes)

Compras ──entrada──▶ Inventario ◀──salida── Ventas
Proveedores ──▶ Compras            Gastos (independiente)

WhatsApp/Omnicanal: Canales ─▶ Conversaciones ─▶ Colas/Agentes ─▶ Cierres (taxonomía)
                       │            │
                       │            └─▶ Flujos bot (nodos, captura de datos, OCR)
                       ├─▶ Campañas (plantillas Meta/YCloud)
                       └─▶ Etiquetas (segmentación) ─▶ Campañas desde etiqueta

Sorteos: Sorteo ─▶ Conversación WhatsApp (bot) ─▶ Entrada (pago + comprobante OCR)
                   ─▶ Cupones numerados ─▶ Entrega por WhatsApp (texto/imagen)
                   └─▶ Revendedores (links públicos /r/[codigo], comisiones)

n8n (externo): webhooks ─▶ /api/crm/leads (lead desde WhatsApp)
                        ─▶ /api/raffles/entries/create (compra de sorteo)
```

## 6. Puntos críticos (alto impacto si fallan)

1. **Facturación electrónica SIFEN** — certificados digitales, timbrado, XML firmado, envío a SET.
   Errores aquí tienen impacto fiscal/legal.
2. **Webhooks de WhatsApp (Meta/YCloud)** — toda la operación omnicanal y de sorteos depende de
   la recepción de mensajes entrantes.
3. **RLS / aislamiento multi-tenant** — la separación de datos entre empresas depende de RLS +
   resolución correcta de `data_schema`.
4. **Pagos y saldos de facturas** — el registro de pagos actualiza saldos; inconsistencias afectan
   cobranzas y comisiones.
5. **Motor de flujos (flow engine)** — sesiones de bot con estado; los sorteos venden a través
   de él.

## 7. Permisos observados en producción (usuario tester)

Con el usuario tester de esta auditoría, las siguientes rutas **redirigen al dashboard** (módulos
no habilitados para su empresa): `/inventario*`, `/compras*`, `/proveedores*`, `/ventas*`,
`/sorteos*`, `/marketing`, `/dashboard/marketing-ops`, `/dashboard/colas-agentes`.
El resto de los módulos (dashboard, clientes, CRM, gastos, pagos, comisiones, planes, agenda,
proyectos, conversaciones, campañas, notas de crédito, usuarios, configuración) fue accesible
y está capturado en `screenshots/`.

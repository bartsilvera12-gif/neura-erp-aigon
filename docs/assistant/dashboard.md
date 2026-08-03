# Dashboard

## Objetivo

Dar una visión 360° del negocio apenas el usuario inicia sesión: situación comercial (CRM),
financiera (facturas/pagos), de inventario y de ventas, en un solo lugar.

## Explicación funcional

- **Ruta:** `/` (home). Es la pantalla de aterrizaje tras el login.
- Organizado en **tabs/sub-vistas** por área: Comercial, Financiero, Inventario, Ventas (las
  vistas visibles dependen de los módulos habilitados y de la configuración de
  `Configuración → Vistas de dashboard`).
- Componentes típicos: tarjetas de KPI con tendencia, gráficos (líneas/barras/torta con Recharts)
  y tablas resumen.

### KPIs principales por área

| Área | KPIs |
|---|---|
| Comercial | Prospectos por etapa del funnel, clientes nuevos del mes, valor en negociación |
| Financiero | Facturas emitidas/pagadas/vencidas, saldo total adeudado, mora promedio |
| Inventario | Productos con stock bajo (< mínimo), movimientos recientes, margen promedio |
| Ventas | Facturación de hoy/mes, cantidad de ventas, ticket promedio, productos vendidos |

## Casos de uso

- El gerente entra por la mañana y revisa facturación del día anterior y facturas vencidas.
- Un supervisor comercial controla cuántos prospectos hay en "Negociación".
- El encargado de depósito detecta productos bajo stock mínimo sin entrar a Inventario.

## Flujo paso a paso

1. Iniciar sesión en `/login` con email y contraseña.
2. El sistema redirige al Dashboard (`/`).
3. Elegir la pestaña del área a revisar (Comercial / Financiero / etc.).
4. Hacer clic en un KPI o tabla para profundizar (navega al módulo correspondiente).

## Preguntas frecuentes

- **¿Por qué no veo alguna pestaña del dashboard?** Las vistas dependen de los módulos que su
  empresa tiene habilitados y de la configuración de vistas (`/configuracion/vistas-dashboard`).
- **¿Los datos son en tiempo real?** Los KPIs se calculan al cargar la página; algunos módulos
  (conversaciones, proyectos) usan Realtime, el dashboard se actualiza al refrescar.
- **¿Puedo personalizar qué KPIs veo?** Sí, desde Configuración → Vistas de dashboard (según rol).

## Errores comunes

- *"No tenés acceso a este módulo"* / redirección al dashboard: el módulo destino no está
  habilitado para su empresa o usuario.
- Dashboard vacío o en cero: la empresa todavía no cargó datos (clientes, ventas, facturas).

## Capturas relacionadas

- `screenshots/dashboard/01-dashboard-principal.png` — vista Comercial con KPIs y pipeline.
- `screenshots/dashboard/02-dashboard-financiero.png` — tab Financiero.
- `screenshots/login/01-pantalla-login.png` — pantalla de acceso.

-- =============================================================================
-- Sembrar el catálogo `aigonerp.dashboard_views` con las 4 pestañas del home.
-- Es lo que la API `/api/empresas/mis-dashboard-views` devuelve al super_admin:
-- lee todas las filas activas de este catálogo. Si está vacío, el dashboard
-- muestra "No hay vistas del tablero disponibles para tu usuario".
-- Idempotente: se puede correr cuantas veces haga falta.
-- =============================================================================

INSERT INTO aigonerp.dashboard_views (slug, nombre, orden, activo)
VALUES
  ('comercial',  'Comercial',  10, true),
  ('financiero', 'Financiero', 20, true),
  ('inventario', 'Inventario', 30, true),
  ('ventas',     'Ventas',     40, true)
ON CONFLICT (slug) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden  = EXCLUDED.orden,
  activo = EXCLUDED.activo;

-- Refrescar PostgREST para que exponga los datos nuevos sin reiniciar.
SELECT pg_notify('pgrst', 'reload schema');

-- Verificación
SELECT slug, nombre, orden, activo FROM aigonerp.dashboard_views ORDER BY orden;

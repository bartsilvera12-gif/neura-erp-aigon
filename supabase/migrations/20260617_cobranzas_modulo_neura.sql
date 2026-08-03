-- =============================================================================
-- Módulo "Cobranzas" (Seguimiento Cobranzas) — registro de módulo. Fase 1.
-- SOLO schema `neura`. Idempotente. No toca datos de negocio (clientes/facturas/pagos).
-- Aplicar con: node scripts/apply-migration-file-pg.cjs <este archivo>  (o vía SSH psql)
-- =============================================================================

-- 1) Alta del módulo en el catálogo (si no existe)
INSERT INTO neura.modulos (nombre, slug)
SELECT 'Cobranzas', 'cobranzas'
WHERE NOT EXISTS (SELECT 1 FROM neura.modulos WHERE slug = 'cobranzas');

-- 2) Activarlo en cada empresa que YA gestiona módulos vía empresa_modulos.
--    (Si una empresa no tiene filas, ve el catálogo completo por defecto → no requiere fila.)
INSERT INTO neura.empresa_modulos (empresa_id, modulo_id, activo)
SELECT em.empresa_id, m.id, true
FROM (SELECT DISTINCT empresa_id FROM neura.empresa_modulos) em
CROSS JOIN neura.modulos m
WHERE m.slug = 'cobranzas'
  AND NOT EXISTS (
    SELECT 1 FROM neura.empresa_modulos x
    WHERE x.empresa_id = em.empresa_id AND x.modulo_id = m.id
  );

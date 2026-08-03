-- Fase 2 Gerencia: clasificación + views read-only en neura. NO toca datos transaccionales.
BEGIN;

-- 1) Tabla de clasificación de planes/servicios
CREATE TABLE IF NOT EXISTS neura.plan_categoria (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid null,
  categoria text not null,
  naturaleza text not null,
  label text null,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON neura.plan_categoria TO authenticated, service_role;
GRANT SELECT ON neura.plan_categoria TO anon;

-- seed idempotente: limpiar y reclasificar todos los planes existentes
DELETE FROM neura.plan_categoria;
INSERT INTO neura.plan_categoria (plan_id, categoria, naturaleza, label)
SELECT p.id,
  CASE
    WHEN coalesce(p.es_plan_marketing,false) THEN 'marketing'
    WHEN upper(p.nombre) ~ 'CONTABILIDAD|CONTABLE|PLAN IVA|PLAN IRP|EMPRENDEDOR|ESTRATEGIA|TRIBUTAR' THEN 'contabilidad'
    WHEN upper(p.nombre) ~ 'ERP|SISTEMA|SORTEO|INFORMATIC|SAAS|AUTOMATIZ|\mBOT\M' THEN 'saas_erp'
    WHEN upper(p.nombre) ~ 'PAGINA WEB|\mWEB\M|ECOMMERCE|LANDING|PAGOS' THEN 'web_landing'
    WHEN upper(p.nombre) ~ 'BRANDING' THEN 'branding'
    WHEN upper(p.nombre) ~ 'REGISTRO DE MARCA|\mEAS\M|MARCA' THEN 'otros'
    ELSE 'sin_clasificar'
  END AS categoria,
  CASE
    WHEN upper(p.nombre) ~ 'IMPLEMENTACION|SORTEO|REGISTRO DE MARCA|PAGINA WEB|ECOMMERCE|\mEAS\M' THEN 'unico'
    WHEN coalesce(p.es_plan_marketing,false)
      OR upper(p.nombre) ~ 'CONTABILIDAD|CONTABLE|PLAN IVA|PLAN IRP|EMPRENDEDOR|ESTRATEGIA|ZENTRA ERP' THEN 'recurrente'
    ELSE 'mixto'
  END AS naturaleza,
  p.nombre
FROM neura.planes p;

-- 2) Helper: categoría por factura (suscripción->plan->categoria; fallback descripción; fallback sin_clasificar)
CREATE OR REPLACE VIEW neura.v_factura_categoria AS
SELECT f.id AS factura_id, f.empresa_id,
  COALESCE(pc.categoria,
    CASE
      WHEN it.d ~* 'contabilidad|contable|plan iva|plan irp|emprendedor|estrategia|tributar' THEN 'contabilidad'
      WHEN it.d ~* 'erp|sistema|sorteo|informatic|saas|automatiz|bot' THEN 'saas_erp'
      WHEN it.d ~* 'web|pagina|landing|ecommerce' THEN 'web_landing'
      WHEN it.d ~* 'branding' THEN 'branding'
      WHEN it.d ~* 'registro de marca|marca' THEN 'otros'
      ELSE 'sin_clasificar'
    END) AS categoria,
  COALESCE(pc.naturaleza, CASE WHEN f.tipo='suscripcion' THEN 'recurrente' ELSE 'unico' END) AS naturaleza
FROM neura.facturas f
LEFT JOIN neura.suscripciones s ON s.id = f.suscripcion_id
LEFT JOIN neura.plan_categoria pc ON pc.plan_id = s.plan_id AND pc.activo
LEFT JOIN LATERAL (SELECT string_agg(lower(descripcion), ' ') d FROM neura.factura_items fi WHERE fi.factura_id = f.id) it ON true;

-- 3) v_revenue_mensual
CREATE OR REPLACE VIEW neura.v_revenue_mensual AS
WITH fact AS (
  SELECT empresa_id, date_trunc('month', fecha)::date AS mes,
    count(*) FILTER (WHERE estado <> 'Anulado') AS facturas_count,
    coalesce(sum(monto) FILTER (WHERE estado <> 'Anulado'),0) AS facturado_total,
    coalesce(sum(saldo) FILTER (WHERE estado = 'Pendiente'),0) AS pendiente_total,
    count(*) FILTER (WHERE estado = 'Pagado') AS facturas_pagadas,
    count(*) FILTER (WHERE estado = 'Pendiente') AS facturas_pendientes,
    count(*) FILTER (WHERE estado = 'Anulado') AS facturas_anuladas
  FROM neura.facturas GROUP BY 1,2
),
pag AS (
  SELECT empresa_id, date_trunc('month', fecha_pago)::date AS mes, coalesce(sum(monto),0) AS cobrado_total
  FROM neura.pagos GROUP BY 1,2
)
SELECT COALESCE(f.empresa_id,p.empresa_id) AS empresa_id, COALESCE(f.mes,p.mes) AS mes,
  COALESCE(f.facturas_count,0) AS facturas_count,
  COALESCE(f.facturado_total,0) AS facturado_total,
  COALESCE(p.cobrado_total,0) AS cobrado_total,
  COALESCE(f.pendiente_total,0) AS pendiente_total,
  CASE WHEN COALESCE(f.facturas_count,0)>0 THEN round(f.facturado_total/f.facturas_count) ELSE 0 END AS ticket_promedio,
  COALESCE(f.facturas_pagadas,0) AS facturas_pagadas,
  COALESCE(f.facturas_pendientes,0) AS facturas_pendientes,
  COALESCE(f.facturas_anuladas,0) AS facturas_anuladas
FROM fact f FULL OUTER JOIN pag p ON f.empresa_id=p.empresa_id AND f.mes=p.mes;

-- 4) v_revenue_por_categoria
CREATE OR REPLACE VIEW neura.v_revenue_por_categoria AS
SELECT f.empresa_id, date_trunc('month', f.fecha)::date AS mes, fc.categoria,
  count(*) AS facturas, coalesce(sum(f.monto),0) AS facturado
FROM neura.facturas f JOIN neura.v_factura_categoria fc ON fc.factura_id = f.id
WHERE f.estado <> 'Anulado'
GROUP BY 1,2,3;

-- 5) v_mrr
CREATE OR REPLACE VIEW neura.v_mrr AS
SELECT s.empresa_id, coalesce(pc.categoria,'sin_clasificar') AS categoria,
  count(*) FILTER (WHERE s.estado='activa') AS subs_activas,
  coalesce(sum(s.precio) FILTER (WHERE s.estado='activa'),0) AS mrr,
  count(*) FILTER (WHERE s.estado='cancelada') AS subs_canceladas,
  coalesce(sum(s.precio) FILTER (WHERE s.estado='cancelada'),0) AS mrr_cancelado
FROM neura.suscripciones s
LEFT JOIN neura.plan_categoria pc ON pc.plan_id = s.plan_id AND pc.activo
GROUP BY 1,2;

-- 6) v_clientes_recurrentes
CREATE OR REPLACE VIEW neura.v_clientes_recurrentes AS
SELECT f.empresa_id, f.cliente_id, cl.nombre AS cliente,
  count(DISTINCT date_trunc('month', f.fecha)) AS meses_facturados,
  count(*) AS facturas, round(avg(f.monto)) AS monto_promedio,
  max(f.fecha) AS ultimo_mes, max(cl.estado) AS estado_cliente,
  mode() WITHIN GROUP (ORDER BY fc.categoria) AS categoria_estimada
FROM neura.facturas f
JOIN neura.clientes cl ON cl.id = f.cliente_id
LEFT JOIN neura.v_factura_categoria fc ON fc.factura_id = f.id
WHERE f.estado <> 'Anulado'
GROUP BY 1,2,3
HAVING count(DISTINCT date_trunc('month', f.fecha)) >= 2;

-- 7) v_cuentas_por_cobrar
CREATE OR REPLACE VIEW neura.v_cuentas_por_cobrar AS
SELECT f.empresa_id, f.id AS factura_id, f.numero_factura, f.cliente_id, cl.nombre AS cliente,
  f.monto, f.saldo, f.fecha, f.fecha_vencimiento,
  CASE WHEN f.fecha_vencimiento IS NOT NULL THEN greatest(0, (current_date - f.fecha_vencimiento)) ELSE NULL END AS dias_atraso
FROM neura.facturas f JOIN neura.clientes cl ON cl.id = f.cliente_id
WHERE f.estado = 'Pendiente';

-- grants de las views
GRANT SELECT ON neura.v_factura_categoria, neura.v_revenue_mensual, neura.v_revenue_por_categoria,
  neura.v_mrr, neura.v_clientes_recurrentes, neura.v_cuentas_por_cobrar
  TO authenticated, service_role, anon;

COMMIT;

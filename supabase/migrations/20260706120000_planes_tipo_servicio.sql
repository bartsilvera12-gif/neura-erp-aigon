-- Tipo de servicio a nivel PLAN (no solo cliente): permite que un mismo cliente con
-- suscripciones de distinto servicio (p. ej. Contable + SaaS) aparezca en el filtro de
-- Cobranzas de CADA equipo con la deuda que le corresponde. Cobranzas clasifica cada
-- SERVICIO por el tipo de su plan; si el plan no tiene tipo, cae al tipo del cliente.
-- Slugs = catálogo cliente_tipos_servicio_catalogo (otro=Contable, saas, web, marketing, branding).
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS tipo_servicio text;

-- Backfill por patrón de nombre. Solo setea donde está NULL (no pisa cargas manuales).
-- Los planes que no matchean quedan NULL → Cobranzas usa el tipo del cliente (comportamiento previo).
UPDATE public.planes SET tipo_servicio = CASE
  WHEN es_plan_marketing THEN 'marketing'
  WHEN nombre ILIKE '%CONTAB%' OR nombre ILIKE '%IVA%' OR nombre ILIKE '%IRP%' OR nombre ILIKE '%SERVICIOS CONTABLES%' THEN 'otro'
  WHEN nombre ILIKE '%ERP%' OR nombre ILIKE '%ZENTRA%' OR nombre ILIKE '%AUTOMATIZ%' THEN 'saas'
  WHEN nombre ILIKE '%PAGINA WEB%' OR nombre ILIKE '%ECOMMERCE%' THEN 'web'
  WHEN nombre ILIKE '%BRANDING%' THEN 'branding'
  WHEN nombre ILIKE '%EMPRENDEDOR%' OR nombre ILIKE '%ESTRATEGIA%' OR nombre ILIKE '%MARKETING%' THEN 'marketing'
  ELSE NULL
END
WHERE tipo_servicio IS NULL;

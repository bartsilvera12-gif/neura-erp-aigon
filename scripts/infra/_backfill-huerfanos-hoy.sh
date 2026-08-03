#!/usr/bin/env bash
# Backfill idempotente: crea crm_prospectos para contactos WhatsApp de hoy
# sin crm_prospecto_id, replicando exactamente la lógica de
# ensureWhatsappInboundCrmLeadPg (mismo schema 'neura').
set -e

docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Vista temporal de huérfanos: contactos creados hoy sin prospecto, con su
-- primer conversación + canal asociados.
WITH huerfanos AS (
  SELECT
    ct.id          AS contact_id,
    ct.empresa_id,
    ct.phone_number,
    ct.phone_normalized,
    ct.name,
    conv.id        AS conversation_id,
    conv.channel_id,
    ch.nombre      AS channel_nombre,
    ch.provider    AS channel_provider,
    ch.type        AS channel_type,
    -- Primera etapa no terminal del CRM:
    (SELECT codigo FROM neura.crm_etapas
       WHERE empresa_id = ct.empresa_id AND activo = true
         AND upper(codigo) NOT IN ('GANADO','PERDIDO')
       ORDER BY orden ASC NULLS LAST LIMIT 1) AS etapa_codigo
  FROM neura.chat_contacts ct
  LEFT JOIN LATERAL (
    SELECT id, channel_id FROM neura.chat_conversations c
    WHERE c.contact_id = ct.id
    ORDER BY c.created_at ASC LIMIT 1
  ) conv ON true
  LEFT JOIN neura.chat_channels ch ON ch.id = conv.channel_id
  WHERE ct.crm_prospecto_id IS NULL
    AND ct.created_at >= '2026-06-16'
    AND conv.id IS NOT NULL
),
-- Inserta prospectos. Usa generate_series para numero_control consecutivo.
numerados AS (
  SELECT
    h.*,
    'CRM-' || lpad(
      ((SELECT COALESCE(MAX(substring(numero_control FROM 5) ::int), 0)
        FROM neura.crm_prospectos
        WHERE empresa_id = h.empresa_id
          AND numero_control ~ '^CRM-[0-9]+$') + row_number() OVER (ORDER BY h.contact_id))::text,
      6, '0') AS numero_control
  FROM huerfanos h
),
inserted AS (
  INSERT INTO neura.crm_prospectos
    (empresa_id, numero_control, empresa, contacto, telefono, servicio,
     valor_estimado, etapa, creado_por, origen_creacion, first_conversation_id)
  SELECT
    n.empresa_id,
    n.numero_control,
    'WhatsApp',
    COALESCE(NULLIF(trim(n.name), ''), n.phone_number, 'Contacto WhatsApp'),
    n.phone_number,
    'Consulta por WhatsApp',
    0,
    COALESCE(n.etapa_codigo, 'LEAD'),
    COALESCE(
      NULLIF(trim(n.channel_nombre), ''),
      CASE WHEN lower(n.channel_provider) = 'ycloud'
           THEN 'WhatsApp (' || COALESCE(n.channel_type, 'whatsapp') || ') · YCloud'
           ELSE 'WhatsApp (' || COALESCE(n.channel_type, 'whatsapp') || ')'
      END
    ),
    'whatsapp',
    n.conversation_id
  FROM numerados n
  RETURNING id, telefono, numero_control, first_conversation_id
)
UPDATE neura.chat_contacts ct
SET crm_prospecto_id = i.id, updated_at = now()
FROM inserted i
WHERE ct.phone_number = i.telefono AND ct.crm_prospecto_id IS NULL;

COMMIT;

\echo
\echo === Resultado: prospectos creados hoy ===
SELECT
  p.numero_control,
  p.contacto,
  left(p.telefono,4)||'***'||right(p.telefono,2) AS tel,
  p.first_conversation_id IS NOT NULL AS tiene_first_conv,
  (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.crm_prospectos p
WHERE p.fecha_creacion::date = '2026-06-16'
ORDER BY p.fecha_creacion DESC;

\echo
\echo === Contactos hoy ya vinculados ===
SELECT
  ct.id::text AS contact_id,
  left(ct.phone_number,4)||'***'||right(ct.phone_number,2) AS tel,
  ct.name,
  ct.crm_prospecto_id::text AS prospecto_id
FROM neura.chat_contacts ct
WHERE ct.created_at::date = '2026-06-16'
ORDER BY ct.created_at DESC;

\echo
\echo === ¿Quedaron huérfanos hoy? ===
SELECT
  COUNT(*) AS huerfanos_aun
FROM neura.chat_contacts
WHERE created_at::date = '2026-06-16'
  AND crm_prospecto_id IS NULL;
SQL

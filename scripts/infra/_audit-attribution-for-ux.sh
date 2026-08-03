#!/usr/bin/env bash
set -e
echo "=== 1) Columnas reales y nullability en chat_conversation_attribution ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='neura' AND table_name='chat_conversation_attribution'
ORDER BY ordinal_position;
"

echo
echo "=== 2) Frecuencia de campos de imagen disponibles ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*)                                                           AS total,
  COUNT(meta_image_url)                                              AS col_image_url,
  COUNT(meta_thumbnail_url)                                          AS col_thumbnail_url,
  COUNT(meta_video_url)                                              AS col_video_url,
  COUNT(*) FILTER (WHERE first_attribution_payload ? 'image_url')    AS payload_image_url,
  COUNT(*) FILTER (WHERE first_attribution_payload ? 'thumbnail_url') AS payload_thumbnail_url,
  COUNT(*) FILTER (WHERE first_attribution_payload ? 'video_url')    AS payload_video_url,
  COUNT(meta_media_type)                                             AS col_media_type
FROM neura.chat_conversation_attribution;
"

echo
echo "=== 3) Distribución por media_type ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT meta_media_type, COUNT(*)
FROM neura.chat_conversation_attribution
GROUP BY 1 ORDER BY 2 DESC;
"

echo
echo "=== 4) Sample de URLs reales (test si están vencidas) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  meta_ad_id,
  left(meta_headline,40)                  AS headline,
  meta_media_type,
  COALESCE(meta_thumbnail_url, meta_image_url) IS NOT NULL AS tiene_img,
  left(COALESCE(meta_thumbnail_url, meta_image_url), 90)   AS img_url
FROM neura.chat_conversation_attribution
WHERE COALESCE(meta_thumbnail_url, meta_image_url) IS NOT NULL
ORDER BY captured_at DESC
LIMIT 5;
"

echo
echo "=== 5) source_url para inferencia de red social ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  CASE
    WHEN meta_source_url ILIKE '%instagram.com%' OR meta_source_url ILIKE '%ig.me%' THEN 'instagram'
    WHEN meta_source_url ILIKE '%facebook.com%' OR meta_source_url ILIKE '%fb.me%'  THEN 'facebook'
    WHEN meta_source_url IS NOT NULL                                                THEN 'otro'
    ELSE 'sin_url'
  END AS red_inferida,
  COUNT(*) AS conv
FROM neura.chat_conversation_attribution
GROUP BY 1 ORDER BY 2 DESC;
"

echo
echo "=== 6) Sample real de source_url para entender el dominio ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT DISTINCT
  regexp_replace(meta_source_url, '^https?://([^/]+)/.*$', '\1') AS host,
  COUNT(*) AS conv
FROM neura.chat_conversation_attribution
WHERE meta_source_url IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
"

echo
echo "=== 7) ¿first_attribution_payload trae algún hint de red social? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  jsonb_object_keys(first_attribution_payload) AS key,
  COUNT(*) AS count
FROM neura.chat_conversation_attribution
GROUP BY 1 ORDER BY 2 DESC;
"

echo
echo "=== 8) ¿raw_payload de YCloud trae campo de publisher/platform? (muestra) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%publisher_platform%')   AS publisher_platform,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%platform%')             AS platform_substring,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%placement%')            AS placement_substring,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%source_platform%')      AS source_platform_substring,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%instagram%')            AS instagram_substring,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%facebook%')             AS facebook_substring
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE ch.provider='ycloud' AND m.from_me=false
  AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral';
"

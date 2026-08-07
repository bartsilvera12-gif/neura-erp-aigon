-- =============================================================================
-- Catálogo de stickers para reenviar por WhatsApp.
--
-- Diseño:
--  - Los stickers son COMPARTIDOS entre todos los agentes de la empresa (todos
--    ven los mismos paquetes).
--  - No hay subida manual — el catálogo se arma capturando los stickers que
--    los clientes mandan al chat ("Guardar sticker" desde la burbuja).
--  - Estáticos y animados (kind).
--
-- Ejecutar en el SQL Editor de Supabase.
-- =============================================================================

CREATE TABLE IF NOT EXISTS aigonerp.sticker_packs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  nombre      text NOT NULL,
  orden       int  NOT NULL DEFAULT 0,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre)
);

CREATE INDEX IF NOT EXISTS idx_sticker_packs_empresa
  ON aigonerp.sticker_packs (empresa_id, orden);

CREATE TABLE IF NOT EXISTS aigonerp.stickers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  pack_id      uuid NOT NULL REFERENCES aigonerp.sticker_packs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,   -- ruta dentro del bucket chat-stickers
  public_url   text NOT NULL,   -- URL pública servida por Supabase Storage
  kind         text NOT NULL DEFAULT 'static' CHECK (kind IN ('static','animated')),
  source_message_id uuid,       -- de qué mensaje entrante se guardó (para auditar)
  saved_by_user_id  uuid,       -- qué agente lo guardó
  orden        int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stickers_pack ON aigonerp.stickers (pack_id, orden);
CREATE INDEX IF NOT EXISTS idx_stickers_empresa ON aigonerp.stickers (empresa_id);
-- Evita duplicados: mismo storage_path no se guarda dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stickers_storage_path
  ON aigonerp.stickers (empresa_id, storage_path);

-- RLS
ALTER TABLE aigonerp.sticker_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE aigonerp.stickers      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sticker_packs_all ON aigonerp.sticker_packs;
CREATE POLICY sticker_packs_all ON aigonerp.sticker_packs
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS stickers_all ON aigonerp.stickers;
CREATE POLICY stickers_all ON aigonerp.stickers
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON aigonerp.sticker_packs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON aigonerp.stickers      TO authenticated;
GRANT ALL ON aigonerp.sticker_packs TO service_role;
GRANT ALL ON aigonerp.stickers      TO service_role;

SELECT pg_notify('pgrst', 'reload schema');

-- Verificación
SELECT 'sticker_packs' AS tabla, count(*) AS filas FROM aigonerp.sticker_packs
UNION ALL
SELECT 'stickers', count(*) FROM aigonerp.stickers;

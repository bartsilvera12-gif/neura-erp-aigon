-- =============================================================================
-- MÓDULO: Asistente de ayuda (Fase 1 MVP) — base de conocimiento + conversaciones
-- =============================================================================
-- ⚠️ PENDIENTE DE AUTORIZACIÓN: esta migración NO debe aplicarse a producción
--    sin aprobación expresa del propietario del sistema.
--
-- Diseño (ver docs/assistant/architecture.md):
-- - Corpus de producto GLOBAL (sin empresa_id, sin datos de clientes): tablas
--   assistant_kb_documents / assistant_kb_chunks. Retrieval léxico (tsvector
--   español); embeddings quedan para una fase futura (pgvector).
-- - Conversaciones por tenant: assistant_conversations / assistant_messages con
--   empresa_id. RLS habilitado SIN políticas permisivas: solo el service role
--   (la API del asistente) lee/escribe; los clientes anon/auth no acceden.
-- - Tablas en neura (no en schema propio) para no requerir cambios en
--   "Exposed schemas" de Supabase (PostgREST) — cero cambios de infraestructura.
--
-- Portabilidad:
-- - SIN FKs hacia empresas/usuarios: según la base, el catálogo vive en `public`
--   (proyecto Supabase original) o en `neura` (instalación Zentra / instancia
--   dedicada). empresa_id/usuario_id son uuid "blandos", igual que otros módulos
--   recientes (agenda) que evitan FKs cross-schema. La integridad la garantiza la
--   API (service role) que siempre escribe con un contexto de auth resuelto.
-- - Policies `to authenticated` solo si el rol existe (Supabase); en un Postgres
--   sin ese rol, las tablas quedan deny-by-default igualmente.
-- =============================================================================

create schema if not exists neura;

-- ---------------------------------------------------------------------------
-- 1) Corpus: documentos
-- ---------------------------------------------------------------------------
create table if not exists neura.assistant_kb_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,            -- 'crm', 'facturas', 'faq', ...
  module_slug text,                     -- módulo del ERP (null = transversal)
  title text not null,
  source_path text not null,            -- docs/assistant/<slug>.md
  content_hash text not null,           -- hash del archivo fuente (ingesta idempotente)
  updated_at timestamptz not null default now()
);

comment on table neura.assistant_kb_documents is
  'Asistente: documentos del corpus de producto (global, sin datos de clientes).';

-- ---------------------------------------------------------------------------
-- 2) Corpus: chunks (secciones) con búsqueda léxica en español
-- ---------------------------------------------------------------------------
create table if not exists neura.assistant_kb_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references neura.assistant_kb_documents(id) on delete cascade,
  module_slug text,                     -- denormalizado del documento (filtro por tenant)
  heading text,                         -- título de la sección (## ...)
  content text not null,                -- texto de la sección
  screenshot_paths text[] not null default '{}',
  sort_order int not null default 0,
  tsv tsvector generated always as (
    to_tsvector('spanish', coalesce(heading, '') || ' ' || content)
  ) stored
);

create index if not exists idx_assistant_kb_chunks_tsv
  on neura.assistant_kb_chunks using gin (tsv);
create index if not exists idx_assistant_kb_chunks_document
  on neura.assistant_kb_chunks (document_id);

comment on table neura.assistant_kb_chunks is
  'Asistente: secciones del corpus para retrieval léxico (tsvector español).';

-- ---------------------------------------------------------------------------
-- 3) Conversaciones por tenant (auditoría y rate limiting)
--    empresa_id / usuario_id sin FK dura (ver "Portabilidad" arriba).
-- ---------------------------------------------------------------------------
create table if not exists neura.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_id uuid,                      -- usuarios.id del catálogo
  pathname text,                        -- pantalla donde se inició
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_conversations_empresa
  on neura.assistant_conversations (empresa_id, created_at);

create table if not exists neura.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references neura.assistant_conversations(id) on delete cascade,
  empresa_id uuid not null,
  usuario_id uuid,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,  -- chunks usados, modelo, tokens, feedback
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_conversation
  on neura.assistant_messages (conversation_id, created_at);
create index if not exists idx_assistant_messages_rate_limit
  on neura.assistant_messages (usuario_id, role, created_at);

-- ---------------------------------------------------------------------------
-- 4) RLS: deny-by-default. Solo el service role (API del asistente) accede.
--    El corpus es legible para usuarios autenticados (documentación de producto,
--    no contiene datos de clientes); escritura solo service role (ingesta).
-- ---------------------------------------------------------------------------
alter table neura.assistant_kb_documents enable row level security;
alter table neura.assistant_kb_chunks enable row level security;
alter table neura.assistant_conversations enable row level security;
alter table neura.assistant_messages enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    drop policy if exists assistant_kb_documents_select on neura.assistant_kb_documents;
    create policy assistant_kb_documents_select
      on neura.assistant_kb_documents for select
      to authenticated using (true);

    drop policy if exists assistant_kb_chunks_select on neura.assistant_kb_chunks;
    create policy assistant_kb_chunks_select
      on neura.assistant_kb_chunks for select
      to authenticated using (true);
  end if;
end
$$;

-- assistant_conversations / assistant_messages: sin políticas → solo service role.

-- ---------------------------------------------------------------------------
-- 5) RPC de búsqueda léxica con filtro por módulos del tenant y boost por
--    módulo de la pantalla actual.
-- ---------------------------------------------------------------------------
create or replace function neura.assistant_search_kb(
  p_query text,
  p_allowed_modules text[] default null,  -- null = sin filtro (super_admin)
  p_boost_module text default null,       -- módulo de la pantalla actual
  p_limit int default 8
)
returns table (
  chunk_id uuid,
  doc_slug text,
  doc_title text,
  module_slug text,
  heading text,
  content text,
  screenshot_paths text[],
  rank real
)
language sql
stable
as $$
  -- websearch_to_tsquery une los términos con AND: una pregunta natural
  -- ("¿cómo hago una nota de crédito?") exige que TODAS las palabras estén en el
  -- mismo chunk, y un verbo ausente del corpus ("hago") vacía el resultado.
  -- Estrategia: matchear con OR (tsq_or = el AND con sus '&' reemplazados por '|')
  -- para no perder recall, y rankear más alto los chunks que igual satisfacen el
  -- AND completo (precisión). Si la consulta queda vacía tras stopwords, tsq_or
  -- es null y no devuelve filas.
  with q as (
    select websearch_to_tsquery('spanish', p_query) as tsq_and
  ),
  qq as (
    select
      tsq_and,
      nullif(replace(tsq_and::text, '&', '|'), '')::tsquery as tsq_or
    from q
  )
  select
    c.id as chunk_id,
    d.slug as doc_slug,
    d.title as doc_title,
    c.module_slug,
    c.heading,
    c.content,
    c.screenshot_paths,
    (
      ts_rank(c.tsv, qq.tsq_or)
      * case
          when p_boost_module is not null and c.module_slug = p_boost_module then 1.5
          else 1.0
        end
      * case
          when qq.tsq_and is not null and c.tsv @@ qq.tsq_and then 1.5
          else 1.0
        end
    )::real as rank
  from neura.assistant_kb_chunks c
  join neura.assistant_kb_documents d on d.id = c.document_id
  cross join qq
  where qq.tsq_or is not null
    and c.tsv @@ qq.tsq_or
    and (
      p_allowed_modules is null
      or c.module_slug is null            -- docs transversales (faq, system-map)
      or c.module_slug = any (p_allowed_modules)
    )
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

comment on function neura.assistant_search_kb is
  'Asistente: retrieval léxico sobre el corpus con filtro por módulos habilitados del tenant.';

-- ---------------------------------------------------------------------------
-- 6) Grants para los roles de PostgREST (Supabase).
--    Si el schema no tiene "default privileges" para estos roles (p. ej. una
--    instancia self-hosted donde el schema se creó a mano), las tablas nuevas
--    quedan SIN permisos y PostgREST devuelve 42501 (permission denied) aunque
--    el schema esté expuesto. La RLS sigue aplicando por encima del grant.
--    Idempotente: `grant` no falla si el permiso ya existe.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema neura to service_role;
    grant all on neura.assistant_kb_documents to service_role;
    grant all on neura.assistant_kb_chunks to service_role;
    grant all on neura.assistant_conversations to service_role;
    grant all on neura.assistant_messages to service_role;
    grant execute on function neura.assistant_search_kb(text, text[], text, int) to service_role;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema neura to authenticated;
    grant select on neura.assistant_kb_documents to authenticated;
    grant select on neura.assistant_kb_chunks to authenticated;
    grant execute on function neura.assistant_search_kb(text, text[], text, int) to authenticated;
  end if;
end
$$;

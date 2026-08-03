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

-- Solo los GRANT para los roles de PostgREST sobre las tablas del asistente (schema neura).
-- Idempotente. Resuelve el error 42501 "permission denied for table assistant_kb_documents".
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

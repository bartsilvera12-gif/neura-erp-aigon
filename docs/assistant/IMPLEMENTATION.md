# Asistente de Ayuda — Estado de Implementación (Fase 1 MVP)

> Última actualización: junio 2026. Diseño de referencia: [architecture.md](./architecture.md).

## Qué está construido (código en el repo, NO desplegado)

| Pieza | Archivo | Estado |
|---|---|---|
| Migración BD (tablas + RPC de búsqueda) | `supabase/migrations/20260605120000_assistant_module.sql` | ✅ Escrita — **⚠️ NO aplicada** (requiere autorización) |
| Script de ingesta del corpus | `scripts/assistant-ingest.ts` (`npm run assistant:ingest`) | ✅ Escrito |
| Endpoint de chat (SSE streaming) | `src/app/api/assistant/chat/route.ts` | ✅ Escrito |
| Widget flotante | `src/components/assistant/AssistantWidget.tsx` | ✅ Escrito |
| Montaje en AppShell (gated por env) | `src/components/AppShell.tsx` | ✅ Aditivo, apagado por defecto |

## Decisiones de implementación

- **Tablas en `zentra_erp` con prefijo `assistant_`** (no en schema propio): evita tocar
  "Exposed schemas" de PostgREST en Supabase → cero cambios de infraestructura.
- **Retrieval léxico** (tsvector español + boost por módulo de la pantalla actual), sin
  embeddings en esta fase (decisión del propietario, jun 2026). La columna/índice vectorial
  queda para una fase futura si hace falta.
- **Modelo:** `claude-haiku-4-5` por defecto (override con `ASSISTANT_MODEL`), `max_tokens` 1024,
  system prompt con prompt caching. Diseño de costos en architecture.md.
- **Aislamiento multi-tenant:** corpus global sin datos de clientes; los módulos habilitados del
  tenant filtran el retrieval (RPC `assistant_search_kb`); conversaciones con `empresa_id` en
  tablas deny-by-default (solo service role).
- **Seguridad:** doble flag (`ASSISTANT_ENABLED` server + `NEXT_PUBLIC_ASSISTANT_ENABLED` cliente),
  cuota diaria por usuario (`ASSISTANT_DAILY_LIMIT`, default 50), validación de imagen ≤4 MB,
  system prompt endurecido contra prompt injection.

## Pasos para activar (TODOS requieren autorización del propietario)

1. **Aplicar la migración** (crea tablas y función; no toca nada existente). El schema destino
   debe ser el mismo que usa la app (`APP_DB_SCHEMA`; en la instancia dedicada es `neura`):
   - `npm run db:apply-assistant-module -- neura` (usa `SUPABASE_DB_URL` de `.env.local`), o
   - `node scripts/apply-assistant-module.cjs neura --print` para obtener el SQL y pegarlo en el
     SQL editor.
2. **Ingestar el corpus:** `npx tsx scripts/assistant-ingest.ts --schema=neura`
   (antes: agregar `--dry-run` para revisar).
3. **Variables de entorno** (Vercel / `.env.local`):
   - `ANTHROPIC_API_KEY` — clave de la API de Claude (crear en console.anthropic.com).
   - `ASSISTANT_ENABLED=1` — habilita el endpoint.
   - `NEXT_PUBLIC_ASSISTANT_ENABLED=1` — muestra el widget.
   - Opcionales: `ASSISTANT_MODEL` (default `claude-haiku-4-5`), `ASSISTANT_DAILY_LIMIT` (default 50).
4. **Deploy** y prueba con 1–2 empresas piloto.

Con los flags apagados (estado actual), el código es inerte: el widget no se monta y el
endpoint responde 404.

## Limitaciones conocidas del MVP

- El doc de Gastos está dentro de `compras.md` (módulo `compras`): un usuario con solo el módulo
  `gastos` no lo recupera. Fix simple: separar `gastos.md` o mapear el doc a varios módulos.
- El boost por pantalla usa `pathRequiresModuleSlug`: en `/notas-credito` devuelve
  `notas_credito` pero el doc de facturas está mapeado a `ventas` (no se aplica el boost; el
  filtro sí funciona porque `ventas` otorga `notas_credito`).
- Las capturas asociadas a cada chunk se devuelven como paths en `meta.sources` pero el widget
  aún no las muestra (requiere subirlas a Storage — fase 2).

## Pendientes / fase 2 (ver architecture.md §3.14)

- Subir screenshots del corpus a Storage y devolverlos en las respuestas (requiere primero
  regenerarlos desde un tenant demo sin PII — recommendations #2/#10).
- Feedback 👍/👎 y telemetría de uso.
- Módulo `asistente` en el catálogo (`modulos`) para rollout por empresa en vez de flag global.
- Embeddings (búsqueda semántica) si el retrieval léxico se queda corto.
- Cache de respuestas frecuentes.

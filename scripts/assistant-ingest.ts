/**
 * Ingesta del corpus del asistente: docs/assistant/*.md → zentra_erp.assistant_kb_*
 *
 * - Idempotente: si el hash del archivo no cambió, no toca el documento.
 * - Chunking por secciones de nivel 2 (## ...); FAQ además por pregunta (**...**).
 * - Extrae rutas de capturas (`screenshots/...png`) referenciadas en cada sección.
 *
 * Uso:   npx tsx scripts/assistant-ingest.ts                  (requiere SUPABASE_DB_URL en .env.local)
 *        npx tsx scripts/assistant-ingest.ts --schema=neura   (schema explícito; default: APP_DB_SCHEMA o zentra_erp)
 *        npx tsx scripts/assistant-ingest.ts --dry-run        (muestra qué haría, sin escribir)
 *        npx tsx scripts/assistant-ingest.ts --schema=neura --emit-sql=corpus.sql
 *                                                             (genera SQL para pegar en el SQL editor; no conecta a la BD)
 *
 * ⚠️ Requiere que la migración 20260605120000_assistant_module.sql esté aplicada
 *    en el mismo schema (ver scripts/apply-assistant-module.cjs).
 */
import { config as loadEnv } from "dotenv";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

loadEnv({ path: ".env.local", quiet: true });

const DOCS_DIR = path.join(process.cwd(), "docs", "assistant");
const DRY_RUN = process.argv.includes("--dry-run");

const schemaArg = process.argv.find((a) => a.startsWith("--schema="))?.slice("--schema=".length);
const SCHEMA = (schemaArg || process.env.APP_DB_SCHEMA || "zentra_erp").trim();
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(SCHEMA)) {
  console.error(`Schema inválido: "${SCHEMA}"`);
  process.exit(1);
}

const emitSqlArg = process.argv.find((a) => a.startsWith("--emit-sql"));
const EMIT_SQL_PATH = emitSqlArg
  ? emitSqlArg.includes("=")
    ? emitSqlArg.slice(emitSqlArg.indexOf("=") + 1)
    : "assistant-corpus.generated.sql"
  : null;

/** Literal SQL con dollar-quoting (evita problemas de escape con comillas). */
function sqlText(value: string): string {
  let tag = "$KB$";
  let i = 0;
  while (value.includes(tag)) tag = `$KB${++i}$`;
  return `${tag}${value}${tag}`;
}

function sqlTextOrNull(value: string | null): string {
  return value === null ? "null" : sqlText(value);
}

function sqlTextArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `array[${values.map((v) => sqlText(v)).join(", ")}]::text[]`;
}

/** slug del documento → módulo del ERP (null = transversal, visible para todos). */
const DOC_MODULE: Record<string, string | null> = {
  "system-map": null,
  faq: null,
  dashboard: "dashboard",
  clientes: "clientes",
  crm: "crm",
  inventario: "inventario",
  compras: "compras",
  ventas: "ventas",
  facturas: "ventas", // facturación/NC viven bajo el módulo ventas (incluye notas_credito)
  proyectos: "proyectos",
  agenda: "agenda",
  conversaciones: "conversaciones",
  whatsapp: "campanas",
  sorteos: "sorteos",
  configuracion: "configuracion",
};

/** Documentos internos que NO forman parte del corpus del usuario final. */
const EXCLUDED = new Set(["README", "architecture", "recommendations", "IMPLEMENTATION"]);

type Chunk = { heading: string | null; content: string; screenshots: string[]; sortOrder: number };

function extractScreenshots(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/`(screenshots\/[^`]+?\.png)`/g)) out.add(m[1]);
  return [...out];
}

/** Divide el markdown por encabezados `## `; el preámbulo (antes del primer ##) es un chunk propio. */
function chunkMarkdown(md: string, docTitle: string): Chunk[] {
  const lines = md.split(/\r?\n/);
  const chunks: Chunk[] = [];
  let heading: string | null = null;
  let buf: string[] = [];
  let order = 0;

  const flush = () => {
    const content = buf.join("\n").trim();
    if (content.length > 0) {
      chunks.push({
        heading: heading ? `${docTitle} › ${heading}` : docTitle,
        content,
        screenshots: extractScreenshots(content),
        sortOrder: order++,
      });
    }
    buf = [];
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flush();
      heading = h2[1].trim();
      continue;
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

function docTitleFromMarkdown(md: string, fallback: string): string {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : fallback;
}

async function main() {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url && !DRY_RUN && !EMIT_SQL_PATH) {
    console.error("Falta SUPABASE_DB_URL en .env.local (o usá --dry-run / --emit-sql)");
    process.exit(1);
  }

  console.log(`Schema destino: ${SCHEMA}${DRY_RUN ? " (dry-run)" : ""}`);

  let totalChunks = 0;

  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => !EXCLUDED.has(f.replace(/\.md$/, "")));

  // Modo emit-sql: genera un .sql con refresh completo del corpus (para SQL editor).
  if (EMIT_SQL_PATH) {
    const parts: string[] = [
      `-- Corpus del asistente — generado por scripts/assistant-ingest.ts (${files.length} documentos)`,
      `-- Refresh completo: borra el corpus anterior e inserta el actual. NO toca conversaciones.`,
      `begin;`,
      `delete from ${SCHEMA}.assistant_kb_chunks;`,
      `delete from ${SCHEMA}.assistant_kb_documents;`,
    ];
    for (const file of files) {
      const slug = file.replace(/\.md$/, "");
      const md = readFileSync(path.join(DOCS_DIR, file), "utf8");
      const hash = createHash("sha256").update(md).digest("hex");
      const title = docTitleFromMarkdown(md, slug);
      const moduleSlug = DOC_MODULE[slug] ?? null;
      const chunks = chunkMarkdown(md, title);
      totalChunks += chunks.length;
      const valuesRows = chunks
        .map(
          (c) =>
            `    (${sqlTextOrNull(moduleSlug)}, ${sqlTextOrNull(c.heading)}, ${sqlText(c.content)}, ${sqlTextArray(c.screenshots)}, ${c.sortOrder})`
        )
        .join(",\n");
      parts.push(
        `with d as (
  insert into ${SCHEMA}.assistant_kb_documents (slug, module_slug, title, source_path, content_hash)
  values (${sqlText(slug)}, ${sqlTextOrNull(moduleSlug)}, ${sqlText(title)}, ${sqlText(`docs/assistant/${file}`)}, ${sqlText(hash)})
  returning id
)
insert into ${SCHEMA}.assistant_kb_chunks (document_id, module_slug, heading, content, screenshot_paths, sort_order)
select d.id, x.module_slug, x.heading, x.content, x.screenshot_paths, x.sort_order
from d, (values
${valuesRows}
) as x(module_slug, heading, content, screenshot_paths, sort_order);`
      );
    }
    parts.push(`commit;`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(EMIT_SQL_PATH, parts.join("\n\n"), "utf8");
    console.log(
      `✓ SQL generado en ${EMIT_SQL_PATH} (${files.length} documentos, ${totalChunks} chunks). Pegalo en el SQL editor.`
    );
    return;
  }

  const client = DRY_RUN
    ? null
    : new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  if (client) await client.connect();

  try {
    for (const file of files) {
      const slug = file.replace(/\.md$/, "");
      const sourcePath = `docs/assistant/${file}`;
      const md = readFileSync(path.join(DOCS_DIR, file), "utf8");
      const hash = createHash("sha256").update(md).digest("hex");
      const title = docTitleFromMarkdown(md, slug);
      const moduleSlug = DOC_MODULE[slug] ?? null;
      const chunks = chunkMarkdown(md, title);
      totalChunks += chunks.length;

      if (DRY_RUN) {
        console.log(
          `[dry-run] ${slug} (módulo: ${moduleSlug ?? "—"}) → ${chunks.length} chunks: ` +
            chunks.map((c) => c.heading).join(" | ")
        );
        continue;
      }

      const existing = await client!.query(
        `select id, content_hash from ${SCHEMA}.assistant_kb_documents where slug = $1`,
        [slug]
      );
      if (existing.rows[0]?.content_hash === hash) {
        console.log(`= ${slug}: sin cambios (${chunks.length} chunks)`);
        continue;
      }

      await client!.query("begin");
      try {
        const doc = await client!.query(
          `insert into ${SCHEMA}.assistant_kb_documents (slug, module_slug, title, source_path, content_hash, updated_at)
           values ($1, $2, $3, $4, $5, now())
           on conflict (slug) do update
             set module_slug = excluded.module_slug,
                 title = excluded.title,
                 source_path = excluded.source_path,
                 content_hash = excluded.content_hash,
                 updated_at = now()
           returning id`,
          [slug, moduleSlug, title, sourcePath, hash]
        );
        const docId = doc.rows[0].id as string;
        await client!.query(
          `delete from ${SCHEMA}.assistant_kb_chunks where document_id = $1`,
          [docId]
        );
        for (const c of chunks) {
          await client!.query(
            `insert into ${SCHEMA}.assistant_kb_chunks
               (document_id, module_slug, heading, content, screenshot_paths, sort_order)
             values ($1, $2, $3, $4, $5, $6)`,
            [docId, moduleSlug, c.heading, c.content, c.screenshots, c.sortOrder]
          );
        }
        await client!.query("commit");
        console.log(`✓ ${slug}: ${chunks.length} chunks actualizados`);
      } catch (e) {
        await client!.query("rollback");
        throw e;
      }
    }
  } finally {
    if (client) await client.end();
  }

  console.log(`\nListo. ${files.length} documentos, ${totalChunks} chunks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

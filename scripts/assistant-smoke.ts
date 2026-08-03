/**
 * Smoke test del asistente: verifica ANTHROPIC_API_KEY y el modelo configurado
 * enviando una consulta de ejemplo con un fragmento de documentación real.
 * NO toca la base de datos ni requiere el ERP corriendo.
 *
 * Uso: npx tsx scripts/assistant-smoke.ts
 */
import Anthropic from "@anthropic-ai/sdk";
import { config as loadEnv } from "dotenv";
import { readFileSync } from "node:fs";
import path from "node:path";

loadEnv({ path: ".env.local" });

const MODEL = process.env.ASSISTANT_MODEL?.trim() || "claude-haiku-4-5";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("Falta ANTHROPIC_API_KEY en .env.local");
    process.exit(1);
  }

  // Fragmento real del corpus como contexto (simula el retrieval).
  const facturasDoc = readFileSync(
    path.join(process.cwd(), "docs", "assistant", "facturas.md"),
    "utf8"
  );

  const client = new Anthropic();
  console.log(`Modelo: ${MODEL}\nPregunta: "¿Cómo creo una nota de crédito?"\n---`);

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 1024,
    system:
      "Sos el asistente de ayuda del ERP Zentra. Respondé SOLO con la documentación provista, en español, conciso y con pasos numerados. Citá la fuente al final.",
    messages: [
      {
        role: "user",
        content: `<documentacion>\n${facturasDoc}\n</documentacion>\n\nPregunta del usuario: ¿Cómo creo una nota de crédito?`,
      },
    ],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }
  const final = await stream.finalMessage();
  console.log(
    `\n---\n✓ OK · stop: ${final.stop_reason} · tokens in/out: ${final.usage.input_tokens}/${final.usage.output_tokens}`
  );
}

main().catch((e) => {
  console.error("✗ Falló el smoke test:", e?.message ?? e);
  process.exit(1);
});

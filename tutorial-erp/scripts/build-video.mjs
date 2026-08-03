// Build video tutorial corto (~3 min) — sin audio, RENDERIZA RAPIDO (~1 min).
// Capturas estaticas con fade + overlays (titulo modulo + frase guion).
// Sin zoompan (Ken Burns) para que termine en segundos en vez de horas.
//
// Salida: tutorial-erp/videos/zentra-tutorial-corto.mp4 (1920x1080, 30fps, H.264)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const SHOTS = path.join(ROOT, "screenshots");
const VIDEOS = path.join(ROOT, "videos");
const TMP = path.join(VIDEOS, "_tmp");
fs.mkdirSync(TMP, { recursive: true });

// Fuentes locales (path relativo al CWD para evitar ':' del drive letter).
const FONT_BOLD = "tutorial-erp/scripts/arialbd.ttf";
const FONT_REG = "tutorial-erp/scripts/arial.ttf";

// Paleta Zentra
const TEAL = "0x4FAEB2";
const TEAL_DARK = "0x0F4D50";
const SLATE_900 = "0x0F172A";
const WHITE = "0xFFFFFF";

const SCENES = [
  [null, 5, "Zentra ERP", "Tu negocio en una sola pantalla"],
  ["00-bienvenida/00-login-pantalla.png", 7, "Ingreso", "Tu acceso al sistema"],
  ["01-dashboard/01-dashboard.png", 16, "Dashboard", "Resumen de tu negocio al instante"],
  ["02-proyectos/01-kanban.png", 16, "Proyectos", "Kanban con tus trabajos en curso"],
  ["02-proyectos/02-form-nuevo.png", 8, "Nuevo proyecto", "Lo creas en menos de un minuto"],
  ["02-proyectos/03-modal-resumen.png", 10, "Detalle del proyecto", "Tareas, comentarios, archivos y cambios"],
  ["03-agenda/01-calendario.png", 12, "Agenda", "Citas, llamadas y eventos del equipo"],
  ["04-clientes/01-listado.png", 12, "Clientes", "Tu base completa, con RUC validado"],
  ["06-conversaciones/01-inbox.png", 12, "Conversaciones", "WhatsApp e Instagram en un solo lugar"],
  ["07-inventario/01-productos.png", 10, "Inventario", "Stock y movimientos al dia"],
  ["08-compras/01-listado.png", 9, "Compras", "Compras y proveedores conectados al stock"],
  ["09-ventas/01-listado.png", 12, "Ventas", "Facturacion electronica SIFEN integrada"],
  ["10-reportes/01-comisiones.png", 10, "Reportes", "Comisiones automaticas y control de gastos"],
  ["11-marketing/01-campanas.png", 8, "Marketing", "Campanas masivas segmentadas"],
  ["13-configuracion/01-hub.png", 12, "Configuracion", "Tu ERP, a tu medida"],
  [null, 6, "Empeza con Zentra hoy", "Soporte desde el mismo sistema"],
];

const W = 1920;
const H = 1080;
const FPS = 30;

function esc(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/%/g, "\\%");
}

function overlayFilters(titulo, subtitulo) {
  const tEsc = esc(titulo);
  const sEsc = esc(subtitulo);
  const pillW = Math.max(260, titulo.length * 28 + 60);
  const barY = H - 180;

  return [
    // Pill arriba-izq con titulo del modulo
    `drawbox=x=70:y=70:w=${pillW}:h=78:color=${TEAL}@0.92:t=fill`,
    `drawtext=fontfile=${FONT_BOLD}:text='${tEsc}':fontcolor=${WHITE}:fontsize=44:x=100:y=92`,
    // Lower-third con frase del guion
    `drawbox=x=0:y=${barY}:w=${W}:h=110:color=${SLATE_900}@0.78:t=fill`,
    `drawbox=x=0:y=${barY}:w=8:h=110:color=${TEAL}:t=fill`,
    `drawtext=fontfile=${FONT_REG}:text='${sEsc}':fontcolor=${WHITE}:fontsize=36:x=100:y=${barY + 35}`,
    // Marca esquina inferior derecha
    `drawtext=fontfile=${FONT_BOLD}:text='ZENTRA':fontcolor=${TEAL}@0.85:fontsize=22:x=${W - 130}:y=${H - 50}`,
  ].join(",");
}

function fadeFilter(dur) {
  return `fade=t=in:st=0:d=0.4,fade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4`;
}

function buildClip(scene, idx) {
  const [img, dur, titulo, subtitulo] = scene;
  const out = path.join(TMP, `scene-${String(idx).padStart(2, "0")}.mp4`);

  let inputs, vfilter;

  if (img) {
    const abs = path.join(SHOTS, img);
    // Scale + pad: encajar 1536x900 (o 1536xN si es full-page) dentro de 1920x1080
    // con fondo teal oscuro y centrado.
    const baseScale = `scale=${W}:${H}:force_original_aspect_ratio=decrease`;
    const baseTone = `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${TEAL_DARK}`;
    inputs = ["-loop", "1", "-t", String(dur), "-i", abs];
    vfilter = `${baseScale},${baseTone},${overlayFilters(titulo, subtitulo)},${fadeFilter(dur)},format=yuv420p`;
  } else {
    const tEsc = esc(titulo);
    const sEsc = esc(subtitulo);
    inputs = ["-f", "lavfi", "-t", String(dur), "-i", `color=c=${TEAL}:s=${W}x${H}:r=${FPS}`];
    const centerY = Math.round(H / 2 - 80);
    vfilter =
      `drawbox=x=(${W}-560)/2:y=${centerY - 40}:w=560:h=8:color=${WHITE}@0.95:t=fill,` +
      `drawtext=fontfile=${FONT_BOLD}:text='${tEsc}':fontcolor=${WHITE}:fontsize=72:x=(w-text_w)/2:y=${centerY + 30},` +
      `drawtext=fontfile=${FONT_REG}:text='${sEsc}':fontcolor=${WHITE}@0.95:fontsize=34:x=(w-text_w)/2:y=${centerY + 130},` +
      `drawtext=fontfile=${FONT_BOLD}:text='ZENTRA ERP':fontcolor=${WHITE}@0.85:fontsize=20:x=(w-text_w)/2:y=${H - 80},` +
      `${fadeFilter(dur)},format=yuv420p`;
  }

  const args = [
    "-y",
    ...inputs,
    "-vf",
    vfilter,
    "-r",
    String(FPS),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-crf",
    "20",
    "-preset",
    "ultrafast",
    "-tune",
    "stillimage",
    "-an",
    out,
  ];
  const t0 = Date.now();
  process.stdout.write(`[${idx + 1}/${SCENES.length}] ${titulo} (${dur}s)… `);
  const res = spawnSync("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
  if (res.status !== 0) {
    console.error("\nffmpeg falló:\n", res.stderr?.toString().split("\n").slice(-25).join("\n"));
    process.exit(2);
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return out;
}

console.log("Generando escenas (sin Ken Burns, rapido)…\n");
const t0 = Date.now();
const clips = SCENES.map((s, i) => buildClip(s, i));

const listFile = path.join(TMP, "concat.txt");
fs.writeFileSync(
  listFile,
  clips.map((c) => `file '${c.replace(/\\/g, "/")}'`).join("\n")
);
const finalOut = path.join(VIDEOS, "zentra-tutorial-corto.mp4");
console.log("\nConcatenando…");
const concat = spawnSync(
  "ffmpeg",
  ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", finalOut],
  { stdio: ["ignore", "ignore", "pipe"] }
);
if (concat.status !== 0) {
  console.error("Concat falló:\n", concat.stderr?.toString());
  process.exit(3);
}

const totalDur = SCENES.reduce((a, [, d]) => a + d, 0);
const stat = fs.statSync(finalOut);
console.log(`\n✓ Listo: ${finalOut}`);
console.log(`  Duracion: ${totalDur}s (${Math.floor(totalDur / 60)}:${String(totalDur % 60).padStart(2, "0")})`);
console.log(`  Tamano: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`  Render total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);

if (process.env.KEEP_TMP !== "1") {
  fs.rmSync(TMP, { recursive: true, force: true });
}

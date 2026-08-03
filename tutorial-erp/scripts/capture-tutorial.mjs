// Captura visual para video tutorial — SOLO LECTURA.
// - Login con env TUTORIAL_EMAIL / TUTORIAL_PASSWORD.
// - Recorre rutas, hace screenshots full-page, sondea sidebar y graba un
//   video del Dashboard como demo.
// - NO hace click en acciones de mutación, NO envía formularios (excepto el
//   login), NO crea ni modifica datos.
// - Guarda capturas en tutorial-erp/screenshots/<modulo>/NN-nombre.png
//   y video en tutorial-erp/videos/dashboard-demo.webm
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT_SHOTS = path.join(ROOT, "screenshots");
const OUT_VIDEO = path.join(ROOT, "videos");

const BASE = "https://sistemas.neura.com.py";
const EMAIL = process.env.TUTORIAL_EMAIL;
const PASS = process.env.TUTORIAL_PASSWORD;
if (!EMAIL || !PASS) {
  console.error("Faltan TUTORIAL_EMAIL / TUTORIAL_PASSWORD");
  process.exit(1);
}

// Recorrido pensado para video tutorial — orden didáctico.
// [carpeta, archivo, ruta, esperaExtraMs]
const ROUTES = [
  ["00-bienvenida", "01-login", "/login", 600],
  ["01-dashboard", "01-dashboard", "/dashboard", 2200],
  ["02-proyectos", "01-kanban", "/dashboard/proyectos", 2500],
  ["02-proyectos", "02-form-nuevo", "/dashboard/proyectos/nuevo", 1200],
  ["03-agenda", "01-calendario", "/dashboard/agenda", 2000],
  ["04-clientes", "01-listado", "/clientes", 1500],
  ["04-clientes", "02-form-nuevo", "/clientes/nuevo", 1200],
  ["04-clientes", "03-gestion", "/gestion-clientes", 1500],
  ["05-crm", "01-pipeline", "/crm", 1800],
  ["06-conversaciones", "01-inbox", "/dashboard/conversaciones", 1800],
  ["06-conversaciones", "02-monitoreo", "/dashboard/monitoreo", 1500],
  ["07-inventario", "01-productos", "/inventario", 1500],
  ["07-inventario", "02-movimientos", "/inventario/movimientos", 1200],
  ["08-compras", "01-listado", "/compras", 1200],
  ["08-compras", "02-proveedores", "/proveedores", 1200],
  ["09-ventas", "01-listado", "/ventas", 1200],
  ["09-ventas", "02-pagos", "/pagos", 1200],
  ["10-reportes", "01-comisiones", "/comisiones", 1200],
  ["10-reportes", "02-gastos", "/gastos", 1200],
  ["11-marketing", "01-campanas", "/dashboard/campanas", 1500],
  ["12-usuarios", "01-listado", "/usuarios", 1200],
  ["13-configuracion", "01-hub", "/configuracion", 1500],
  ["13-configuracion", "02-proyectos", "/configuracion/proyectos", 1500],
  ["13-configuracion", "03-preferencias", "/configuracion/preferencias", 1200],
];

const report = [];

async function settle(page, extraMs = 1500) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 12000 });
  } catch {}
  await page.waitForTimeout(extraMs);
}

async function shot(page, folder, name) {
  const dir = path.join(OUT_SHOTS, folder);
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `${name}.png`);
  await page.screenshot({ path: fp, fullPage: true });
  return fp;
}

async function probeAccess(page) {
  // Heurística: si tras navegar quedamos en /login o vemos "Sin acceso" / 403,
  // marcamos la ruta como no accesible.
  const url = page.url();
  if (/\/login(\?|$)/.test(url)) return { ok: false, reason: "redirect-login" };
  const body = await page.locator("body").innerText().catch(() => "");
  if (/sin acceso|no tien[ée]s? acceso|403|forbidden/i.test(body)) {
    return { ok: false, reason: "no-acceso" };
  }
  return { ok: true };
}

async function captureSidebar(page, folder, name) {
  // Intenta capturar el sidebar como elemento aislado.
  const dir = path.join(OUT_SHOTS, folder);
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, `${name}.png`);
  // Heurística: <aside>, <nav> dentro de un sidebar, o data-role.
  const candidates = ["aside", "nav[aria-label*=side i]", "[data-sidebar]", ".sidebar"];
  for (const sel of candidates) {
    const el = await page.locator(sel).first();
    if (await el.count()) {
      try {
        await el.screenshot({ path: fp });
        return fp;
      } catch {}
    }
  }
  return null;
}

fs.mkdirSync(OUT_SHOTS, { recursive: true });
fs.mkdirSync(OUT_VIDEO, { recursive: true });

const browser = await chromium.launch({ headless: true });

// Contexto SIN video (para el grueso) — más rápido.
const ctx = await browser.newContext({
  viewport: { width: 1536, height: 900 },
  locale: "es-PY",
});
const page = await ctx.newPage();
page.setDefaultTimeout(20000);

// ---- 1) Login ----
console.log("Login…");
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await settle(page, 800);
await shot(page, "00-bienvenida", "00-login-pantalla");

// Inputs reales (fix anti-autofill): name=zentra-login-id / zentra-login-secret.
const emailInput = page.locator('input[name="zentra-login-id"]').first();
const passInput = page.locator('input[name="zentra-login-secret"]').first();
await emailInput.fill(EMAIL);
await passInput.fill(PASS);
await shot(page, "00-bienvenida", "00-login-completado");

await Promise.all([
  page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {}),
  page.locator('button[type=submit], button:has-text("Ingresar"), button:has-text("Iniciar")').first().click(),
]);
await settle(page, 2500);

if (/\/login/.test(page.url())) {
  console.error("Login falló — sigue en /login. Aborto.");
  await browser.close();
  process.exit(2);
}

// Captura del sidebar como pieza separada (útil para el video).
await captureSidebar(page, "00-bienvenida", "01-sidebar");

// ---- 2) Recorrido screenshots ----
for (const [folder, name, route, extra] of ROUTES) {
  const url = `${BASE}${route}`;
  console.log(`→ ${route}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
  } catch (e) {
    report.push({ route, ok: false, reason: `goto-fail: ${e.message?.slice(0, 80)}` });
    continue;
  }
  await settle(page, extra);
  const access = await probeAccess(page);
  if (!access.ok) {
    report.push({ route, ok: false, reason: access.reason });
    // Aún así capturamos para que se vea cuál es el módulo bloqueado.
    await shot(page, folder, `${name}-BLOQUEADO`);
    continue;
  }
  const fp = await shot(page, folder, name);
  report.push({ route, ok: true, file: path.relative(ROOT, fp) });
}

// ---- 3) Foco en Proyectos: capturar el modal "Cambios" si hay alguno entregado ----
try {
  await page.goto(`${BASE}/dashboard/proyectos`, { waitUntil: "domcontentloaded" });
  await settle(page, 2200);
  // Click sobre la primera tarjeta del kanban.
  const firstCard = page.locator('button:has(div:has-text("Sin cliente")), button:has-text("Día")').first();
  const anyCard = page.locator(".touch-none button").first();
  if ((await anyCard.count()) > 0) {
    await anyCard.click().catch(() => {});
    await settle(page, 1500);
    await shot(page, "02-proyectos", "03-modal-resumen");
    // Tab Cambios
    const tabCambios = page.locator('button:has-text("Cambios")').first();
    if (await tabCambios.count()) {
      await tabCambios.click();
      await settle(page, 800);
      await shot(page, "02-proyectos", "04-modal-cambios");
    }
  }
} catch (e) {
  console.warn("Modal de proyecto no se pudo capturar:", e.message);
}

await ctx.close();

// ---- 4) Video Dashboard (contexto separado con recordVideo) ----
console.log("Grabando video del Dashboard…");
const ctxVid = await browser.newContext({
  viewport: { width: 1536, height: 900 },
  locale: "es-PY",
  recordVideo: { dir: OUT_VIDEO, size: { width: 1536, height: 900 } },
});
const pVid = await ctxVid.newPage();
pVid.setDefaultTimeout(20000);
await pVid.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await pVid.locator('input[name="zentra-login-id"]').first().fill(EMAIL);
await pVid.locator('input[name="zentra-login-secret"]').first().fill(PASS);
await pVid.locator('button[type=submit], button:has-text("Ingresar"), button:has-text("Iniciar")').first().click();
await pVid.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
await pVid.waitForTimeout(3000);
// Recorrido lento por dashboard + proyectos (didáctico)
await pVid.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await pVid.waitForTimeout(3500);
await pVid.mouse.wheel(0, 600);
await pVid.waitForTimeout(2000);
await pVid.mouse.wheel(0, -600);
await pVid.waitForTimeout(1500);
await pVid.goto(`${BASE}/dashboard/proyectos`, { waitUntil: "domcontentloaded" });
await pVid.waitForTimeout(4500);
await pVid.mouse.wheel(0, 400);
await pVid.waitForTimeout(2000);

await pVid.close();
const videoPath = await pVid.video()?.path();
await ctxVid.close();

if (videoPath) {
  const dst = path.join(OUT_VIDEO, "dashboard-demo.webm");
  try {
    fs.renameSync(videoPath, dst);
    console.log("Video:", dst);
  } catch (e) {
    console.warn("No se pudo renombrar el video:", e.message);
  }
}

await browser.close();

fs.writeFileSync(
  path.join(ROOT, "captura-report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)
);
console.log("Listo. Reporte en tutorial-erp/captura-report.json");
console.log("Resumen:", report.filter((r) => r.ok).length, "ok /", report.length, "total");

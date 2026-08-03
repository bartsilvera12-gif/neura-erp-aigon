/**
 * Renderiza un HTML local a PDF usando Playwright (Chromium).
 * Uso: node scripts/html-to-pdf.mjs <input.html> <output.pdf>
 */
import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("Uso: node scripts/html-to-pdf.mjs <input.html> <output.pdf>");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(pathToFileURL(path.resolve(inPath)).href, { waitUntil: "networkidle" });
await page.pdf({
  path: path.resolve(outPath),
  format: "A4",
  printBackground: true,
  margin: { top: "16mm", bottom: "16mm", left: "15mm", right: "15mm" },
});
await browser.close();
console.log(`✓ PDF generado: ${outPath}`);

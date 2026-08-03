// Disparador del cron de dispatch de campañas, pensado para ejecutarse DENTRO del
// contenedor como Scheduled Task de Coolify: `node scripts/cron-dispatch.mjs`.
// Se usa un archivo (en vez de `node -e "..."`) para evitar que el shell de la tarea
// interprete backticks/`${}` del one-liner. Golpea el endpoint local protegido por
// CRON_SECRET; el propio endpoint hace el trabajo y loguea el resultado.
const port = process.env.PORT || 3000;
const secret = process.env.CRON_SECRET || "";
const url = "http://127.0.0.1:" + port + "/api/cron/campanas-dispatch";

fetch(url, { method: "POST", headers: { authorization: "Bearer " + secret } })
  .then((r) => r.text())
  .then((t) => {
    console.log("[cron-dispatch] " + t);
  })
  .catch((e) => {
    console.error("[cron-dispatch] error: " + String(e));
    process.exit(1);
  });

/**
 * Wrapper de Firebase Admin para el dispatcher de notificaciones push (FCM).
 *
 * Carga perezosa: firebase-admin solo se inicializa cuando hay credenciales en el
 * entorno. Si faltan, devuelve `{ ok:false, reason:"config_missing", missing:[...] }`
 * y el dispatcher degrada de forma controlada (no rompe build ni deja la app caída).
 *
 * Credenciales aceptadas (en este orden):
 *   1) FIREBASE_SERVICE_ACCOUNT_JSON_BASE64  (service account JSON completo, base64)
 *   2) FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY
 *      (la private key puede venir con \n literales; se normalizan)
 *
 * NO imprime claves. NO commitear secretos.
 */
import type { Messaging } from "firebase-admin/messaging";

export type FcmMessagingResult =
  | { ok: true; messaging: Messaging }
  | { ok: false; reason: "config_missing"; missing: string[] }
  | { ok: false; reason: "init_error"; error: string };

type ServiceAccount = { projectId: string; clientEmail: string; privateKey: string };

let cachedMessaging: Messaging | null = null;

function resolveServiceAccount(): ServiceAccount | { missing: string[] } {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as Record<string, string>;
      const projectId = json.project_id;
      const clientEmail = json.client_email;
      const privateKey = json.private_key;
      if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
    } catch {
      /* json inválido → caemos a las variables sueltas */
    }
  }
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };

  const missing: string[] = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  return { missing: [...missing, "(o FIREBASE_SERVICE_ACCOUNT_JSON_BASE64)"] };
}

/** Devuelve el cliente de Messaging o un resultado de "config faltante" (sin lanzar). */
export async function getFcmMessaging(): Promise<FcmMessagingResult> {
  if (cachedMessaging) return { ok: true, messaging: cachedMessaging };
  const sa = resolveServiceAccount();
  if ("missing" in sa) return { ok: false, reason: "config_missing", missing: sa.missing };
  try {
    const { getApps, initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");
    const existing = getApps();
    const app =
      existing.length > 0
        ? existing[0]
        : initializeApp({
            credential: cert({
              projectId: sa.projectId,
              clientEmail: sa.clientEmail,
              privateKey: sa.privateKey,
            }),
          });
    cachedMessaging = getMessaging(app);
    return { ok: true, messaging: cachedMessaging };
  } catch (e) {
    return { ok: false, reason: "init_error", error: e instanceof Error ? e.message : String(e) };
  }
}

/** ¿Hay credenciales Firebase configuradas? (sin inicializar) */
export function firebaseConfigured(): boolean {
  const sa = resolveServiceAccount();
  return !("missing" in sa);
}

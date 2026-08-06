"use client";

import { useEffect } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Registro de push FCM cuando la app corre DENTRO de la APK (Capacitor nativo).
 *
 * En navegador/desktop es NO-OP total: chequea `Capacitor.isNativePlatform()` antes de
 * importar nada nativo, así que NO pide permisos ni afecta a usuarios web. Los imports
 * nativos son dinámicos (solo se cargan en el dispositivo).
 *
 * Flujo nativo:
 *  1) pide permiso de notificaciones;
 *  2) `register()` → evento `registration` con el token FCM;
 *  3) POST idempotente a /api/cc/agent/device-token (con la sesión del asesor logueado);
 *  4) al tocar la notificación (`pushNotificationActionPerformed`), navega a `data.route`
 *     (= /m/asesor/chat/[conversationId]).
 *
 * No toca backend/reglas de asignación/cron/Telegram. Solo registra presencia de dispositivo.
 */
export default function CapacitorPushRegister() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor?.isNativePlatform?.()) return; // web/desktop → nada

        const { PushNotifications } = await import("@capacitor/push-notifications");

        const regSub = await PushNotifications.addListener("registration", async (token) => {
          try {
            await fetchWithSupabaseSession("/api/cc/agent/device-token", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ fcm_token: token.value, platform: "android" }),
            });
          } catch {
            /* si falla, se reintenta en el próximo arranque de la app */
          }
        });

        const errSub = await PushNotifications.addListener("registrationError", () => {
          /* sin token → no rompe la app */
        });

        const tapSub = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action) => {
            const data = action?.notification?.data as { route?: string } | undefined;
            const route = data?.route;
            if (typeof route === "string" && route.startsWith("/")) {
              window.location.assign(route);
            }
          }
        );

        // App en PRIMER PLANO: Android no dibuja la notificación del sistema, se la entrega
        // a la app. La replicamos como notificación local para que suene igual que en
        // background. Si @capacitor/local-notifications no está instalado, el import falla
        // y se degrada en silencio (no rompe el registro de push).
        const fgSub = await PushNotifications.addListener(
          "pushNotificationReceived",
          async (notif) => {
            try {
              const { LocalNotifications } = await import("@capacitor/local-notifications");
              const perm = await LocalNotifications.checkPermissions();
              if (perm.display !== "granted") {
                const req = await LocalNotifications.requestPermissions();
                if (req.display !== "granted") return;
              }
              await LocalNotifications.schedule({
                notifications: [
                  {
                    // int32 acotado: el plugin exige id numérico y falla con valores grandes.
                    id: Math.floor(Math.random() * 2_000_000_000),
                    title: notif.title ?? "Nuevo mensaje",
                    body: notif.body ?? "",
                    sound: undefined, // usa el sonido por defecto del canal
                    extra: notif.data ?? {},
                  },
                ],
              });
            } catch {
              /* plugin ausente o permiso denegado → sin notificación en foreground */
            }
          }
        );

        const perm = await PushNotifications.checkPermissions();
        let granted = perm.receive === "granted";
        if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") {
          const req = await PushNotifications.requestPermissions();
          granted = req.receive === "granted";
        }
        if (granted && !cancelled) {
          await PushNotifications.register();
        }

        cleanup = () => {
          void regSub.remove();
          void errSub.remove();
          void tapSub.remove();
          void fgSub.remove();
        };
      } catch {
        /* entorno sin capa nativa → no-op */
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}

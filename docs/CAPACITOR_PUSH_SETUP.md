# Contact Center móvil — APK del asesor + Push (FCM)

Estado: backend + vistas web **implementados y deployados**. La APK Android y las
credenciales Firebase requieren pasos manuales (Android SDK / consola Firebase) que
**no se pueden hacer desde el entorno de build web**. Esta guía deja todo listo.

---

## 1. Qué ya quedó hecho (web/backend, en producción)

- **Vistas móviles** (mismo Next deployado, pantalla completa sin chrome del ERP):
  - `GET /m/asesor` — lista SOLO las conversaciones asignadas al asesor.
  - `GET /m/asesor/chat/[conversationId]` — chat: ver mensajes + responder (ventana 24 h).
- **APIs móviles seguras** (ownership en backend, estrictamente `assigned_agent_id = su agent`):
  - `GET /api/mobile/asesor/conversations`
  - `GET /api/mobile/asesor/conversations/[conversationId]` (403 si no es suya)
  - `POST /api/mobile/asesor/conversations/[conversationId]/send` (verifica ownership → delega en `/api/chat/send`: ventana 24 h + persistencia)
- **Registro de dispositivo:** `POST /api/cc/agent/device-token` (idempotente, UNIQUE empresa+token) y `POST /api/cc/agent/device-token/deactivate`.
- **Dispatcher FCM:** `GET|POST /api/cron/cc-notifications-dispatch` (CRON_SECRET, `dryRun=1`, degrada a `config_missing` si faltan credenciales, idempotente, desactiva tokens inválidos).
- **Firebase Admin** backend (`src/lib/cc/firebase-admin.ts`), carga perezosa por env.

---

## 2. Variables Firebase a cargar en Coolify (app neura-sistemas)

El dispatcher acepta **una** de estas dos formas (no commitear secretos):

**Opción A (recomendada):**
- `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64` = el JSON del service account (Firebase Console → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada), codificado en base64.

**Opción B (variables sueltas):**
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (con `\n` literales; el wrapper los normaliza)

> Mientras falten, `/api/cron/cc-notifications-dispatch` responde `config_missing` y deja los eventos `pending` (no se pierden). `dryRun=1` funciona igual sin credenciales.

`CRON_SECRET` ya existe en Coolify (compartido con otros crons) → el dispatcher ya queda autorizable.

---

## 3. Firebase Console (una vez)

1. Crear/elegir proyecto Firebase.
2. Agregar app **Android** con package `py.com.neura.erp`.
3. Descargar **`google-services.json`** → va en `android/app/google-services.json` (tras `cap add android`). **No** commitear si el repo lo trata como secreto.
4. Cloud Messaging queda habilitado por defecto.
5. Generar la clave de service account (paso 2, Opción A/B) para el backend.

---

## 4. Capacitor + APK (en una máquina con Android Studio / JDK 17 / Android SDK)

> En el entorno actual de build web NO hay JDK ni Android SDK, por eso esto se hace aparte.

```bash
# desde la raíz del repo
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/push-notifications

# capacitor.config.ts ya está en la raíz (appId py.com.neura.erp, server.url -> /m/asesor)
npx cap add android

# copiar google-services.json a android/app/google-services.json
# (Firebase Console → app Android)

npx cap sync android

# build APK debug
cd android
./gradlew assembleDebug
# salida: android/app/build/outputs/apk/debug/app-debug.apk
```

### Registro del token FCM en el arranque de la app
Agregar en el bootstrap del WebView (o en una capa JS inyectada) usando `@capacitor/push-notifications`:

```ts
import { PushNotifications } from "@capacitor/push-notifications";

export async function initPush() {
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return;
  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token) => {
    // token.value = FCM token → registrar en backend (sesión del asesor ya logueada)
    await fetch("https://sistemas.neura.com.py/api/cc/agent/device-token", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fcm_token: token.value, platform: "android", app_version: "1.0.0" }),
    });
  });

  // Tap en la notificación → abrir el chat correcto
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    const route = action.notification.data?.route || "/m/asesor";
    window.location.href = "https://sistemas.neura.com.py" + route;
  });
}
```

> Nota auth: el `POST /api/cc/agent/device-token` usa la sesión del asesor. En el WebView con
> `server.url` la sesión va por cookies (`credentials: "include"`). Si se usa token Bearer,
> enviar `Authorization` en su lugar.

---

## 5. Activar el envío de push (cuando Firebase esté cargado)

1. Cargar las variables Firebase en Coolify (sección 2) + redeploy.
2. Probar dispatcher en seco:
   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" \
     "https://sistemas.neura.com.py/api/cron/cc-notifications-dispatch?dryRun=1"
   ```
3. Programar el scheduled task en Coolify (cada ~1 min) apuntando a `/api/cron/cc-notifications-dispatch` con el Bearer. **(Hoy NO está programado.)**

---

## 6. Flujo completo esperado

1. Asesor instala la APK → inicia sesión (WebView del ERP).
2. App pide permiso de notificaciones → obtiene FCM token → `POST /api/cc/agent/device-token`.
3. Entra un lead nuevo asignado al asesor → la RPC `cc_assign_conversation` crea un
   `agent_notification_events` (`pending/fcm`).
4. El cron `cc-notifications-dispatch` lo toma → envía push con Firebase Admin → marca `sent`.
5. Asesor toca la notificación → abre `/m/asesor/chat/[conversationId]`.
6. Responde por el WhatsApp central (ventana 24 h respetada).

---

## 7. Pendiente de tu lado (manual)

- [ ] Crear proyecto/app Android en Firebase (package `py.com.neura.erp`).
- [ ] Cargar variables Firebase en Coolify (sección 2) + redeploy.
- [ ] Descargar `google-services.json` y ponerlo en `android/app/`.
- [ ] Correr Capacitor + build APK en una máquina con Android SDK (sección 4).
- [ ] Programar el cron del dispatcher cuando se valide el push (sección 5).

No se usa Telegram. Web Push/PWA no es el canal principal (el canal es FCM nativo en la APK).

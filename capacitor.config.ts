/**
 * Configuración Capacitor para la APK del asesor (Aigon ERP).
 *
 * Va como objeto plano (sin `import type { CapacitorConfig }`) a propósito: así este
 * archivo es TS válido SIN requerir @capacitor/cli en el build web. Cuando se prepare
 * el entorno nativo (ver docs/CAPACITOR_PUSH_SETUP.md) se instala Capacitor y, si se
 * quiere, se puede tipar con CapacitorConfig.
 *
 * Estrategia: la APK carga el ERP remoto (server.url) en un WebView Android; las rutas
 * /m/asesor viven en el mismo Next ya deployado (sistemas.neura.com.py). El plugin nativo
 * de Push Notifications registra el token FCM y lo envía a POST /api/cc/agent/device-token;
 * al tocar la notificación abre `data.route` (/m/asesor/chat/[conversationId]).
 *
 * package / app name según lo reservado: py.com.neura.aigon · "Aigon ERP".
 */
const config = {
  appId: "py.com.neura.aigon",
  appName: "Aigon ERP",
  // webDir es requerido por Capacitor; con server.url (remoto) casi no se usa.
  webDir: "public",
  server: {
    // La app abre el ERP completo (root) en el dominio deployado.
    url: "https://aigon.neura.com.py",
    cleartext: false,
    allowNavigation: ["aigon.neura.com.py", "*.neura.com.py"],
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

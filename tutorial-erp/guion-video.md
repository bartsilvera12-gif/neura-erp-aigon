# Tutorial Zentra ERP — Guion del video

> **Producción:** Neura · **Marca en pantalla:** Zentra ERP · **Color primario:** `#4FAEB2` (teal) · **Idioma:** Español rioplatense/paraguayo neutro.
> **Voz en off:** este proyecto NO incluye locución generada por IA. El guion está pensado para grabarse con voz real o pasarse por un servicio externo (ElevenLabs, Azure TTS).
> **Modo recomendado:** texto en pantalla + b‑roll de la app + música ambiente suave.
> **Captura fuente:** ver `tutorial-erp/screenshots/` y `tutorial-erp/videos/dashboard-demo.webm`.

---

## Título del video

**Versión corta (3 min):** _"Conocé Zentra ERP en 3 minutos"_

**Versión larga (15 min):** _"Cómo usar Zentra ERP — capacitación completa para tu equipo"_

---

## Tono y estilo

- **Tono:** cercano, profesional, sin tecnicismos. Explicá como si le hablaras a un dueño de PyME que recién compró el ERP.
- **Velocidad de lectura:** ~140 palabras por minuto (cómodo, no apurado).
- **Acento sugerido:** español neutro o paraguayo suave (tu mercado principal).
- **Música:** instrumental lo-fi corporativa, volumen al 15-20%. Sugerencias: Epidemic Sound "Soft Corporate" o YouTube Audio Library.
- **Cursor en pantalla:** que se vea siempre, con un círculo amarillo o highlight tipo "Spotlight" para que el espectador siga la acción.

---

## Introducción común (ambas versiones)

| Tiempo | Voz en off / texto en pantalla | En pantalla |
|---|---|---|
| 0:00 – 0:05 | _Logo Zentra animado + fade in._ | Logo Zentra centrado sobre fondo teal `#4FAEB2`. |
| 0:05 – 0:15 | "Bienvenido a Zentra, el ERP que une ventas, proyectos, clientes y operaciones en un solo lugar." | Cortes rápidos de 4-5 pantallas (Dashboard → Proyectos Kanban → Clientes → Conversaciones). 1 seg cada una. |
| 0:15 – 0:25 | "En este video vas a ver lo esencial para empezar a usar el sistema desde el primer día." | Texto en pantalla: **"Tutorial de uso · Edición 2026"** |

**Screenshots usadas:**
`00-bienvenida/00-login-pantalla.png`, `01-dashboard/01-dashboard.png`, `02-proyectos/01-kanban.png`, `04-clientes/01-listado.png`, `06-conversaciones/01-inbox.png`

---

## Sección 1 — Ingreso al sistema (Login)

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 0:25 – 0:40 | "Para entrar usás el correo y la contraseña que te dio tu administrador. Si te olvidaste la clave, hacé clic en 'Olvidé mi contraseña'." | "Tu acceso a Zentra" | Pantalla de login completa con campos vacíos. |

**Screenshot principal:** `00-bienvenida/00-login-pantalla.png`

**Recomendación de edición:** zoom suave (Ken Burns) sobre los campos email/contraseña. NO mostrar credenciales reales — pixelar/blurear el contenido si quedó algo escrito.

---

## Sección 2 — Dashboard (Inicio)

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 0:40 – 1:10 | "Esta es la pantalla de inicio. Acá ves el resumen de tu negocio: cantidad de clientes activos, ventas del mes, pagos pendientes y los proyectos en curso." | "Tu negocio en una sola pantalla" | Dashboard con tarjetas resumen y gráficos. Cursor hace un pase suave de izquierda a derecha. |
| 1:10 – 1:25 | "Desde el menú de la izquierda accedés a todos los módulos. Vamos a recorrerlos uno por uno." | _(sin texto)_ | Highlight animado sobre el sidebar (subrayado teal). |

**Screenshots:** `01-dashboard/01-dashboard.png`, `00-bienvenida/01-sidebar.png` (si se generó)

**Recomendación:** usá un círculo amarillo semitransparente para marcar el sidebar. **Bluereá los nombres reales** de clientes/proyectos si aparecen en las tarjetas resumen.

---

## Sección 3 — Proyectos (módulo destacado)

> Este es el módulo más maduro del sistema. Dale tiempo: **45 segundos en la versión corta, 2 minutos en la larga.**

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 1:25 – 1:35 | "El módulo de Proyectos te permite ver el avance de cada trabajo en tiempo real, en formato Kanban." | "Kanban de Proyectos" | `02-proyectos/01-kanban.png` |
| 1:35 – 1:50 | "Cada columna es un estado: nuevo, en diseño, enviado al cliente, entregado. Arrastrás la tarjeta entre columnas para avanzar el proyecto." | _(sin texto)_ | Animar un drag de tarjeta entre columnas (filmar in-situ o simular con After Effects). |
| 1:50 – 2:05 | "Para crear un proyecto nuevo, tocás el botón Nuevo proyecto arriba a la derecha y completás los datos del cliente." | "Crear proyecto en 30 segundos" | `02-proyectos/02-form-nuevo.png` |
| 2:05 – 2:25 _(solo versión larga)_ | "Al abrir un proyecto ves todo su detalle: resumen, datos del cliente, tareas, comentarios, archivos, y los cambios post-entrega que se te incluyen gratis." | "Tres cambios gratis dentro de los 30 días desde la entrega" | `02-proyectos/03-modal-resumen.png` (mostrar tabs del modal). |
| 2:25 – 2:35 _(solo versión larga)_ | "Cuando un proyecto pasa a Entregado, aparece un contador de 30 días en la tarjeta. Es el período en el que el cliente puede pedir hasta tres cambios sin costo." | "Día 1 / 30" | Captura del Kanban con la tarjeta entregada (filmar después de mover). |

**Screenshots:** `02-proyectos/01-kanban.png`, `02-proyectos/02-form-nuevo.png`, `02-proyectos/03-modal-resumen.png`

**Recomendación de edición:** highlight animado sobre el badge "Día N/30" en la tarjeta. Animar el cambio de columna con `slide-right` 600ms.

---

## Sección 4 — Agenda

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 2:35 – 2:50 | "En Agenda anotás citas, visitas, llamadas o cualquier evento del equipo. Tiene vista de día, semana, mes y listado." | "Agenda de citas" | `03-agenda/01-calendario.png` |

**Recomendación:** quitá los nombres/títulos reales con un overlay teal o un blur sutil sobre los eventos.

---

## Sección 5 — Clientes

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 2:50 – 3:05 | "Acá vive toda tu base de clientes con su RUC, contacto y conversaciones." | "Tu base de clientes" | `04-clientes/01-listado.png` |
| 3:05 – 3:20 _(versión larga)_ | "Para agregar un cliente nuevo apretás el botón Nuevo y cargás los datos. El sistema valida automáticamente el RUC contra SIFEN." | "Alta rápida con validación SIFEN" | `04-clientes/02-form-nuevo.png` |
| 3:20 – 3:35 _(versión larga)_ | "Desde 'Gestión de clientes' tenés una vista táctica con filtros, etiquetas y acciones masivas." | _(sin texto)_ | `04-clientes/03-gestion.png` |

**Recomendación crítica:** la lista de clientes tiene datos reales. **Aplicá blur generalizado** sobre las columnas Nombre, RUC, WhatsApp y Email.

---

## Sección 6 — Conversaciones (Omnicanal)

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 3:35 – 3:55 | "Si usás WhatsApp, Instagram o Messenger, todos los mensajes entran a una sola bandeja. Acá tu equipo responde, asigna conversaciones y deja notas internas." | "Inbox unificado" | `06-conversaciones/01-inbox.png` |
| 3:55 – 4:10 _(versión larga)_ | "Desde 'Monitoreo' los supervisores ven en vivo qué agente está atendiendo, cuántos chats lleva y los tiempos de respuesta." | "Supervisión en vivo" | `06-conversaciones/02-monitoreo.png` |

**Recomendación:** los chats contienen mensajes reales. **Blureá completo** las burbujas de mensaje y nombres de contactos.

---

## Sección 7 — Inventario

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 4:10 – 4:25 | "Inventario te muestra cada producto, su stock y precio. Filtrás por categoría o ubicación." | "Stock al día" | `07-inventario/01-productos.png` |
| 4:25 – 4:40 _(versión larga)_ | "En Movimientos quedan registradas todas las entradas y salidas, con motivo y usuario responsable." | _(sin texto)_ | `07-inventario/02-movimientos.png` |

---

## Sección 8 — Compras y Proveedores

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 4:40 – 4:55 | "Cada vez que comprás mercadería o un servicio, lo registrás acá. Queda asociado al proveedor y suma stock automáticamente." | "Compras y proveedores" | `08-compras/01-listado.png` |
| 4:55 – 5:05 _(versión larga)_ | "Tu lista de proveedores con sus categorías y datos fiscales." | _(sin texto)_ | `08-compras/02-proveedores.png` |

---

## Sección 9 — Ventas y Pagos

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 5:05 – 5:25 | "El corazón del ERP: Ventas. Acá emitís facturas electrónicas SIFEN, registrás cobros y seguís pendientes." | "Facturación SIFEN integrada" | `09-ventas/01-listado.png` |
| 5:25 – 5:40 _(versión larga)_ | "Cada pago se vincula a su factura. Ves el saldo del cliente en un par de clics." | _(sin texto)_ | `09-ventas/02-pagos.png` |

---

## Sección 10 — Reportes (Comisiones / Gastos)

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 5:40 – 6:00 | "El módulo de Comisiones calcula automáticamente cuánto le toca a cada vendedor según las reglas que vos configurás." | "Comisiones automáticas" | `10-reportes/01-comisiones.png` |
| 6:00 – 6:15 _(versión larga)_ | "Y en Gastos registrás los egresos del negocio: alquileres, sueldos, servicios. Sumás todo y ves la rentabilidad real." | "Control de gastos" | `10-reportes/02-gastos.png` |

---

## Sección 11 — Marketing

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 6:15 – 6:35 _(versión larga)_ | "Desde Campañas mandás mensajes masivos a tus clientes por WhatsApp o email, segmentando por etiquetas." | "Campañas multi-canal" | `11-marketing/01-campanas.png` |

---

## Sección 12 — Usuarios

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 6:35 – 6:50 | "Cada miembro del equipo tiene su propio usuario, con permisos según su rol: admin, vendedor, atención al cliente." | "Permisos por rol" | `12-usuarios/01-listado.png` |

**Recomendación:** blureá los nombres/emails reales de los usuarios.

---

## Sección 13 — Configuración

| Tiempo | Voz en off | Texto en pantalla | En pantalla |
|---|---|---|---|
| 6:50 – 7:10 | "Toda la personalización vive en Configuración: facturación electrónica, canales de chat, estados del Kanban de proyectos, preferencias visuales." | "Tu ERP, a tu medida" | `13-configuracion/01-hub.png` |
| 7:10 – 7:25 _(versión larga)_ | "Por ejemplo, podés crear columnas nuevas para tu Kanban de proyectos o cambiarles el color." | _(sin texto)_ | `13-configuracion/02-proyectos.png` |
| 7:25 – 7:35 _(versión larga)_ | "Y desde Preferencias ajustás zona horaria, idioma y notificaciones." | _(sin texto)_ | `13-configuracion/03-preferencias.png` |

---

## Cierre

| Tiempo | Voz en off | Texto en pantalla |
|---|---|---|
| 7:35 – 7:50 | "Eso fue Zentra ERP. Si tenés dudas, escribinos por WhatsApp o entrá al chat de soporte dentro del mismo sistema." | "Soporte: +595 XXX XXX XXX" |
| 7:50 – 8:00 | "Gracias por elegirnos." | Logo Zentra animado + fade out. |

---

## Módulos pendientes de capturar

| Módulo | Estado | Acción |
|---|---|---|
| CRM (`/crm`) | **Bloqueado para este tester** — sin acceso. | Habilitar el módulo al usuario tester y volver a correr `tutorial-erp/scripts/capture-tutorial.mjs`. |

---

## Recomendaciones generales de edición

1. **Resolución de export:** 1920×1080 a 30 fps. Las capturas son full-page a 1536×900, ampliá con un zoom suave (Ken Burns) para evitar bordes negros.
2. **Tipografía en pantalla:** Inter o Geist (ambas neutrales y modernas). Tamaño mínimo 32 pt para títulos.
3. **Paleta:**
   - Fondo de títulos: `#0F172A` (slate-900)
   - Texto principal: `#FFFFFF`
   - Acento: `#4FAEB2` (teal Zentra)
   - Subrayados/cursor highlight: `#FACC15` (amarillo)
4. **Animaciones de tarjetas:** entrada `fade-up` 400ms, salida `fade-down` 300ms.
5. **Transiciones entre secciones:** corte limpio (cut) o crossfade de 200 ms. NUNCA usar wipes ni efectos pesados.
6. **PII a blurear (lista de control):**
   - Nombres y apellidos de clientes en listados.
   - RUCs y CIs.
   - Números de teléfono / WhatsApp.
   - Emails con dominio.
   - Direcciones de calle.
   - Montos específicos (opcional, conviene blurear si son ventas reales identificables).
   - Burbujas de chat en Conversaciones.
7. **Subtítulos:** generar `.srt` desde el guion. Se pueden quemar en el video o dejarlos como pista opcional.
8. **Música:** un único track de fondo para todo el video, sin cortes. Bajar volumen automáticamente cuando habla la voz (sidechain compression al 30%).
9. **Logo/intro/outro:** 5 segundos cada uno, máximo. La gente cierra videos largos.
10. **Versión web:** export adicional en 1080×1080 (cuadrado) para LinkedIn / Instagram feed, recortando el centro de cada captura.

---

## Archivos de captura disponibles (auto-generados)

Ver árbol completo en `tutorial-erp/screenshots/`. Resumen:

```
00-bienvenida/   → login
01-dashboard/    → home
02-proyectos/    → kanban, form nuevo, modal detalle
03-agenda/       → calendario
04-clientes/     → listado, form nuevo, gestión
05-crm/          → BLOQUEADO (sin acceso para tester actual)
06-conversaciones/ → inbox, monitoreo
07-inventario/   → productos, movimientos
08-compras/      → listado, proveedores
09-ventas/       → listado, pagos
10-reportes/     → comisiones, gastos
11-marketing/    → campañas
12-usuarios/     → listado
13-configuracion/ → hub, proyectos, preferencias
```

Video demo (raw, sin edición): `tutorial-erp/videos/dashboard-demo.webm` (~2.2 MB, ~20 segundos).

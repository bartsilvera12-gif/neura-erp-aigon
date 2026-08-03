# Plan de grabación — Tutorial Zentra ERP

> Documento operativo para el productor / camarógrafo / editor.
> Trabaja en conjunto con `guion-video.md`.

---

## Pre-producción (checklist antes de grabar)

- [ ] Cambiar la contraseña del usuario tester (`alanayalapsn@gmail.com`) — actualmente débil.
- [ ] **Crear o solicitar un tenant DEMO** con datos ficticios. Sin esto, todas las capturas requieren blureo manual.
- [ ] Habilitar para el tester los módulos que hoy están bloqueados (CRM, según el reporte).
- [ ] Cargar al menos: 5 clientes ficticios, 8 proyectos en distintos estados (incluyendo 1 en "Entregado" hace 3 días para que se vea el badge "Día 3/30"), 3 productos, 2 facturas demo.
- [ ] Validar que la URL de producción es estable y no hay mantenimiento programado durante la grabación.
- [ ] Resolución de pantalla: 1920×1080. Zoom navegador: 100%. Modo: claro (no oscuro).
- [ ] Cerrar todas las notificaciones del sistema operativo y del navegador.
- [ ] Tener listo el archivo de música seleccionada en formato `.mp3` o `.wav`.
- [ ] Tener listo el logo Zentra animado (intro + outro) si existe; si no, generar con After Effects o usar el SVG estático con fade.

---

## Decisión de versiones

Dos cortes finales del mismo material:

| | **Corta (3 min)** | **Larga (15 min)** |
|---|---|---|
| Audiencia | Cliente nuevo, lead caliente, redes sociales. | Capacitación interna, onboarding equipo. |
| Profundidad | Solo el "qué hace" cada módulo. | "Qué hace" + "cómo se usa" + casos típicos. |
| Música | Ambiente discreto. | Misma música, más espacio para que respire. |
| Subtítulos | Quemados en el video. | Pista `.srt` opcional. |
| Formato | 16:9 + 1:1 (recortado) para social. | Solo 16:9. |

---

## Plan por módulo — duración estimada y acción en pantalla

| # | Sección | Versión corta | Versión larga | Acción en pantalla | Capturas (referencia) |
|---|---|---|---|---|---|
| 0 | Intro / logo | 0:15 | 0:25 | Logo animado + cortes rápidos de 4 pantallas. | varias |
| 1 | Login | 0:15 | 0:20 | Pantalla de login, cursor al campo email. | `00-bienvenida/00-login-pantalla.png` |
| 2 | Dashboard | 0:25 | 0:50 | Pase de cursor por tarjetas resumen, scroll suave. | `01-dashboard/01-dashboard.png` + clip `dashboard-demo.webm` |
| 3 | **Proyectos** (módulo estrella) | 0:45 | 2:00 | Kanban → drag de tarjeta entre columnas → click en tarjeta → tabs del modal → badge "Día N/30". | `02-proyectos/*` |
| 4 | Agenda | 0:15 | 0:30 | Vista calendario, click rápido en un día. | `03-agenda/01-calendario.png` |
| 5 | Clientes | 0:20 | 0:50 | Listado → botón "Nuevo" → form abierto. | `04-clientes/*` |
| 6 | Conversaciones | 0:25 | 0:55 | Inbox → click en chat → vista monitoreo. | `06-conversaciones/*` |
| 7 | Inventario | 0:15 | 0:40 | Productos → movimientos. | `07-inventario/*` |
| 8 | Compras + Proveedores | 0:15 | 0:40 | Listado compras → lista proveedores. | `08-compras/*` |
| 9 | Ventas + Pagos | 0:25 | 1:00 | Listado ventas → factura abierta → pagos. | `09-ventas/*` |
| 10 | Reportes | 0:15 | 0:50 | Comisiones → gastos. | `10-reportes/*` |
| 11 | Marketing | 0:00 | 0:30 | Solo versión larga: pantalla campañas. | `11-marketing/01-campanas.png` |
| 12 | Usuarios | 0:15 | 0:30 | Listado usuarios + rol. | `12-usuarios/01-listado.png` |
| 13 | Configuración | 0:20 | 1:00 | Hub configuración → estados kanban editables → preferencias. | `13-configuracion/*` |
| C | Cierre | 0:15 | 0:30 | Logo + datos de soporte. | — |
| **TOTAL** | | **~3:30** | **~14:30** | | |

> Si la corta queda en 3:30 y necesitás 2:30 estrictos, **eliminá:** sección 8 (Compras), 11 (Marketing), y reducí Configuración a "se puede personalizar todo desde acá".

---

## Texto del narrador — por sección

> Pega este texto en tu DAW o en tu pantalla de teleprompter. Cada bloque ≈ 1 minuto = 140 palabras. Pausas marcadas con `[.]`.

### Intro común
> "Bienvenido a Zentra [.] el ERP que une ventas [.] proyectos [.] clientes y operaciones en un solo lugar. En este video vas a ver lo esencial para empezar a usar el sistema desde el primer día."

### Login
> "Para entrar usás el correo y la contraseña que te dio tu administrador. Si te olvidaste la clave [.] hacé clic en 'Olvidé mi contraseña' y seguí los pasos."

### Dashboard
> "Esta es la pantalla de inicio. Acá ves el resumen de tu negocio [.] cantidad de clientes activos [.] ventas del mes [.] pagos pendientes [.] y los proyectos en curso. Todo de un vistazo. Desde el menú de la izquierda accedés a cada módulo del sistema."

### Proyectos — versión corta
> "El módulo de Proyectos te permite ver el avance de cada trabajo en formato Kanban. Cada columna es un estado: nuevo [.] en diseño [.] enviado al cliente [.] entregado. Arrastrás las tarjetas entre columnas y el sistema registra todo automáticamente."

### Proyectos — versión larga (añade lo siguiente)
> "Al abrir un proyecto ves todo su detalle [.] resumen [.] datos del cliente [.] tareas [.] comentarios [.] archivos [.] y los cambios post-entrega. Cuando un proyecto pasa a 'Entregado' [.] aparece un contador de 30 días en la tarjeta. Es el período en el que el cliente puede pedirte hasta tres cambios sin costo."

### Agenda
> "En Agenda anotás citas [.] visitas [.] llamadas [.] o cualquier evento del equipo. Tiene vista de día [.] semana [.] mes y listado [.] para que cada quien la use como le acomode."

### Clientes
> "Acá vive toda tu base de clientes [.] con su RUC [.] contacto y conversaciones. El sistema valida automáticamente el RUC contra SIFEN al cargar uno nuevo."

### Conversaciones
> "Si usás WhatsApp [.] Instagram o Messenger [.] todos los mensajes entran a una sola bandeja. Tu equipo responde [.] asigna conversaciones y deja notas internas. Desde Monitoreo los supervisores ven en vivo qué agente atiende [.] cuántos chats lleva [.] y los tiempos de respuesta."

### Inventario
> "Inventario te muestra cada producto [.] su stock y precio. Filtrás por categoría o ubicación. En Movimientos quedan registradas todas las entradas y salidas [.] con motivo y usuario responsable."

### Compras + Proveedores
> "Cada vez que comprás mercadería o un servicio [.] lo registrás acá. Queda asociado al proveedor y suma stock automáticamente."

### Ventas + Pagos
> "El corazón del ERP: Ventas. Acá emitís facturas electrónicas SIFEN [.] registrás cobros y seguís pendientes. Cada pago se vincula a su factura y ves el saldo del cliente en un par de clics."

### Reportes
> "El módulo de Comisiones calcula automáticamente cuánto le toca a cada vendedor [.] según las reglas que vos configurás. Y en Gastos registrás los egresos del negocio [.] sumás todo y ves la rentabilidad real."

### Marketing
> "Desde Campañas mandás mensajes masivos a tus clientes por WhatsApp o email [.] segmentando por etiquetas."

### Usuarios
> "Cada miembro del equipo tiene su propio usuario [.] con permisos según su rol [.] admin [.] vendedor [.] atención al cliente."

### Configuración
> "Toda la personalización vive en Configuración [.] facturación electrónica [.] canales de chat [.] estados del Kanban de proyectos [.] preferencias visuales. Tu ERP [.] a tu medida."

### Cierre
> "Eso fue Zentra ERP. Si tenés dudas [.] escribinos por WhatsApp o entrá al chat de soporte dentro del mismo sistema. Gracias por elegirnos."

---

## Indicaciones de cámara / pantalla por sección

| Sección | Movimiento | Velocidad |
|---|---|---|
| Intro | Cortes rápidos | 1 seg por pantalla |
| Login | Estática + zoom suave 105% | Ken Burns 4 seg |
| Dashboard | Pan horizontal de izq→der + scroll vertical lento | Pan 3 seg, scroll 4 seg |
| Proyectos Kanban | Pan horizontal por columnas + zoom en una tarjeta + drag&drop | Pan 4 seg, zoom 2 seg |
| Modal proyecto | Click tabs en secuencia, 1 seg cada uno | 5 seg total |
| Agenda | Click en distintas vistas (día/semana/mes) | 1 seg cada una |
| Clientes lista | Scroll lento + zoom en una fila | 5 seg |
| Conversaciones | Click chat → vista monitoreo | Cambio cada 3 seg |
| Inventario / Compras / Ventas | Estática + zoom donde hay datos | 4 seg cada captura |
| Reportes | Highlight sobre los totales | 3 seg cada uno |
| Configuración | Tour rápido por las cards del hub | 4 seg |
| Cierre | Zoom out del logo | 3 seg |

---

## Audio — pistas a montar

| Pista | Contenido | Volumen |
|---|---|---|
| 1. Voz en off | Narración limpia, mono, 48 kHz, 24-bit. | 0 dB (referencia) |
| 2. Música ambiente | Track instrumental, loop continuo. | −18 dB cuando habla voz, −10 dB en transiciones. |
| 3. SFX (opcional) | Click sutil cuando se abre el modal, "swoosh" en transición de sección. | −22 dB |
| 4. Sidechain | Compressor en pista de música, sidechain desde pista de voz. | Ratio 4:1, threshold −24 dB |

---

## Comandos `ffmpeg` listos para usar

> Reemplazá `audio-narration.mp3` y `music.mp3` con tus archivos reales.

### A) Concatenar capturas como video (sin movimiento)

Cada captura 4 segundos, transición fade de 200 ms:

```bash
# Generar una lista
printf "file '%s'\nduration 4\n" tutorial-erp/screenshots/00-bienvenida/00-login-pantalla.png tutorial-erp/screenshots/01-dashboard/01-dashboard.png tutorial-erp/screenshots/02-proyectos/01-kanban.png > tutorial-erp/_concat.txt
# Última imagen repetida sin duration (truco de ffmpeg)
printf "file '%s'\n" tutorial-erp/screenshots/02-proyectos/01-kanban.png >> tutorial-erp/_concat.txt

ffmpeg -y -f concat -safe 0 -i tutorial-erp/_concat.txt -vf "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p" -c:v libx264 -crf 18 -preset slow tutorial-erp/videos/_slideshow.mp4
```

### B) Aplicar Ken Burns (zoom suave) sobre una captura

```bash
ffmpeg -y -loop 1 -t 5 -i tutorial-erp/screenshots/01-dashboard/01-dashboard.png \
  -vf "scale=2400:-1,zoompan=z='min(zoom+0.0015,1.2)':d=125:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080,format=yuv420p" \
  -c:v libx264 -crf 18 -preset slow tutorial-erp/videos/_dashboard-kenburns.mp4
```

### C) Concatenar varios clips MP4 (intro + secciones + outro)

```bash
# Crear lista
cat > tutorial-erp/_chapters.txt <<'EOF'
file 'videos/_intro.mp4'
file 'videos/_dashboard-kenburns.mp4'
file 'videos/_proyectos.mp4'
file 'videos/_outro.mp4'
EOF

ffmpeg -y -f concat -safe 0 -i tutorial-erp/_chapters.txt -c copy tutorial-erp/videos/_master-mute.mp4
```

### D) Mezclar voz + música (con sidechain ducking)

```bash
ffmpeg -y -i tutorial-erp/audio/voice.mp3 -i tutorial-erp/audio/music.mp3 \
  -filter_complex "[1:a]volume=0.35[mus]; [mus][0:a]sidechaincompress=threshold=0.05:ratio=4:attack=20:release=300[mix]" \
  -map "[mix]" -c:a aac -b:a 192k tutorial-erp/audio/_mix.m4a
```

### E) Combinar video + audio final

```bash
ffmpeg -y -i tutorial-erp/videos/_master-mute.mp4 -i tutorial-erp/audio/_mix.m4a \
  -c:v copy -c:a copy -shortest tutorial-erp/videos/zentra-tutorial-FINAL.mp4
```

### F) Quemar subtítulos (versión corta para redes)

Generá `subs.srt` desde el guion (1 línea por bloque del narrador). Luego:

```bash
ffmpeg -y -i tutorial-erp/videos/zentra-tutorial-FINAL.mp4 \
  -vf "subtitles=tutorial-erp/audio/subs.srt:force_style='Fontname=Inter,Fontsize=22,PrimaryColour=&HFFFFFF&,OutlineColour=&H0F172A&,BorderStyle=3,MarginV=80'" \
  -c:a copy tutorial-erp/videos/zentra-tutorial-FINAL-subs.mp4
```

### G) Export cuadrado 1:1 para LinkedIn / IG

```bash
ffmpeg -y -i tutorial-erp/videos/zentra-tutorial-FINAL.mp4 \
  -vf "crop=ih:ih,scale=1080:1080" -c:v libx264 -crf 20 -preset slow -c:a copy \
  tutorial-erp/videos/zentra-tutorial-square.mp4
```

### H) Blureo masivo sobre una zona fija (helper)

Si tenés que ocultar PII en una región específica (ej. la primera columna de la tabla de clientes, x=100, y=200, ancho 300, alto 400):

```bash
ffmpeg -y -i tutorial-erp/videos/clientes.mp4 \
  -vf "boxblur=10:enable='between(t,5,12)':x=100:y=200:w=300:h=400" \
  -c:a copy tutorial-erp/videos/clientes-blureado.mp4
```

> Para blurear una zona variable (cursor moviéndose, scroll), conviene hacerlo en el editor (Premiere/DaVinci/CapCut) con "Mosaic / Pixelate" tracking.

---

## Lista final de entregables esperados

```
tutorial-erp/
├── guion-video.md
├── plan-grabacion.md            ← este archivo
├── captura-report.json
├── scripts/
│   └── capture-tutorial.mjs
├── screenshots/                 ← 22 capturas full-page (1536×900)
│   ├── 00-bienvenida/
│   ├── 01-dashboard/
│   ├── 02-proyectos/
│   ├── ...
│   └── 13-configuracion/
└── videos/
    └── dashboard-demo.webm      ← clip raw (~20 seg)
```

**Por agregar tras la grabación final:**
```
tutorial-erp/videos/
├── zentra-tutorial-corta-3min.mp4
├── zentra-tutorial-larga-15min.mp4
├── zentra-tutorial-square.mp4        ← para LinkedIn/IG
└── subs/
    ├── subs-corta.srt
    └── subs-larga.srt
```

---

## Identidad visual Zentra (extraída del código)

| Elemento | Valor |
|---|---|
| Color primario | `#4FAEB2` (teal) |
| Color primario hover | `#3F8E91` |
| Sombra primaria | `rgba(79,174,178,0.10-0.20)` |
| Fondo claro | `#FFFFFF`, `slate-50` (`#F8FAFC`) |
| Texto principal | `slate-900` (`#0F172A`) |
| Texto secundario | `slate-500` (`#64748B`) |
| Bordes | `slate-200` (`#E2E8F0`) |
| Acentos | Sky / Amber / Rose / Emerald (Tailwind 500) según prioridad/estado |
| Tipografía web | Inter (sistema) |
| Radius cards | `rounded-2xl` (16 px) |
| Radius botones | `rounded-xl` (12 px) |

Estos valores deben respetarse en cualquier overlay, lower-third o tarjeta animada que se sobreponga al video.

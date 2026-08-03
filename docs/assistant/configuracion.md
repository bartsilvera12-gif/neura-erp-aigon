# Configuración

## Objetivo

Centralizar la parametrización de la empresa: datos de facturación, facturación electrónica
SIFEN, canales de WhatsApp, colas y equipos de atención, CRM, comisiones, proyectos, métricas y
preferencias.

## Explicación funcional

| Ruta | Sección | Qué se configura |
|---|---|---|
| `/configuracion` | Hub | Accesos a todas las secciones |
| `/configuracion/facturacion` | Facturación | Prefijo y secuencia de facturas, días de vencimiento, modo (contado/crédito) |
| `/configuracion/facturacion-electronica` | SIFEN | Ambiente (test/producción), RUC, razón social, timbrado y fecha de inicio, establecimiento, punto de expedición, CSC, **certificado digital** (archivo + contraseña), actividad económica, logo del KuDE |
| `/configuracion/canales` | Canales | Números de WhatsApp conectados (Meta/YCloud), tokens, respuestas rápidas por canal |
| `/configuracion/colas` | Colas | Colas de atención: prioridad, SLA, agentes asignados, taxonomía de motivos de cierre |
| `/configuracion/omnicanal-equipos` | Equipos | Equipos de agentes y supervisores |
| `/configuracion/omnicanal-horarios` | Horarios | Horarios de trabajo de agentes, pausas, zona horaria |
| `/configuracion/conversaciones` | Omnicanal | Redirige a Canales (alias) |
| `/configuracion/crm` | CRM | Etapas del funnel y su orden |
| `/configuracion/comisiones` | Comisiones | Políticas: base de cálculo (pago registrado / factura emitida / factura pagada), escalas por tramos, equipos |
| `/configuracion/proyectos` | Proyectos | Tipos de proyecto, estados (color, orden, SLA), prioridades |
| `/configuracion/metricas` | Métricas | Metas comerciales/financieras |
| `/configuracion/politicas` | Políticas | Políticas de negocio (descuentos, retención) |
| `/configuracion/preferencias` | Preferencias | Moneda base, formatos, zona horaria |
| `/configuracion/vistas-dashboard` y `/configuracion/tableros` | Dashboard | Qué vistas/KPIs ve cada rol |

## Casos de uso

- Onboarding de una empresa nueva: cargar datos fiscales, subir certificado SIFEN en ambiente
  test, conectar el número de WhatsApp, crear las colas de atención.
- Cambio de timbrado: actualizar el timbrado y su fecha de inicio antes de seguir facturando.
- Reestructura del equipo de atención: nuevas colas, reasignar agentes, ajustar horarios.

## Flujos paso a paso

### Configurar facturación electrónica (SIFEN)
1. `Configuración → Facturación electrónica`.
2. Completar RUC, razón social, timbrado (y fecha de inicio), establecimiento y punto de expedición.
3. Subir el **certificado digital** (.p12) con su contraseña (se guarda cifrada) y el CSC.
4. Elegir ambiente **test** para probar; pasar a **producción** cuando las pruebas aprueben.

### Conectar un canal de WhatsApp
1. `Configuración → Canales → Nuevo`.
2. Elegir proveedor (Meta Cloud API / YCloud) y cargar identificadores y token.
3. Vincular el canal a una o más colas de atención.

### Crear una cola de atención
1. `Configuración → Colas → Nueva`.
2. Definir nombre, prioridad y SLA objetivo.
3. Asignar agentes y configurar la taxonomía de cierres.

## Preguntas frecuentes

- **¿Quién puede entrar a Configuración?** Usuarios con el módulo `configuracion` (típicamente
  administradores de la empresa).
- **¿Dónde activo/desactivo módulos?** Los módulos por empresa los gestiona el **super admin**
  (panel Admin → Empresas); el admin de empresa puede asignar módulos a sus usuarios en
  `/usuarios`.
- **¿El certificado SIFEN está seguro?** Se almacena con la contraseña cifrada en el servidor.
- **¿Puedo probar la facturación sin impacto fiscal?** Sí, con ambiente SIFEN `test`.

## Errores comunes

- *Certificado inválido o vencido:* SIFEN rechaza la firma; renovar el certificado.
- *Timbrado vencido / fecha de inicio incorrecta:* la SET rechaza los documentos.
- *Canal sin token válido:* los mensajes dejan de entrar/salir; regenerar el token.

## Capturas relacionadas

- `screenshots/configuracion/01-hub.png` — hub de configuración.
- `screenshots/configuracion/02-facturacion.png` — facturación.
- `screenshots/configuracion/03-facturacion-electronica.png` — SIFEN.
- `screenshots/configuracion/04-canales.png` — canales.
- `screenshots/configuracion/05-colas.png` — colas.
- `screenshots/configuracion/07-crm.png` — etapas CRM.
- `screenshots/configuracion/08-comisiones.png` — comisiones.
- `screenshots/configuracion/09-proyectos.png` — proyectos.
- `screenshots/configuracion/10-preferencias.png` — preferencias.
- `screenshots/configuracion/11-omnicanal-equipos.png` — equipos.
- `screenshots/configuracion/12-omnicanal-horarios.png` — horarios.
- `screenshots/usuarios/01-listado.png`, `screenshots/usuarios/02-form-nuevo-usuario.png`,
  `screenshots/usuarios/03-detalle-usuario.png` — usuarios (el detalle es modal: datos
  personales, laborales y accesos del sistema).
- `screenshots/planes/01-listado.png`, `screenshots/planes/02-form-nuevo-plan.png`,
  `screenshots/planes/03-detalle-plan.png` — planes (detalle modal: plan de marketing con
  generación automática de tareas de contenido, límites del plan).
- `screenshots/comisiones/01-resumen.png` — módulo comisiones.

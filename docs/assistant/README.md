# Documentación para el Asistente de Ayuda — Neura/Zentra ERP

> **Propósito:** Esta carpeta contiene la base de conocimiento funcional del ERP, generada durante la
> auditoría de junio 2026. Está pensada para dos audiencias:
>
> 1. **Humanos** (equipo de producto, soporte, onboarding de clientes).
> 2. **El futuro asistente de ayuda basado en Claude** (corpus fuente para RAG).

---

## Contenido

| Archivo | Contenido |
|---|---|
| [system-map.md](./system-map.md) | Mapa funcional del ERP: módulos, navegación, relaciones, permisos |
| [dashboard.md](./dashboard.md) | Dashboard principal y KPIs |
| [clientes.md](./clientes.md) | Clientes y Gestión de Clientes (cobranzas) |
| [crm.md](./crm.md) | CRM Funnel (pipeline de prospectos) |
| [inventario.md](./inventario.md) | Productos, stock, movimientos, categorías, depósitos |
| [compras.md](./compras.md) | Compras, proveedores y gastos |
| [ventas.md](./ventas.md) | Ventas / nueva venta |
| [facturas.md](./facturas.md) | Facturación, facturación electrónica SIFEN y notas de crédito |
| [proyectos.md](./proyectos.md) | Proyectos (Kanban, tareas, SLA) |
| [agenda.md](./agenda.md) | Agenda de citas |
| [conversaciones.md](./conversaciones.md) | Omnicanal: inbox, monitoreo, colas, flujos (bots) |
| [whatsapp.md](./whatsapp.md) | WhatsApp: canales, campañas, plantillas, webhooks |
| [sorteos.md](./sorteos.md) | Sorteos: entradas, cupones, revendedores, OCR |
| [configuracion.md](./configuracion.md) | Configuración: empresa, SIFEN, canales, colas, preferencias |
| [faq.md](./faq.md) | Preguntas frecuentes transversales |
| [architecture.md](./architecture.md) | **Propuesta técnica del asistente IA** (RAG multi-tenant + Claude) |
| [recommendations.md](./recommendations.md) | Problemas detectados durante la auditoría (NO implementados) |
| `screenshots/` | Capturas reales del sistema, organizadas por módulo |

---

## Cómo se generó esta documentación

- **Auditoría de código** del repositorio (rutas, APIs, migraciones, lógica de módulos).
- **Auditoría visual** del sistema en producción (`sistemas.neura.com.py`) con un usuario tester,
  en modo **estrictamente solo-lectura**: navegación por URL y capturas de pantalla.
  No se envió ningún formulario ni se creó/modificó ningún dato.

### Limitación conocida de la auditoría visual

El usuario tester utilizado **no tiene habilitados todos los módulos** en su empresa. Los módulos
**Inventario, Compras/Proveedores, Ventas, Sorteos y Marketing (legacy y Ops)** redirigen al
dashboard para este usuario, por lo que sus capturas no pudieron generarse. La documentación
funcional de esos módulos se basa en la auditoría de código (que es exhaustiva).

> **Decisión del propietario (jun 2026):** la auditoría visual se da por completa con los
> módulos actualmente habilitados a este usuario. Las capturas de los módulos restantes se
> generarán cuando se habiliten (o desde un tenant demo).

---

## Convenciones para el corpus RAG

Cada documento de módulo sigue la misma estructura, pensada para "chunking" semántico:

1. **Objetivo** — qué resuelve el módulo.
2. **Explicación funcional** — pantallas y conceptos.
3. **Casos de uso** — situaciones reales del usuario.
4. **Flujos paso a paso** — instrucciones operativas.
5. **Preguntas frecuentes** — Q&A listo para retrieval.
6. **Errores comunes** — mensajes y causas.
7. **Capturas relacionadas** — paths relativos a `screenshots/`.

> **Importante:** esta documentación describe la funcionalidad **base** del producto. Cada empresa
> (tenant) ve solo los módulos habilitados en su plan, por lo que el asistente debe filtrar las
> respuestas según los módulos activos del tenant del usuario que pregunta.

# Recomendaciones y Hallazgos de la Auditoría

> **Ninguno de estos puntos fue implementado ni modificado.** Solo se documentan para decisión
> del equipo. Auditoría: junio 2026 (código + navegación en producción con usuario tester).

| # | Hallazgo | Impacto | Riesgo | Recomendación | Prioridad |
|---|---|---|---|---|---|
| 1 | **El usuario tester no tiene todos los módulos habilitados** (Inventario, Compras, Proveedores, Ventas, Sorteos, Marketing legacy/Ops, Etiquetas redirigen al dashboard) | La auditoría visual y las capturas de esos módulos quedaron incompletas; el futuro corpus del asistente no tendrá screenshots de ellos | Bajo (operativo) | Habilitar todos los módulos a la empresa del tester (o crear un **tenant demo** completo con datos ficticios) y re-ejecutar la captura. *Decisión del propietario: la auditoría se cierra con los módulos actuales; lo demás quedará para cuando se habiliten.* | Alta |
| 2 | **Los screenshots capturados contienen datos reales de producción** (nombres, teléfonos, montos del tenant del tester) | Si se usan tal cual en el corpus del asistente o en documentación pública, exponen PII | Medio | Antes de ingestar al asistente: regenerar las capturas desde un tenant demo con datos ficticios, o anonimizar | Alta |
| 3 | **Contraseña del usuario tester extremadamente débil (numérica trivial) en un sistema productivo con datos reales** | Cualquiera que conozca el email puede entrar | Alto | Rotar la contraseña; aplicar política de contraseñas mínima en creación/reset de usuarios. *Decisión del propietario: la rotación se hará más adelante, cuando él lo indique.* | **Crítica** |
| 4 | **Persistencia en localStorage en módulos operativos** (Ventas, Compras, Proveedores según auditoría de código) | Datos no centralizados: se pierden al cambiar de navegador/equipo, no participan de RLS ni de reportes server-side | Medio-Alto | Completar la migración a Supabase planificada para esos módulos antes de apoyar el asistente (o cualquier reporte) en ellos | Alta |
| 5 | **Rutas duplicadas de Sorteos** (`/sorteos/*` y `/dashboard/sorteos/*` duplican pantallas) | Mantenimiento doble, riesgo de divergencia de comportamiento | Bajo | Unificar en una sola jerarquía y dejar redirects | Media |
| 6 | **`docs/` y `DOCUMENTACION_TECNICA.md` parcialmente desactualizados** (p. ej. DOCUMENTACION_TECNICA no menciona Omnicanal, Sorteos, Proyectos, Agenda, Comisiones, SIFEN) | Confusión para nuevos desarrolladores; mal insumo para RAG | Bajo | Actualizar o marcar como histórico; usar `docs/assistant/` como fuente funcional viva | Media |
| 7 | **El Inbox quedó en "Cargando…" durante la captura** (lista de chats demoró >12 s con red estable) | Posible lentitud percibida en la carga inicial del inbox | Bajo-Medio | Revisar la consulta inicial del inbox (paginación/índices) y agregar skeleton más informativo | Media |
| 8 | **Doble convención de naming de slugs de módulos** (`notas_credito`, `marketing_ops` con guion bajo vs `gestion-clientes`, `historial-omnicanal` con guion) | Propenso a bugs en mapeos ruta↔módulo | Bajo | Normalizar a una sola convención con aliases de compatibilidad | Baja |
| 9 | **RLS resuelve la empresa por email del JWT** (`empresa_id_actual()` busca `usuarios` por email) | Si un email se reasigna o se duplica entre tenants, el mapeo puede ser ambiguo; ya existió un fix por case-sensitivity | Medio | Migrar el lookup a `auth_user_id` (ya existe la columna) como clave primaria de resolución, manteniendo email como fallback | Media |
| 10 | **Sin tenant demo / sandbox oficial** | Cada prueba (como esta auditoría) se hace contra datos reales de producción | Medio | Crear empresa demo permanente con seed de datos ficticios; útil para QA, ventas, onboarding y el corpus del asistente | Alta |
| 11 | **El módulo de Comisiones mostró su pantalla pero la empresa del tester no tiene política configurada** (pantalla vacía) | Estados vacíos sin guía pueden confundir | Bajo | Agregar empty-states con CTA ("Configurá tu primera política de comisiones") — patrón aplicable a varios módulos | Baja |
| 12 | **No existe aún módulo/flag `asistente` en el catálogo de módulos** | (Esperado — no implementado) | — | Cuando se autorice el asistente, agregarlo como módulo activable por empresa, reutilizando `empresa_modulos` para el rollout gradual | — |

## Notas

- Los hallazgos #1, #2, #3 y #10 son **prerequisitos prácticos** del proyecto de asistente
  (corpus limpio + acceso completo + seguridad del tester).
- Ningún hallazgo se corrigió en esta auditoría, conforme a la regla de no modificar
  funcionalidad existente.

# Aigon ERP

ERP construido con Next.js (App Router) + Supabase. Este proyecto es **independiente**:
comparte la funcionalidad del ERP original pero tiene su propio repositorio, su propia
base de datos (schema `aigonerp`), su propio deploy y su propio package Android.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abrir http://localhost:3000

## Base de datos

La aplicación no vive en `public`: todas las tablas están en un schema propio, definido
por la variable de entorno `APP_DB_SCHEMA`. Para este proyecto el schema es **`aigonerp`**.

Para crear el schema desde cero (estructura completa, sin datos), ejecutar en el
SQL Editor de Supabase:

- [`supabase/aigonerp_clone_schema.sql`](supabase/aigonerp_clone_schema.sql)

Ese script crea `aigonerp` clonando la estructura de `odontoexcell`: tablas, tipos,
secuencias, PK/FK/CHECK/UNIQUE, índices, triggers, RLS + policies, vistas, funciones
RPC, grants y membresía de realtime. **No copia ninguna fila.**

Para rehacerlo desde cero:

```sql
DROP SCHEMA IF EXISTS aigonerp CASCADE;
```

Después de crear el schema hay que exponerlo en PostgREST (`supabase/config.toml` ya lo
lista en `[api].schemas` y `extra_search_path` para el entorno local; en self-hosted,
agregar `aigonerp` a `PGRST_DB_SCHEMAS` y reiniciar el contenedor `rest`).

## Variables de entorno

Como mínimo:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_DB_SCHEMA=aigonerp
```

El resto de las integraciones (SIFEN, WhatsApp/omnicanal, asistente, push) están
documentadas en [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md) y en [`docs/`](docs).

## App móvil (Capacitor)

`capacitor.config.ts` usa `appId` **`py.com.neura.aigon`** y `appName` **Aigon ERP**, para
que la APK conviva sin colisionar con la del ERP original. `server.url` todavía apunta al
host del ERP original: cambiarlo al dominio donde se deploye este proyecto antes de
generar la APK. Ver [`MOBILE_BUILD.md`](MOBILE_BUILD.md).

## Documentación

- [`DOCUMENTACION_TECNICA.md`](DOCUMENTACION_TECNICA.md) — arquitectura y módulos
- [`docs/`](docs) — guías por integración
- [`supabase/migrations/`](supabase/migrations) — historial de migraciones heredado
- [`tutorial-erp/`](tutorial-erp) — material de uso

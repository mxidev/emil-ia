# Repository Guidelines

## Project Overview

Emil-IA es un MVP de asistente académico para matemáticas e ingeniería. Es un monorepo npm con `apps/web` (Angular 20 y `AppModule`), `apps/api` (Node.js 24/Fastify), `packages/contracts` (Zod), `services/sandbox` (FastAPI) y `docker-compose.yml` (PostgreSQL/sandbox).

## Architecture Rules

En la API, `routes/` valida y delega; `services/` coordina; `repositories/` accede a datos; `database/queries.ts` contiene el SQL; `provider.ts` adapta modelos; y `server.ts` compone dependencias. Las rutas y servicios no deben contener SQL.

En Angular, los componentes presentan estado y delegan HTTP, SSE, persistencia y exportación a `services/`. El estado coordinado del chat vive en `ChatStateService`. Los componentes no standalone deben registrarse en `AppModule`.

Mantener TypeScript estricto, límites tipados, validación Zod y separación del sandbox. No exponer credenciales ni conexiones de base de datos al frontend.

## Local Development and Validation

Requiere Node.js 24+, npm 11+, Podman 5+ y `podman-compose`:

```powershell
Copy-Item .env.example .env
podman machine start
podman-compose up -d postgres sandbox
npm run dev
npm run dev:web
```

Puertos: web `4200`, API `3000`, PostgreSQL `5432`, sandbox `8001`. No commitear `.env`, API keys ni secretos.

Antes de un commit, ejecutar las comprobaciones proporcionales y `git diff --check`:

```powershell
npm run typecheck --workspace @emil-ia/api
npm run test --workspace @emil-ia/api
npm run typecheck --workspace @emil-ia/web
npm run test --workspace @emil-ia/web
npm run build --workspace @emil-ia/web
```

## Git and Code Conventions

- Crear commits atómicos con mensajes en inglés, imperativos y descriptivos, por ejemplo `Add PDF conversation export`.
- Separar funcionalidad, tests, formato y documentación; aplicar Prettier y `git diff --check`.
- Mantener rutas y componentes delgados: validar, presentar y delegar.
- No usar `git reset --hard`, `git checkout --` ni operaciones destructivas sobre cambios locales.

## Current Capabilities

El MVP ya incluye streaming SSE, proveedores mock/OpenCode Go, perfiles, routing académico, persistencia, historial, memoria aislada por conversación, Markdown/LaTeX, exportación, feedback, analítica, sandbox Python y adjuntos PDF con extracción, almacenamiento y eliminación. Sin `OPENCODE_API_KEY` u `OPENCODE_MODEL`, se usa `MockProvider`.

## Backlog

1. Operar OpenCode Go con métricas de coste, latencia, errores, límites y calidad.
2. Ampliar tests de integración para adjuntos, proveedor, memoria y sandbox.
3. Preparar cloud/Supabase, autenticación, autorización, backups y secretos.
4. Completar accesibilidad, responsive, estados vacíos, errores y regresiones Markdown/LaTeX.
5. Medir calidad, coste y consistencia antes de RAG, agentes complejos o fallbacks de pago.

Imágenes y OCR permanecen fuera de alcance hasta consolidar el flujo PDF. Cada hito conserva la separación por capas y una validación proporcional.

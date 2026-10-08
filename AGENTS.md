# Emil-IA — Guía para sesiones de desarrollo

## Propósito

Emil-IA es un MVP de asistente académico para matemáticas e ingeniería. Ofrece chat con streaming, Markdown/LaTeX, historial persistente, exportación, feedback, analítica y un sandbox Python aislado para cálculos verificables.

El documento original de arquitectura está en `Arquitectura_Asistente_IA_Ingenieria_v2.pdf`.

## Estructura del repositorio

Este proyecto es un monorepo npm con workspaces:

- `apps/web`: Angular 20 con componentes declarados en `AppModule` (no standalone).
- `apps/api`: Node.js 24, TypeScript y Fastify.
- `packages/contracts`: esquemas Zod y contratos compartidos.
- `services/sandbox`: FastAPI con SymPy, NumPy, SciPy y Matplotlib.
- `docker-compose.yml`: PostgreSQL y sandbox para desarrollo local.

### Backend

La API sigue esta separación:

- `database/`: conexión PostgreSQL, esquema inicial y constantes SQL.
- `interfaces/`: interfaces internas de persistencia y dominio.
- `repositories/`: acceso a datos. El SQL no debe escribirse en rutas o servicios.
- `routes/`: definición y validación de endpoints por dominio.
- `services/`: lógica de aplicación y orquestación.
- `provider.ts`: abstracción `AIProvider` y adaptadores de modelos.
- `router.ts`: clasificación inicial de intención y perfil.
- `server.ts`: composición de dependencias y arranque; debe mantenerse pequeño.

No colocar consultas SQL directamente en rutas, servicios o componentes. Añadirlas a `apps/api/src/database/queries.ts` y ejecutarlas desde un repositorio.

### Frontend

Angular usa módulos tradicionales. Todos los componentes deben declarar `standalone: false` y registrarse en `AppModule`.

- `app/components/`: componentes con archivos `.ts`, `.html` y `.css` separados.
- `app/interfaces/`: interfaces y tipos del frontend.
- `app/services/`: acceso a endpoints, estado y lógica reutilizable.
- `app/constants/`: configuración compartida, como la URL base de la API.

Los componentes no deben contener URLs, consultas HTTP, parsing SSE, persistencia ni lógica de exportación. Deben delegar esas tareas a servicios Angular. El estado coordinado del chat vive en `ChatStateService`.

## Entorno local

Requisitos actuales:

- Node.js 24 o superior.
- npm 11 o superior.
- Podman 5 o superior.
- `podman-compose` disponible en el `PATH`.

Configuración local:

1. Copiar `.env.example` a `.env` si no existe.
2. Iniciar la máquina de Podman: `podman machine start`.
3. Iniciar servicios: `podman-compose up -d postgres sandbox`.
4. Iniciar API: `npm run dev`.
5. Iniciar Angular en otra terminal: `npm run dev:web`.

Puertos:

- Angular: `http://localhost:4200`.
- API: `http://localhost:3000`.
- PostgreSQL: `localhost:5432`.
- Sandbox: `http://localhost:8001`.

Credenciales locales de PostgreSQL:

- Base de datos: `emilia`.
- Usuario: `emilia`.
- Contraseña: `emilia`.

Nunca commitear `.env`, API keys, contraseñas cloud ni credenciales de Supabase.

## Comandos de validación

Ejecutar las comprobaciones proporcionales al cambio antes de cada commit:

```powershell
npm run typecheck --workspace @emil-ia/api
npm run test --workspace @emil-ia/api
npm run typecheck --workspace @emil-ia/web
npm run build --workspace @emil-ia/web
```

Para comprobar contenedores:

```powershell
podman ps
```

Para acceder a PostgreSQL:

```powershell
podman exec -it emil-ia_postgres_1 psql -U emilia -d emilia
```

## Convenciones de código

- TypeScript estricto y tipos explícitos en límites de módulos.
- Mantener interfaces en directorios `interfaces/` y servicios en `services/`.
- Una clase o responsabilidad principal por archivo.
- Preferir inyección de dependencias y composición sobre acceso global.
- Mantener rutas delgadas: validar, delegar y traducir la respuesta HTTP.
- Mantener componentes Angular delgados: presentar estado y delegar acciones.
- Usar Zod para validar entradas externas.
- No exponer credenciales ni conexiones de base de datos al frontend.
- Conservar el sandbox como proceso/contenedor separado del backend.
- Aplicar Prettier antes de commitear. No mezclar reformateos masivos con cambios funcionales.
- Respetar el formato existente y evitar cambios no relacionados.

## Convenciones de Git

- Crear commits atómicos con un solo propósito revisable.
- Escribir los mensajes de commit en inglés.
- Usar mensajes descriptivos, precisos y en modo imperativo.
- Separar funcionalidad, refactorización, formato, documentación y tests cuando sean cambios independientes.
- Ejecutar `git diff --check` antes de commitear.
- No incluir cambios del usuario que no pertenezcan a la tarea activa.
- No usar `git reset --hard`, `git checkout --` ni operaciones destructivas sobre cambios locales.
- El remoto es `https://github.com/mxidev/emil-ia.git`.

Ejemplos de mensajes aceptables:

- `Add PDF conversation export`
- `Persist conversations and model executions in PostgreSQL`
- `Refactor Angular UI into modules and services`
- `Format TypeScript sources with Prettier`

## Estado funcional actual

El MVP incluye:

- Chat con streaming SSE.
- Proveedor mock y adaptador inicial para OpenCode Go.
- Perfiles `FAST`, `DEFAULT` y `MATH`.
- Routing básico de intenciones académicas.
- Persistencia PostgreSQL de conversaciones, mensajes y ejecuciones.
- Historial seleccionable en Angular.
- Markdown y LaTeX con Marked y KaTeX.
- Exportación de conversaciones a Markdown y PDF.
- Feedback positivo/negativo persistido.
- Resumen de analítica en `/api/analytics/summary`.
- Sandbox Python expuesto internamente mediante `/api/tools/python`.
- Podman configurado para PostgreSQL y sandbox.

La aplicación usa `MockProvider` si `OPENCODE_API_KEY` u `OPENCODE_MODEL` no están configurados.

## Próximos hitos recomendados

1. Integrar y probar OpenCode Go con streaming real, límites y telemetría.
2. Incorporar el sandbox al flujo automático de consultas `SOLVE`, `VERIFY` y `COMPUTE`.
3. Añadir carga de PDF e imágenes y asociarlos a conversaciones.
4. Añadir tests de integración para API, PostgreSQL y sandbox.
5. Preparar configuración cloud, Supabase y autenticación antes de abrir el producto a terceros.

Evitar por ahora RAG avanzado, bases vectoriales, agentes complejos, microservicios y fallbacks automáticos de pago hasta validar calidad, coste y consistencia del MVP.

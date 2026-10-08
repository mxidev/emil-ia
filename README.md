# Emil-IA

MVP de un asistente académico para matemáticas e ingeniería. La primera versión es local y contiene un frontend Angular, una API Node/TypeScript, PostgreSQL y un sandbox Python aislado.

## Inicio rápido

1. Copia `.env.example` a `.env` y configura `OPENCODE_API_KEY` si quieres usar el proveedor real.
2. Ejecuta `docker compose up -d postgres sandbox`.
3. Ejecuta `npm install`.
4. Ejecuta `npm run dev` para iniciar la API en `http://localhost:3000`.
5. En otra terminal ejecuta `npm run dev:web` para iniciar Angular en `http://localhost:4200`.

Sin una clave de proveedor, la API usa el proveedor mock y permite validar todo el flujo localmente.

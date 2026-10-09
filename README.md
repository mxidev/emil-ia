# Emil-IA

MVP de un asistente académico para matemáticas e ingeniería. La primera versión es local y contiene un frontend Angular, una API Node/TypeScript, PostgreSQL y un sandbox Python aislado.

## Inicio rápido

1. Copia `.env.example` a `.env` y configura `OPENCODE_API_KEY` si quieres usar el proveedor real.
2. Con Podman, ejecuta `podman-compose up -d postgres sandbox` (o `docker compose up -d postgres sandbox` si usas Docker).
3. Ejecuta `npm install`.
4. Ejecuta `npm run dev` para iniciar la API en `http://localhost:3000`.
5. En otra terminal ejecuta `npm run dev:web` para iniciar Angular en `http://localhost:4200`.

Sin una clave de proveedor, la API usa el proveedor mock y permite validar todo el flujo localmente.

## Proveedor real y verificación matemática

El adaptador actual usa el protocolo OpenAI Chat Completions. Configura en
`.env` un modelo de OpenCode Go compatible, junto con `OPENCODE_API_KEY`,
`OPENCODE_MODEL` y la URL base incluida en `.env.example`. Los modelos que
requieren Responses API o el protocolo Anthropic todavía no están soportados;
consulta la [lista vigente de endpoints de OpenCode Go](https://docs.opencode.ai/docs/go/).

El adaptador acepta solamente Chat Completions y aplica límites locales antes de
enviar una solicitud: `OPENCODE_CONNECT_TIMEOUT_SECONDS` (15; entre 1 y 60),
`OPENCODE_STREAM_IDLE_TIMEOUT_SECONDS` (60; entre 5 y 300) y
`OPENCODE_MAX_TOKENS` (2048; entre 128 y 8192). Los valores inválidos vuelven a
su valor predeterminado. El límite de conexión cubre hasta recibir cabeceras; el
de inactividad se reinicia con cada fragmento SSE recibido.

Las consultas clasificadas como `SOLVE`, `VERIFY` o `COMPUTE` generan un único
cálculo Python, lo ejecutan en el sandbox aislado y muestran un resumen del
resultado verificado. Si el plan o el sandbox fallan, el chat continúa con una
advertencia. Con el proveedor mock, la respuesta indica que la verificación
automática requiere un proveedor real y nunca simula un resultado.

## Podman en Windows

La configuración utiliza una máquina Podman rootless. Después de instalar Podman:

```powershell
podman machine start
podman-compose up -d postgres sandbox
podman ps
```

Para detener los servicios: `podman-compose down`. La máquina puede detenerse con `podman machine stop`.

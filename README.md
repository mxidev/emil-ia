# Emil-IA

MVP de un asistente académico para matemáticas e ingeniería. La primera versión es local y contiene un frontend Angular, una API Node/TypeScript, PostgreSQL y un sandbox Python aislado.

## Inicio rápido

1. Copia `.env.example` a `.env` y configura `OPENCODE_API_KEY` si quieres usar el proveedor real.
2. Con Podman, ejecuta `podman-compose up -d postgres sandbox` (o `docker compose up -d postgres sandbox` si usas Docker).
3. Ejecuta `npm install`.
4. Ejecuta `npm run dev` para iniciar la API en `http://localhost:3000`.
5. En otra terminal ejecuta `npm run dev:web` para iniciar Angular en `http://localhost:4200`.

Sin una clave de proveedor, la API usa el proveedor mock y permite validar todo el flujo localmente.

## Autenticación local con Floci

Emil-IA usa una sesión BFF opaca en la API. El navegador nunca recibe tokens de
Cognito: el login pasa por Floci y la API conserva la sesión HttpOnly, con
aislamiento por estudiante.

Antes de iniciar la API, levanta Floci en `http://localhost:4566` y ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/floci/setup-auth.ps1
```

El wizard crea o reutiliza el user pool y el cliente público PKCE, permite
provisionar el primer estudiante y escribe la configuración local en `.env`.
No imprime ni versiona el secreto de sesión. Después inicia PostgreSQL/sandbox,
la API y Angular como en el inicio rápido.

El primer corte usa cuentas provisionadas administrativamente; el managed login
local de Floci no ofrece registro público ni recuperación de contraseña. Sus
sesiones se mantienen en memoria, por lo que al reiniciar Floci puede ser
necesario iniciar sesión otra vez. Consulta la [documentación Cognito de
Floci](https://github.com/floci-io/floci/blob/main/docs/services/cognito.md) para
los detalles del emulador local. El perfil generado solicita por defecto solo
el scope `openid`, porque algunas versiones locales de Floci rechazan `email`
en el endpoint de autorización; puedes ampliar `AUTH_OIDC_SCOPE` explícitamente
cuando el proveedor lo soporte.

## Accesibilidad y uso móvil

El frontend incluye un enlace `Saltar al contenido`, landmarks y headings
identificables, navegación por teclado con foco visible y estados de actividad
compatibles con lectores de pantalla. Mientras se genera una respuesta, el chat
expone un único estado accesible y no anuncia cada token del streaming.

El composer se adapta a pantallas estrechas: desde 320 px reorganiza el campo
de consulta y sus acciones para mantener disponibles `Adjuntar`, `Detener` y
`Enviar`. También conserva el zoom del navegador, respeta las áreas seguras de
dispositivos con notch y contiene el scroll interno.

El typecheck, los tests y el build validan la estructura implementada; además,
la revisión final debe hacerse en un teléfono real con teclado virtual y lector
de pantalla. Estas mejoras no constituyen una certificación WCAG completa.

## Estado de una respuesta

Mientras Emil-IA prepara una respuesta, el chat muestra mensajes de actividad
rotativos y permite detener la generación con el botón `Detener`. Al detenerla,
el texto parcial que ya se recibió permanece visible y se muestra `Respuesta
detenida`; no se publica una notificación de error. Una nueva consulta inicia
una generación independiente.

Si la API devuelve un error estructurado, el chat muestra su mensaje al usuario
(por ejemplo, cuando un adjunto supera un límite). Si la respuesta no contiene
un mensaje utilizable, se muestra el código HTTP para facilitar el diagnóstico.

## Adjuntos PDF

El chat permite subir PDFs a una conversación y seleccionar explícitamente sus
textos extraídos como material de referencia en consultas posteriores. Al
recargar una conversación, los adjuntos se muestran sin quedar seleccionados;
solo los documentos que el usuario vuelva a seleccionar se envían al modelo.
La API guarda el archivo completo en PostgreSQL (`bytea`) y procesa la
extracción de forma síncrona; los listados solo devuelven metadatos. Se aceptan
únicamente PDFs de hasta 10 MiB, con un máximo de cinco adjuntos por consulta.
Los PDFs sin texto extraíble se conservan con estado fallido y no se envían al
modelo. Las imágenes y OCR están fuera de alcance por ahora.

Configura `PDF_MAX_BYTES` (por defecto `10485760`) y `PDF_MAX_TEXT_CHARS` (por
defecto `80000`) en `.env` para ajustar el límite binario y el texto máximo que
entra en cada contexto documental. `PDF_MAX_CONTEXT_CHARS` (por defecto
`200000`) limita el contexto agregado de todos los PDFs seleccionados,
incluyendo sus delimitadores; cuando el presupuesto se agota, el último texto
se trunca y los documentos posteriores se omiten. Al usar PostgreSQL local,
estos bytes forman parte del tamaño de la base de datos y se eliminan junto con
su conversación.

## Proveedor real y verificación matemática

El adaptador actual usa el protocolo OpenAI Chat Completions. Configura en
`.env` un modelo de OpenCode Go compatible, junto con `OPENCODE_API_KEY`,
`OPENCODE_MODEL` y la URL base incluida en `.env.example`. Los modelos que
requieren Responses API o el protocolo Anthropic todavía no están soportados;
consulta la [lista vigente de endpoints de OpenCode Go](https://opencode.ai/v2/docs/console/go/).

La conexión validada el 14 de octubre de 2026 usa
`OPENCODE_BASE_URL=https://opencode.ai/inference/go/v1` y
`OPENCODE_MODEL=space-bunny`. Si conservas un `.env` anterior, actualiza estos
valores: cambiar `.env.example` no modifica tu configuración local.
El adaptador se identifica como `emil-ia/0.1.0` y envía el ID de conversación en
`x-opencode-session`, tanto para la planificación como para la respuesta final.

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

## Pruebas de integración

Con PostgreSQL y sandbox en ejecución (`podman-compose up -d postgres sandbox`),
ejecuta `npm run test:integration`. La suite usa las rutas HTTP de Fastify mediante
`app.inject`, PostgreSQL y sandbox reales, y un proveedor de IA determinista:
no necesita claves ni consume la suscripción de OpenCode.

Cubre respuesta verificada recuperable desde el historial, rechazo del cálculo
con advertencia persistida y fallo del proveedor sin guardar una respuesta parcial.
Las aserciones consultan historial y analítica a través de la API.

Cada prueba crea un esquema PostgreSQL `integration_<uuid>` y lo elimina al
terminar, también ante un fallo normal. No usa las tablas de `public`.
Una interrupción forzada del proceso puede dejar su esquema temporal pendiente
de eliminación manual. La cuenta de prueba necesita permisos para crear esquemas.

La suite no carga `.env`. Usa por defecto los servicios locales del compose;
para otros puertos locales, configura `TEST_DATABASE_URL` y `TEST_SANDBOX_URL`.
Solo acepta direcciones de loopback. Si faltan servicios, las pruebas fallan.
`npm test` conserva la suite habitual y no ejecuta estas pruebas de integración.

## Podman en Windows

La configuración utiliza una máquina Podman rootless. Después de instalar Podman:

```powershell
podman machine start
podman-compose up -d postgres sandbox
podman ps
```

Para detener los servicios: `podman-compose down`. La máquina puede detenerse con `podman machine stop`.

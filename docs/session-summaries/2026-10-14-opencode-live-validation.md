# Validación real de OpenCode Go — 14 de octubre de 2026

## Hallazgos y cambios

La configuración local conservaba `/api` y `space-bunny-free`; la prueba inicial
devolvió HTTP 404. La documentación actual de Go publica el endpoint
`https://opencode.ai/inference/go/v1` y el modelo `space-bunny`.

Al corregir esos valores, el proveedor devolvió HTTP 400 con
`MissingSessionID`. Se incorporaron `x-opencode-session` y
`User-Agent: emil-ia/0.1.0`. El ID de conversación se comparte entre planificación,
streaming y consultas posteriores. Las llamadas independientes sin conversación
reciben un UUID por solicitud.

Se actualizó el endpoint predeterminado, `.env.example`, README y la configuración
local `.env`. Las credenciales permanecen fuera de Git.

## Resultado observado

- Consulta breve directa: respuesta `OK`, evento `done`, 162 tokens de entrada
  y 23 de salida.
- Consulta `Calcula 6 * 7. Responde brevemente.` mediante la ruta Fastify con
  `app.inject`, proveedor real, sandbox y PostgreSQL: HTTP 200, respuesta `42`,
  pie de verificación y evento `done`.
- PostgreSQL confirmó 188 tokens de entrada, 22 de salida, 3350 ms de latencia
  y `metadata.sandbox.status = success`.
- La conversación de prueba quedó disponible con ID
  `a86ed0ac-8928-4ec6-8ce8-0b08381ab96e`.

La prueba confirma el recorrido integrado de una consulta sencilla. No equivale
a una evaluación de calidad matemática, concurrencia ni disponibilidad sostenida.
No se probó la interfaz Angular en el navegador.

## Qué se gana y qué sigue

Validación automatizada: 28 pruebas de API, 2 del sandbox y 3 de integración aprobadas,
chequeos de tipos de API y web aprobados, y `git diff --check` sin errores.

La aplicación puede usar la suscripción real con identificación estable de sesión
y conservar métricas verificadas en PostgreSQL. Las pruebas automatizadas cubren
la propagación de sesión entre turnos y las cabeceras enviadas al proveedor.

Se añadió `npm run test:integration` para repetir la comprobación con PostgreSQL
y sandbox reales y un proveedor determinista, sin llamadas de pago. Sus tres casos
comprueban la respuesta verificada recuperable desde el historial, la advertencia
ante un cálculo rechazado y la ausencia de respuestas parciales persistidas tras
un fallo del proveedor. Cada caso usa y elimina un esquema temporal propio.

Esta suite prueba rutas, servicios y persistencia juntos; no mide la calidad del
modelo real ni sustituye las pruebas del adaptador OpenCode. El siguiente paso es
evaluar consultas matemáticas representativas y ampliar la cobertura de fallos
del planificador y sandbox.

Referencia consultada: [OpenCode Go](https://opencode.ai/v2/docs/console/go/).

# Resumen de sesión: streaming de OpenCode

**Fecha:** 9 de octubre de 2026  
**Rama:** `master`

## Objetivo completado

Se robusteció el adaptador de OpenCode Go que usa Chat Completions. El alcance se mantuvo deliberadamente enfocado: no se añadió SDK, Responses API, protocolo Anthropic, reintentos ni pruebas con credenciales reales.

## Cambios y motivos

- Se añadieron límites configurables de conexión, inactividad y tokens de salida. Evitan solicitudes o streams bloqueados y acotan consumo.
- El parser SSE ahora soporta fragmentos arbitrarios y delimitadores CRLF. Esto evita perder eventos cuando el proveedor divide datos entre paquetes.
- Se capturan `inputTokens` y `outputTokens` del evento final y se guardan en `model_executions`. Esto permite observar consumo y costes por ejecución.
- La latencia de chat empieza antes de la preparación, por lo que incluye planificación y verificación matemática que percibe la persona usuaria.
- La respuesta asistente solo se persiste tras un evento `[DONE]`; errores, datos truncados o timeouts no producen conversaciones incompletas.
- El timeout del planificador cubre también la lectura del cuerpo JSON y los streams se cancelan al terminar. Así se evita esperar indefinidamente o retener conexiones upstream.
- `stream_options` se envía solo para solicitudes de streaming, conforme al contrato de Chat Completions.

## Configuración

`.env.example` y `README.md` documentan:

- `OPENCODE_CONNECT_TIMEOUT_SECONDS=15` (rango 1–60)
- `OPENCODE_STREAM_IDLE_TIMEOUT_SECONDS=60` (rango 5–300)
- `OPENCODE_MAX_TOKENS=2048` (rango 128–8192)

Los valores inválidos usan los valores predeterminados.

## Validación realizada

- 27 pruebas de API aprobadas.
- 2 pruebas del sandbox aprobadas.
- Typecheck de API y Angular aprobados.
- Build de Angular aprobado.
- `git diff --check` aprobado.
- Revisión independiente completada; sus hallazgos importantes se corrigieron.

## Commits relacionados

- `07446c7 Harden OpenCode streaming adapter`
- `5a8fb46 Persist OpenCode usage metrics`
- `47b88b3 Document OpenCode streaming limits`
- `7fca591 Fix OpenCode stream lifecycle`

## Siguiente paso recomendado

Probar OpenCode Go con credenciales reales en un entorno controlado: validar el modelo, streaming real, reporte de tokens y fallos upstream. Después, añadir pruebas de integración con PostgreSQL y el sandbox usando contenedores.

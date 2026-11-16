# Proximo hito: cloud/auth local con Floci

**Estado:** pendiente para la proxima sesion

## Objetivo

Consolidar el entorno que se usa habitualmente con estudiantes sin confundir
Floci con una plataforma cloud productiva. La autenticacion Cognito-compatible,
el aislamiento por estudiante y el logout federado ya estan validados. El
siguiente trabajo debe hacer reproducible y durable el entorno local usando
los servicios AWS-shaped que Floci ofrece.

## Alcance priorizado

### 1. Persistencia y reinicio

- Fijar una configuracion de almacenamiento persistente para el runtime de
  Floci y documentar directorios/volumenes que no deben perderse.
- Verificar que el estado de Cognito usado por las cuentas de prueba sobrevive
  un reinicio controlado, o dejar documentado si el servicio conserva una
  limitacion de memoria.
- Evaluar RDS como forma de reproducir un PostgreSQL local administrado por el
  perfil de Floci, manteniendo la base actual hasta validar migracion y
  recuperacion.
- Probar S3 en modo persistente para adjuntos/exportaciones, incluyendo
  versioning, lifecycle y URLs presignadas, sin mover el flujo PDF actual hasta
  contar con una prueba de compatibilidad.

### 2. Secretos y configuracion

- Probar Secrets Manager de Floci para almacenar y versionar secretos locales,
  comenzando por un secreto no critico y sin imprimir su valor.
- Definir un adaptador de configuracion para desarrollo que permita leer desde
  Floci y conservar `.env` como fallback explicito.
- No guardar en el repositorio el secreto de sesion, `OPENCODE_API_KEY`,
  contrasenas de estudiantes ni credenciales AWS.
- Documentar que Secrets Manager de Floci valida el contrato del cliente, pero
  no sustituye un secret manager administrado con KMS, auditoria y rotacion de
  produccion.

### 3. Operacion e inspeccion

- Usar `http://localhost:4500/console/aws` para inspeccionar Cognito, S3, RDS
  y Secrets Manager durante las pruebas, sin tratar la consola como frontera
  de seguridad.
- Fijar la version de Floci y registrar la configuracion necesaria para
  levantar el runtime de forma reproducible.
- Evaluar CloudFormation/OpenTofu/CDK o scripts AWS CLI compatibles para que el
  pool, cliente, usuarios, buckets y secretos puedan reprovisionarse desde
  cero.
- Registrar logs, errores y tiempos de las operaciones de infraestructura y
  separar esos datos de las metricas academicas de Emil-IA.

### 4. Identidad y permisos locales

- Mantener el flujo OIDC/PKCE actual como contrato principal.
- Agregar un comando seguro para listar, crear, deshabilitar y restablecer
  usuarios de prueba sin escribir contrasenas en archivos.
- Evaluar IAM/STS solo para validar clientes AWS-shaped y permisos minimos de
  S3/Secrets Manager; no usar credenciales `test`/`test` como seguridad real.
- Probar reinicio, expiracion, revocacion y cambio entre dos estudiantes
  despues de reprovisionar el entorno.

## Criterios de salida

- Un comando o procedimiento documentado levanta Floci, PostgreSQL/sandbox y
  los recursos de prueba desde un estado limpio.
- Un reinicio controlado no borra silenciosamente los recursos que el flujo
  diario necesita, o la limitacion queda explicitamente aceptada.
- Los secretos no aparecen en logs, bundle Angular, commits ni archivos
  versionados.
- Las pruebas de Emil-IA siguen pasando y el aislamiento entre estudiantes se
  conserva despues de reinicios y reprovisionamientos.
- Queda separada la decision de produccion: Floci sigue siendo local/CI; aun
  falta escoger proveedor administrado, backups, red, observabilidad y secretos
  para un despliegue real.

## Fuera de alcance por ahora

- Migrar definitivamente a S3 o RDS.
- Exponer Floci fuera de localhost.
- Usar Floci como proveedor productivo.
- Incorporar roles institucionales, MFA, registro publico o recuperacion de
  contrasena como parte de este hito.

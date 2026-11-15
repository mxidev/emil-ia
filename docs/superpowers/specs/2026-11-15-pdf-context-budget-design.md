# PDF Context Budget Design

## Intent

Evitar que varias referencias PDF saturen el contexto del proveedor o eleven el
costo de una consulta de forma inesperada, manteniendo la selección bajo control
explícito de la persona usuaria.

## Goals

- Limitar a **200.000 caracteres** el texto total de PDFs incluido en una
  consulta.
- Mantener el límite actual de cinco IDs por consulta.
- No seleccionar PDFs automáticamente al recargar una conversación.
- Mantener la selección explícita mientras la conversación está activa.
- Conservar el aislamiento por conversación y el formato delimitado existente.

## Non-goals

- Persistir la selección de PDFs en PostgreSQL o `localStorage`.
- Cambiar el límite individual de extracción de 80.000 caracteres.
- Implementar conteo exacto de tokens o RAG.
- Cambiar el almacenamiento de PDFs en PostgreSQL.

## Behavior

El frontend cargará los metadatos de los PDFs al seleccionar una conversación,
pero `selectedAttachmentIds` empezará vacío. La persona podrá seleccionar hasta
cinco PDFs listos; los fallidos seguirán visibles, pero no seleccionables.

El backend ensamblará el contexto en el orden de creación de los adjuntos y
aplicará un presupuesto agregado de 200.000 caracteres. Cada documento podrá
aportar como máximo el texto individual ya configurado por
`PDF_MAX_TEXT_CHARS`; el último documento se truncará para consumir solo el
resto del presupuesto. Si el presupuesto se agota, los documentos posteriores
no se incluirán. El contexto seguirá indicando que el contenido es material de
referencia no confiable.

## Approach

Se modifica `AttachmentService` para recibir un límite global configurable,
con valor predeterminado de 200.000, y construir los mensajes sin superar ese
límite. Se modifica `ChatStateService` para no preseleccionar adjuntos al
recargar y se conservan las acciones actuales de selección y deselección.

La configuración global se expondrá como `PDF_MAX_CONTEXT_CHARS`, se documentará
junto a los límites PDF existentes y tendrá validación positiva acotada a un
entero seguro. Los tests cubrirán truncado agregado, omisión de documentos
posteriores, selección vacía tras reload y envío solo de IDs seleccionados.

## Acceptance criteria

- Una consulta con cinco PDFs nunca genera más de 200.000 caracteres de contexto
  PDF.
- El contexto conserva el orden de los PDFs y no corta los delimitadores de
  apertura/cierre.
- Recargar una conversación muestra los PDFs, pero no los envía hasta que se
  seleccionen explícitamente.
- El flujo existente de chat, PDFs fallidos, aislamiento, tests, typecheck y
  build continúa funcionando.

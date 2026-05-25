# Estado operacional canonico

## Fuente de verdad

- `subjects.status`: estado persistido principal de la asignatura.
- `observations.status`: bloqueos y correcciones activas de Product.
- `checklist_items.status`: condicion para enviar o aprobar una asignatura.
- `semesters.status` y `projects.status`: estados derivados por servicios de workflow.
- `operationalState`: estado calculado por backend para la UI. No se persiste.

## Estados de UI

- `NOT_STARTED`: asignatura pendiente, sin trabajo iniciado.
- `IN_PRODUCTION`: Fabrica esta trabajando.
- `IN_REVIEW`: Fabrica envio a Product y espera revision.
- `CHANGES_REQUESTED`: Product pidio correcciones o hay observaciones abiertas.
- `CORRECTION_SENT`: Fabrica marco correccion aplicada y espera validacion Product.
- `APPROVED`: Product aprobo la asignatura.

## Prioridad de derivacion

1. `subject.status` `APPROVED` o `DELIVERED` produce `APPROVED`.
2. Observaciones Product `ABIERTA` producen `CHANGES_REQUESTED`.
3. Observaciones Product `EN_CORRECCION` producen `CORRECTION_SENT`.
4. `subject.status` `CHANGES_REQUESTED` produce `CHANGES_REQUESTED`.
5. `subject.status` `IN_REVIEW` o `SUBMITTED` produce `IN_REVIEW`.
6. `subject.status` `IN_PRODUCTION` produce `IN_PRODUCTION`.
7. Cualquier otro caso produce `NOT_STARTED`.

## Transiciones validas

Product/Admin:

- `IN_REVIEW -> APPROVED`: requiere checklist aprobado y cero observaciones abiertas o en correccion.
- `IN_REVIEW -> CHANGES_REQUESTED`: crea observacion Product abierta.
- `APPROVED -> CHANGES_REQUESTED`: no permitido en el flujo actual.
- Nueva asignatura: inicia en `PENDING`, con `operationalState` `NOT_STARTED`.

Fabrica/Admin:

- `PENDING -> IN_PRODUCTION`: permitido al iniciar produccion.
- `CHANGES_REQUESTED -> IN_PRODUCTION`: permitido para trabajar correcciones.
- `IN_PRODUCTION -> IN_REVIEW`: requiere checklist Fabrica entregado/aprobado y cero observaciones abiertas.
- Observacion `ABIERTA -> EN_CORRECCION`: marca correccion aplicada; la UI muestra `CORRECTION_SENT` hasta validacion Product.

## Reglas de coherencia

- Fabrica no aprueba asignaturas.
- Product no marca produccion como completada.
- Una asignatura aprobada no recibe nuevas observaciones de correccion Product.
- Proyecto cerrado bloquea mutaciones operativas.
- Checklist rechazado impide aprobacion final.
- Una observacion abierta tiene prioridad visual sobre estados de revision/produccion.

## Migraciones

No se agrega columna para `operationalState`.

Antes de crear una migracion correctiva, validar datos existentes para:

- Asignaturas `APPROVED` con observaciones `ABIERTA` o `EN_CORRECCION`.
- Asignaturas `CHANGES_REQUESTED` sin observaciones abiertas.
- Observaciones abiertas en proyectos cerrados.
- Checklist rechazado en asignaturas aprobadas.

Si aparecen inconsistencias, corregirlas con una migracion explicita y auditable, no con inferencia silenciosa.

## QA minimo

- Asignatura nueva aparece como `NOT_STARTED`.
- Inicio de produccion aparece como `IN_PRODUCTION`.
- Envio a revision aparece como `IN_REVIEW`.
- Correccion solicitada aparece como `CHANGES_REQUESTED`.
- Correccion aplicada aparece como `CORRECTION_SENT`.
- Aprobacion aparece como `APPROVED`.
- Product y Fabrica ven el mismo `operationalState`.
- Modo mock conserva fallback local.

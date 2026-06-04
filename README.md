# Producto-Backend

Backend para la plataforma Producto/Fábrica (NestJS + TypeORM + PostgreSQL).

## Stack

- NestJS
- TypeORM
- PostgreSQL
- JWT + RBAC (PRODUCT, FÁBRICA, ADMIN)
- Swagger en `/docs`
- class-validator / class-transformer

---

## Requisitos

- **Node.js** 20+ (validado con v22)
- **npm**
- **PostgreSQL** local (17+ recomendado)
- **PowerShell** (opcional, para el script de validación automática en Windows)

Herramientas útiles:

- `psql` / `createdb` (incluidos con PostgreSQL)
- pgAdmin (alternativa para crear la base de datos)

---

## Variables de entorno

Copia `.env.example` a `.env` en la raíz del proyecto y ajusta si es necesario.

Valores usados y **validados en local**:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/producto_backend
CORS_ORIGIN=http://localhost:5173
JWT_SECRET=dev-secret-producto-backend-cambiar-en-produccion
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=10
SEED_ADMIN_PASSWORD=Admin123!
SEED_FABRICA_PASSWORD=Fabrica123!
SEED_PRODUCT_PASSWORD=Product123!
```

| Variable | Descripción |
|----------|-------------|
| `PORT` | Puerto HTTP del API (default `3000`) |
| `NODE_ENV` | Entorno (`development` en local) |
| `DATABASE_URL` | Cadena de conexión PostgreSQL |
| `CORS_ORIGIN` | Origen permitido del frontend (Vite: `5173`) |
| `JWT_SECRET` | Secreto para firmar JWT (**cambiar en producción**) |
| `JWT_EXPIRES_IN` | Expiración del token (ej. `1d`) |
| `BCRYPT_SALT_ROUNDS` | Rondas de bcrypt para contraseñas |
| `SEED_*_PASSWORD` | Contraseñas de usuarios seed (solo desarrollo) |

### Correo (notificaciones institucionales y solicitudes)

Documentación completa: **[EMAIL_SETUP.md](EMAIL_SETUP.md)** (Gmail local, modo prueba, fail-closed, QA).

Los correos reales están habilitados solo en **modo prueba**. Para producción se debe usar proveedor institucional o relay autorizado.

Al crear un proyecto con `POST /projects`, el backend puede enviar un correo con el detalle de la solicitud.

| Variable | Descripción |
|----------|-------------|
| `EMAIL_ENABLED` | `true` activa envío; `false` lo omite por completo |
| `EMAIL_TRANSPORT` | `log` imprime en consola (local sin SMTP); `smtp` usa servidor real |
| `EMAIL_HOST` | Host SMTP |
| `EMAIL_PORT` | Puerto SMTP (ej. `587`) |
| `EMAIL_SECURE` | `true` para TLS directo (puerto 465); `false` para STARTTLS |
| `EMAIL_USER` | Usuario SMTP |
| `EMAIL_PASSWORD` | Contraseña SMTP (**no commitear**) |
| `EMAIL_FROM` | Remitente, ej. `Producto CUN <no-reply@cun.edu.co>` |
| `PRODUCT_REQUEST_NOTIFY_EMAIL` | Destinatario de la notificación (ej. equipo Producto) |

**Reglas:** si `EMAIL_ENABLED=false`, no se envía nada. Si está activo pero faltan datos SMTP (y `EMAIL_TRANSPORT` no es `log`), la creación del proyecto **no falla**; solo se registra un warning. El envío ocurre **después** de persistir el proyecto y el audit log.

**Probar en local sin SMTP:**

```env
EMAIL_ENABLED=true
EMAIL_TRANSPORT=log
PRODUCT_REQUEST_NOTIFY_EMAIL=tu-correo@cun.edu.co
```

Tras `POST /projects`, revisa la consola del backend: verás `to`, `subject` y un preview del texto.

> El arranque carga `.env` mediante `src/env.ts` antes de registrar TypeORM y los módulos de negocio. Sin `DATABASE_URL`, solo responde `/health`.

---

## Crear base de datos local

Nombre de la base: **`producto_backend`**

**Terminal (PostgreSQL en PATH):**

```bash
createdb -U postgres producto_backend
```

**pgAdmin:** crear base `producto_backend` con el usuario `postgres`.

---

## Reset de base de datos local (solo desarrollo)

Script controlado para dejar la DB en estado inicial (esquema limpio + migraciones + seed de usuarios).

**Advertencias:**

- Solo usar en **PostgreSQL local** (`localhost` / `127.0.0.1` en `DATABASE_URL`).
- **No ejecutar** si `NODE_ENV=production`.
- **No usar** contra Cloud SQL ni bases remotas.
- Borra todos los datos de negocio (proyectos, checklist, observaciones, auditoría, etc.). Los usuarios seed se recrean al final.

```powershell
cd Producto-Backend
powershell -ExecutionPolicy Bypass -File .\scripts\reset-local-db.ps1
```

Tras el reset, validar en pgAdmin:

- Tabla `users` con 3 registros (admin, product, fabrica).
- `typeorm_migrations` con las migraciones aplicadas.
- `projects`, `audit_logs`, `notifications` vacíos (o mínimos).

Luego: `npm run start:dev`.

Prueba API automatizada (opcional, con backend en marcha):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\e2e-local-api.ps1
```

---

## Instalación y puesta en marcha

### 1. Dependencias

```bash
npm install
```

### 2. Compilar

```bash
npm run build
```

### 3. Migraciones

Aplica el esquema (usuarios + dominio de negocio):

```bash
npm run migration:run
```

### 4. Seed (usuarios iniciales)

Idempotente por email:

```bash
npm run seed
```

### 5. Levantar backend en desarrollo

```bash
npm run start:dev
```

Comprobar salud:

```bash
GET http://localhost:3000/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "service": "producto-backend"
}
```

---

## Swagger

Con el servidor en marcha:

**http://localhost:3000/docs**

Autenticación: botón **Authorize** → `Bearer <accessToken>` (obtenido en `POST /auth/login`).

---

## Usuarios seed

| Rol | Email | Contraseña |
|-----|-------|------------|
| ADMIN | `admin@local` | `Admin123!` |
| PRODUCT | `product@local` | `Product123!` |
| FÁBRICA | `fabrica@local` | `Fabrica123!` |

Los emails `@local` son válidos en desarrollo (`require_tld: false` en login).

---

## Flujo E2E validado (manual / Swagger)

Flujo completo probado en local (mayo 2026):

| Paso | Acción | Rol |
|------|--------|-----|
| 1 | `GET /health` | — |
| 2 | `POST /auth/login`, `GET /auth/me` | ADMIN, PRODUCT, FÁBRICA |
| 3 | `GET /users` (200 ADMIN, 403 PRODUCT), `GET /users/me/profile` | ADMIN / PRODUCT |
| 4 | `POST /projects` → `GET /projects` → `GET /projects/:id` | PRODUCT |
| 5 | `PATCH /checklist/:id/status` (producción y entrega) | FÁBRICA |
| 6 | Marcar todos los ítems ENTREGADO → `POST /subjects/:id/submit` | FÁBRICA |
| 7 | `POST /observations` → `GET /projects/:projectId/observations` | PRODUCT |
| 8 | `POST /subjects/:id/approve` con observación ABIERTA → **400** | PRODUCT |
| 9 | `POST /observations/:id/mark-correction-applied` → `POST /observations/:id/validate` | FÁBRICA → PRODUCT |
| 10 | Checklist APROBADO → `POST /subjects/:id/approve` | PRODUCT |
| 11 | `POST /projects/:id/mark-delivered` → `POST /projects/:id/close` | PRODUCT |
| 12 | `GET /notifications` | cualquier rol autenticado |

**Body de ejemplo para `POST /projects`** (nota: `topics` es `string[]`):

```json
{
  "school": "Escuela de Ingeniería",
  "program": "Ingeniería de Software",
  "modality": "VIRTUAL",
  "requestType": "Virtualización",
  "priority": "MEDIUM",
  "expectedDeliveryDate": "2026-12-31T00:00:00.000Z",
  "observations": "Proyecto piloto local",
  "syllabus": {
    "hasSyllabus": true,
    "url": "https://example.com/syllabus.pdf"
  },
  "semesters": [
    {
      "semesterNumber": 1,
      "factoryExpectedDate": "2026-08-01T00:00:00.000Z",
      "subjects": [
        {
          "name": "Matemáticas I",
          "topics": ["Introducción", "Álgebra básica"]
        }
      ]
    }
  ]
}
```

Al crear un proyecto se generan automáticamente semestres, asignaturas, temas y checklist (asignatura + por tema). Con dos temas, el detalle suele mostrar ~20 ítems de asignatura y 4 por tema.

**Auditoría:** las acciones relevantes escriben en `audit_logs` y `status_history`; las notificaciones en `notifications`.

---

## Script de validación automática

Script PowerShell que reproduce el flujo E2E contra `http://localhost:3000`:

```powershell
# Con el backend ya en marcha (npm run start:dev)
powershell -ExecutionPolicy Bypass -File .\scripts\validate-local.ps1
```

Genera un reporte JSON en:

`scripts/validate-report.json`

---

## Reglas importantes antes de conectar frontend

### Checklist por rol

- **FÁBRICA:** `PENDIENTE` → `EN_PRODUCCION` → `ENTREGADO` (no puede saltar estados ni marcar `APROBADO` / `RECHAZADO`).
- **PRODUCT:** solo desde `ENTREGADO` → `APROBADO` o `RECHAZADO`.
- **ADMIN:** sin restricción de transición en checklist.

### Submit y aprobación de asignatura

- Para `POST /subjects/:id/submit`, todos los ítems deben estar `ENTREGADO` o `APROBADO`.
- Observaciones en estado **`ABIERTA`** o **`EN_CORRECCION`** bloquean la aprobación de la asignatura.
- **`POST /subjects/:id/reject`** no crea una observación automática; el rechazo de checklist es independiente.

### Proyecto y entrega

- Es **recomendable** enviar `factoryOwnerId` (UUID del usuario FÁBRICA) al crear el proyecto para asignación explícita.
- FÁBRICA también puede operar en proyectos visibles por estado aunque no tenga `factoryOwnerId`.
- **`POST /projects/:id/mark-delivered`** es la entrega final administrativa (no integra un LMS real).
- El enum interno `DELIVERED_TO_LMS` es **legacy temporal**; la API expone `mark-delivered` sin referencias a LMS en textos de usuario.
- **`POST /projects/:id/close`** requiere entrega final previa y que las asignaturas estén aprobadas según las reglas del servicio.

### CORS

- El frontend en `http://localhost:5173` debe coincidir con `CORS_ORIGIN` (o lista separada por comas).

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `DATABASE_URL not set; TypeORM is disabled` | `.env` no cargado o sin `DATABASE_URL` | Verificar `.env` en la raíz; reiniciar `start:dev` |
| `email must be an email` en login | Email sin TLD (`@local`) | Usar emails seed documentados; el DTO ya permite `require_tld: false` |
| `UndefinedModuleException` al arrancar | Dependencias circulares entre módulos | Usar la versión actual del repo (`forwardRef` en Projects/Subjects/Checklist/Observations) |
| `Unique constraint contains column that is missing` en migración | Entidades Topic/Semester sin columna FK explícita | Actualizar código y volver a `npm run build && npm run migration:run` en DB limpia o revertir migraciones |
| `migration:run` / `seed` sin `.env` | CLI TypeORM fuera de Nest | `src/env.ts` + `data-source.ts` cargan dotenv; ejecutar desde la raíz del proyecto |
| `All checklist items must be ENTREGADO...` en submit | Transición incompleta | FÁBRICA: primero `EN_PRODUCCION`, luego `ENTREGADO` en cada ítem |
| `Observation must be in status ABIERTA` en mark-correction | Observación ya resuelta o en otro estado | Crear observación nueva o usar el flujo en orden |
| `FABRICA cannot transition checklist from PENDIENTE to ENTREGADO` | Salto de estado | Aplicar `EN_PRODUCCION` antes de `ENTREGADO` |
| Puerto 3000 ocupado | Otra instancia del API | Detener proceso previo o cambiar `PORT` en `.env` |
| Error de conexión PostgreSQL | Servicio detenido o credenciales | Verificar que PostgreSQL esté activo y que `DATABASE_URL` sea correcta |
| `connect ETIMEDOUT` al arrancar | `DATABASE_URL` apunta a Cloud SQL remoto sin acceso de red | Usar VPN/red autorizada o apuntar a PostgreSQL local (`localhost`) en desarrollo |

**Reinicio limpio de base (solo desarrollo):**

```bash
dropdb -U postgres producto_backend
createdb -U postgres producto_backend
npm run migration:run
npm run seed
```

---

## Scripts npm

| Comando | Descripción |
|---------|-------------|
| `npm install` | Instala dependencias |
| `npm run build` | Compila TypeScript (`dist/`) |
| `npm run migration:run` | Ejecuta migraciones pendientes |
| `npm run migration:revert` | Revierte la última migración |
| `npm run seed` | Crea/actualiza usuarios seed |
| `npm run start:dev` | Desarrollo con watch |
| `npm run start` | Producción (`node dist/main.js`) |
| `npm run lint` | Verificación TypeScript sin emitir |

---

## Deploy (futuro)

- Cloud Run: imagen Docker, variables en Secret Manager, Cloud SQL PostgreSQL.
- Ejecutar migraciones de forma controlada (job/manual) antes del despliegue.
- Rotar `JWT_SECRET` y contraseñas seed; no usar valores de desarrollo en producción.

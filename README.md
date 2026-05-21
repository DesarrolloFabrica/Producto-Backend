# Producto-Backend

Backend para la plataforma Producto/Fabrica.

## Stack

- NestJS
- TypeORM
- PostgreSQL (Cloud SQL en produccion)
- Swagger (`/docs`)
- class-validator / class-transformer

## Requisitos

- Node.js 20+
- PostgreSQL local (opcional para desarrollo)

## Variables de entorno

Ver `.env.example`.

## Instalacion

```bash
npm install
```

## Correr en desarrollo

```bash
npm run start:dev
```

## Health check

`GET /health`

Respuesta esperada:

```json
{ "status": "ok", "service": "producto-backend" }
```

## Swagger

`GET /docs`

## Build

```bash
npm run build
```

## Deploy (futuro)

- Cloud Run: build Docker, set env vars (Secret Manager), conectar a Cloud SQL PostgreSQL.
- Migraciones TypeORM: ejecutar de forma controlada (job/manual) antes del deploy.

# Reporte E2E local — Producto (desde cero)

| Campo | Valor |
|-------|--------|
| **Fecha** | 2026-05-21 |
| **Backend commit** | `f63547e` (+ cambios locales sin commit: notificaciones, scripts E2E) |
| **Frontend commit** | `6cf7a18` |
| **Entorno** | Windows, PostgreSQL local, `NODE_ENV` ≠ production |
| **API** | `http://localhost:3000` |
| **Frontend** | `http://localhost:5173` (`VITE_API_URL=http://localhost:3000`, `VITE_USE_MOCKS=false`) |

---

## 1. Script `reset-local-db.ps1`

**Ruta:** `Producto-Backend/scripts/reset-local-db.ps1`

**Protecciones:**
- Aborta si `NODE_ENV=production`.
- Aborta si `DATABASE_URL` no contiene `localhost` ni `127.0.0.1`.

**Flujo:**
1. `DROP SCHEMA public CASCADE` + `CREATE SCHEMA` + extensión `pgcrypto`.
2. `npm run migration:run`
3. `npm run seed`
4. Resumen SQL (`users`, `projects`, `audit_logs`, `notifications`, `typeorm_migrations`).

**Comando:**
```powershell
cd Producto-Backend
powershell -ExecutionPolicy Bypass -File .\scripts\reset-local-db.ps1
```

**Último reset (post-E2E):** OK — usuarios seed = 3, `projects` = 0 antes del flujo; tras E2E API ver sección DB.

---

## 2. README backend

Sección **«Reset de base de datos local (solo desarrollo)»** documentada en `Producto-Backend/README.md` con advertencia de solo local y el comando anterior.

---

## 3. Resultado del reset

| Tabla / dato | Tras reset (vacío) |
|--------------|-------------------|
| `users` | 3 (`admin@local`, `product@local`, `fabrica@local`) |
| `projects` | 0 |
| `audit_logs` | 0 |
| `notifications` | 0 |
| `typeorm_migrations` | 2 migraciones aplicadas |

---

## 4. Build backend

```
npm run build  → OK (nest build)
```

---

## 5. Build frontend

```
npm run build  → OK (Vite; warning chunks >500 kB, no bloqueante)
npm run lint   → OK (tsc --noEmit)
```

---

## 6. Prueba manual (UI) y automatizada (API)

### 6.1 Script API `scripts/e2e-local-api.ps1`

Flujo equivalente a pasos A–H del checklist del usuario, ejecutado contra API con backend en `start:dev`.

**Última ejecución:** **14/14 OK** (tras reset + E2E).

| Paso | Prueba | Resultado |
|------|--------|-----------|
| 0 | `GET /health` | OK |
| 0 | Login `product@local` / `fabrica@local` | OK |
| A | `POST /projects` (Prueba Desde Cero, 1 sem, 1 asignatura, 2 temas) | OK — 20 ítems checklist únicos (12 asignatura + 8 tema) |
| A | `GET /projects/:id` estructura | OK |
| C | Fábrica: checklist → EN_PRODUCCION → ENTREGADO; `POST submit` | OK → `IN_REVIEW` |
| D | Product: observación; `approve` bloqueado | OK (400 por checklist no APROBADO / obs) |
| E | Fábrica: `mark-correction-applied` | OK → `EN_CORRECCION` |
| F | Product: `validate` observación | OK → `RESUELTA` |
| F | Product: PATCH checklist `APROBADO` (20 únicos) | OK |
| F | Product: `approve` asignatura | OK → `APPROVED` |
| H | `mark-delivered` | OK → `DELIVERED_TO_LMS` |
| H | `close` | OK → `CLOSED` |
| G | `GET /notifications` | OK (4 notificaciones) |
| G | `PATCH .../read` + `read-all` | OK |

### 6.2 Prueba manual en navegador (pasos A–H)

**No ejecutada por el agente** (requiere interacción humana en `http://localhost:5173`).

**Preparación lista:**
- Backend: `npm run start:dev` tras reset.
- Frontend: `.env` con `VITE_API_URL=http://localhost:3000`, `VITE_USE_MOCKS=false`; `npm run dev`.
- Credenciales seed: `product@local` / `Product123!`, `fabrica@local` / `Fabrica123!`.

**Validación recomendada en pgAdmin tras UI:** 1 `projects`, 1 `semesters`, 1 `subjects`, 2 `topics`, 20 `checklist_items`, `audit_logs` y `notifications` poblados.

### 6.3 UI entrega / cierre (paso H)

- **API:** `POST /projects/:id/mark-delivered` y `POST /projects/:id/close` funcionan (probado en E2E API).
- **Frontend:** `OperationsContext` expone `markProjectDeliveredToLms` y `closeProject`, pero **no hay botones** en `ProjectDetailPage` (solo tarjetas informativas «Próximos pasos»). **Pendiente:** conectar acciones en UI o documentar uso solo vía API hasta Cloud.

---

## 7. Bugs encontrados y correcciones

| # | Bug | Severidad | Estado |
|---|-----|-----------|--------|
| 1 | Notificaciones: `userId` no persistía/serializaba bien; `markRead` devolvía 403 o DTO con `userId` null | Media | **Corregido** — columna `userId` en entidad, `notifyUser` asigna `userId`, `leftJoinAndSelect` en listado, `findOne` con relación en `markRead`, `assertCanAccess` usa `user.id` |
| 2 | E2E: 8 fallos al aprobar checklist | Falso positivo | **Corregido en script** — duplicación de ítems (mismo ítem en `subject.checklist` y `topic.checklist`); dedupe por `id` |
| 3 | E2E: `PATCH .../read` → «uuid is expected» | Falso positivo | **Corregido en script** — `Invoke-RestMethod` fusionaba array JSON; helper `Get-NotificationsList` con `ConvertFrom-Json` |
| 4 | Puerto 3000 `EADDRINUSE` | Operativo | Mitigación: cerrar procesos `node` huérfanos antes de `start:dev` |
| 5 | UI sin botones marcar entregado LMS / cerrar proyecto | Baja (UX) | **Pendiente** — API lista, UI no conectada |

**No se tocó:** Cloud, `mockData`, tablas manuales en pgAdmin.

---

## 8. Errores de consola / backend

| Origen | Detalle |
|--------|---------|
| Backend (histórico) | `EADDRINUSE` en puerto 3000 si quedan instancias previas |
| E2E (resuelto) | Mensajes 400 «Status is already set» por PATCH duplicado en checklist |
| E2E (resuelto) | 400 «uuid is expected» por URL con varios UUID concatenados (PowerShell) |
| Frontend build | Warning Vite por tamaño de chunk (>500 kB), no error |

---

## 9. Estados finales en DB (tras último E2E API)

Valores esperados tras flujo completo (un proyecto de prueba):

| Entidad | Esperado |
|---------|----------|
| `projects` | 1, `status` = `CLOSED` |
| `semesters` | 1 |
| `subjects` | 1, `status` = `APPROVED` (tras flujo; proyecto cerrado después) |
| `topics` | 2 |
| `checklist_items` | 20, todos `APROBADO` al cierre de revisión |
| `observations` | 1, `RESUELTA` |
| `notifications` | ≥4, al menos una `isRead=true` tras PATCH |
| `audit_logs` | >0 (checklist, workflow, cierre) |
| `typeorm_migrations` | 2 filas |

---

## 10. Pendientes antes de Cloud

1. **Prueba manual UI** completa (login, crear proyecto, checklist, observaciones, panel notificaciones) — recomendada antes del primer deploy.
2. **Botones UI** para `mark-delivered` y `close` en detalle de proyecto (Product).
3. **Reiniciar backend** tras cambios en `notifications` si el proceso `start:dev` no recargó (o confirmar hot-reload).
4. **Commit** de fixes de notificaciones + scripts E2E si se desea trazabilidad en git.
5. Variables y `DATABASE_URL` de Cloud **no** validadas en este modo (solo localhost).
6. Documentar en runbook Cloud: no ejecutar `reset-local-db.ps1` fuera de local.

---

## Veredicto: ¿lista para primera prueba Cloud?

| Área | Estado |
|------|--------|
| Reset local controlado | Listo |
| Migraciones + seed | Listo |
| API flujo negocio (auth, proyectos, checklist, obs, notificaciones, cierre) | Listo (E2E API 14/14) |
| Builds CI local | Listo |
| Integración frontend ↔ API | Implementada; **falta validación UI manual** |
| Notificaciones leer/marcar | Corregido en código; validar en UI |
| Cierre/entrega LMS en UI | Pendiente (solo API) |

**Conclusión:** **Sí, candidata a primera prueba Cloud a nivel API/backend**, con reservas: ejecutar smoke en entorno Cloud (auth, DB remota, CORS, `VITE_API_URL`), completar prueba manual UI, y añadir botones de cierre/entrega o aceptar operación vía API hasta siguiente iteración.

---

## Comandos de referencia rápida

```powershell
# Reset
cd Producto-Backend
powershell -ExecutionPolicy Bypass -File .\scripts\reset-local-db.ps1

# Backend
npm run start:dev

# E2E API (backend arriba)
powershell -ExecutionPolicy Bypass -File .\scripts\e2e-local-api.ps1

# Frontend
cd ..\Producto-Frontend
npm run dev
```

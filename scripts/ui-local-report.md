# Reporte validación UI local — Producto

| Campo | Valor |
|-------|--------|
| **Fecha** | 2026-05-21 |
| **Backend** | `http://localhost:3000` — health OK |
| **Frontend** | `http://localhost:5173` — `VITE_USE_MOCKS=false` |
| **Correo** | `EMAIL_ENABLED=true`, `EMAIL_TRANSPORT=log` |
| **Validador** | Agente (API + builds + revisión código) + evidencia manual parcial en terminal |

> **Nota:** El agente no puede operar el navegador. Los pasos 3–8 deben confirmarse en UI por el usuario. El flujo equivalente vía API pasó **14/14** (`scripts/e2e-local-api.ps1`).

---

## 1. Builds

| Proyecto | Comando | Resultado |
|----------|---------|-----------|
| Backend | `npm run build` | **OK** |
| Frontend | `npm run build` | **OK** (warning chunk >500 kB) |
| Frontend | `npm run lint` | **OK** |

---

## 2. Servicios

| Servicio | Estado |
|----------|--------|
| Backend `start:dev` | **Activo** (terminal 6) |
| `GET /health` | **OK** |
| Frontend `npm run dev` | **No detectado** en puerto 5173 al validar — levantar antes de UI |

---

## 3. Pasos del checklist UI

| # | Paso | API / código | UI manual |
|---|------|--------------|-----------|
| 1 | Backend build + health | OK | — |
| 2 | Frontend build + dev | Build OK; dev pendiente | Abrir `http://localhost:5173` |
| 3 | PRODUCT crear solicitud | POST `/projects` OK | Parcial: usuario creó «Prueba Email»; log correo visto en backend |
| 3b | Log correo backend | `[MailService] [EMAIL log] to=zuany_acuna@cun.edu.co` | Confirmar con «Prueba Flujo Completo» |
| 4 | FÁBRICA checklist + entregar | Submit OK en E2E | Probar en UI tras fix entregables (ver bugs) |
| 5 | PRODUCT observación + approve bloqueado | 400 esperado OK | Toast error vía `getApiErrorMessage` |
| 6 | FÁBRICA corrección aplicada | OK en E2E | Probar botón en asignatura |
| 7 | PRODUCT validar + aprobar checklist + asignatura | APPROVED OK en E2E | Aprobar ítems en tema + asignatura en UI |
| 8 | Notificaciones leer / todas | PATCH OK en E2E | Página `/notifications` |
| 9 | pgAdmin | psql no en PATH del agente | Usuario: contar tablas tras flujo |
| 10 | Reset final | — | Opcional: `scripts/reset-local-db.ps1` |

---

## 4. Qué funcionó

- Integración frontend ↔ API con mocks desactivados.
- Creación de proyecto y notificación por correo en modo `log`.
- Flujo completo negocio (checklist, submit, observaciones, approve, notificaciones, cierre) vía **API 14/14**.
- Mapeo `isRead` → `read` en notificaciones.
- Errores de API mostrados en toast (`getApiErrorMessage`).

---

## 5. Qué falló / riesgos UI

| Item | Detalle |
|------|---------|
| UI navegador | No ejecutada por el agente |
| Frontend dev | No estaba corriendo en 5173 durante validación |
| pgAdmin | No consultado por el agente (sin `psql` en PATH) |

---

## 6. Errores consola

| Origen | Error | Impacto |
|--------|-------|---------|
| Backend (histórico) | `EADDRINUSE :3000` | Proceso `node` duplicado — liberar puerto |
| Frontend build | Warning chunk size Vite | No bloqueante |
| Browser | *(pendiente registro manual)* | — |

---

## 7. Bugs encontrados y correcciones

| Bug | Severidad | Estado |
|-----|-----------|--------|
| Fábrica: botón «entregar» habilitado solo con checklist de asignatura (12 ítems), ignorando 8 ítems de temas; backend rechaza submit si temas no están ENTREGADO | Media UX | **Corregido** en `FactorySubjectDetail.tsx` — cuenta asignatura + temas |
| Notificaciones `userId` en backend | Media | Corregido en sesión anterior |
| UI sin botones cerrar / entregar LMS | Baja | Pendiente (solo API) |
| `handleAddTopic` en Product aún local/mock | Baja | No bloquea flujo pedido (2 temas al crear) |

---

## 8. Pendientes antes de Cloud

1. **Completar prueba manual UI** con la checklist del usuario (pasos 3–8).
2. Levantar `npm run dev` en frontend.
3. Tras flujo UI, verificar en pgAdmin: `projects`, `subjects`, `checklist_items`, `observations`, `notifications`, `audit_logs`, `status_history`.
4. Probar SMTP real cuando existan credenciales (`EMAIL_TRANSPORT=smtp`).
5. Conectar botones de cierre/entrega LMS en `ProjectDetailPage` (opcional).
6. **Reset final** recomendado antes de Cloud: `scripts/reset-local-db.ps1`.

---

## 9. ¿Listo para limpieza / reset final?

| Criterio | Estado |
|----------|--------|
| API + builds | Listo |
| Correo modo log | Listo |
| UI manual documentada | **Pendiente confirmación usuario** |
| Datos DB limpios para Cloud | Ejecutar reset cuando termine UI |

**Veredicto:** Listo para **reset final** después de que completes la pasada manual en navegador. Si algo falla en UI, anotar pantalla + mensaje toast y consola (F12).

---

## Comandos rápidos

```powershell
# Backend
cd Producto-Backend
npm run start:dev

# Frontend (otra terminal)
cd Producto-Frontend
npm run dev

# E2E API (sin UI)
cd Producto-Backend
powershell -ExecutionPolicy Bypass -File .\scripts\e2e-local-api.ps1

# Reset DB local
powershell -ExecutionPolicy Bypass -File .\scripts\reset-local-db.ps1
```

**Credenciales:** `product@local` / `Product123!`, `fabrica@local` / `Fabrica123!`

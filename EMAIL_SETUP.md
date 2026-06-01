# Configuración de correo — Operación Académica CUN

Documentación de la fase de **correos reales en modo prueba** (backend NestJS).

Los correos reales están habilitados solo en **modo sandbox**: con `EMAIL_TEST_MODE=true` todo el SMTP va a un único buzón de prueba. Para producción se debe usar un proveedor institucional o relay autorizado (ver checklist al final).

---

## Variables de entorno

Copiar desde [`.env.example`](.env.example). **Nunca commitear `.env`.**

| Variable | Descripción |
|----------|-------------|
| `EMAIL_ENABLED` | `true` activa envío; `false` solo registra logs (`SKIPPED`) |
| `EMAIL_PROVIDER` | `smtp` (real) o `log` (mock en consola) |
| `EMAIL_FROM_NAME` | Nombre visible del remitente |
| `EMAIL_FROM_ADDRESS` | Dirección FROM (con Gmail suele coincidir con `SMTP_USER`) |
| `EMAIL_TEST_MODE` | **`true` obligatorio en local/dev** — redirige todo a `EMAIL_TEST_RECIPIENT` |
| `EMAIL_TEST_RECIPIENT` | Buzón único de prueba (ej. tu Gmail personal) |
| `SMTP_HOST` | Host SMTP |
| `SMTP_PORT` | Puerto SMTP |
| `SMTP_USER` | Usuario SMTP |
| `SMTP_PASS` | Contraseña SMTP (**App Password**, no la contraseña normal) |
| `SMTP_SECURE` | `true` = SSL directo; `false` = STARTTLS |
| `APP_PUBLIC_URL` | URL del frontend para enlaces CTA en plantillas |

Compatibilidad legacy (fallback): `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_TRANSPORT`, `PRODUCT_REQUEST_NOTIFY_EMAIL`.

---

## Gmail local (configuración validada)

En el entorno de desarrollo del equipo se validó envío real con **Gmail** y modo prueba activo.

```env
EMAIL_ENABLED=true
EMAIL_PROVIDER=smtp

EMAIL_TEST_MODE=true
EMAIL_TEST_RECIPIENT=tu-correo@gmail.com

EMAIL_FROM_NAME="Operación Académica CUN"
EMAIL_FROM_ADDRESS=tu-correo@gmail.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=<APP_PASSWORD_DE_GOOGLE>
SMTP_SECURE=true
```

### App Password (obligatorio)

1. Activar **verificación en 2 pasos** en la cuenta Google.
2. Ir a **Seguridad → Contraseñas de aplicaciones**.
3. Generar una contraseña para “Correo” / “Otro”.
4. Pegar los 16 caracteres en `SMTP_PASS` (con o sin espacios).

**Nunca** usar la contraseña normal de Gmail en `SMTP_PASS`.

### Puerto 465 + `SMTP_SECURE=true`

- En la red validada, el puerto **587** (STARTTLS) falló con error de conexión TLS.
- **465 + `SMTP_SECURE=true`** funcionó de forma estable con Gmail.
- Si tu red permite 587, puedes probarlo; la configuración validada del proyecto es **465/SSL**.

### Remitente con Gmail

Con Gmail, `EMAIL_FROM_ADDRESS` debe ser la misma cuenta autenticada (`SMTP_USER`) o un alias autorizado en Google.

---

## Modo prueba (`EMAIL_TEST_MODE`)

Con `EMAIL_TEST_MODE=true`:

- Todo correo SMTP se envía a **`EMAIL_TEST_RECIPIENT`**, sin importar el destinatario lógico (rol, owner, payload de `/email/test`).
- En `email_delivery_logs` queda trazabilidad:
  - `originalRecipient` — destinatario lógico (ej. `fabrica@local`, owner del proyecto)
  - `effectiveRecipient` — buzón de prueba real

**No activar envío a usuarios reales** mientras `EMAIL_TEST_MODE=true`.

---

## Fail-closed (protección contra envíos accidentales)

Si `EMAIL_TEST_MODE=true` y **`EMAIL_TEST_RECIPIENT` está vacío**:

| Comportamiento | Detalle |
|----------------|---------|
| SMTP | **No se envía** |
| Log BD | `status=SKIPPED`, `provider=test_mode_blocked` |
| Mensaje | `EMAIL_TEST_MODE activo pero EMAIL_TEST_RECIPIENT no configurado` |
| Workflow | **No se rompe** (transiciones institucionales siguen) |
| `POST /email/test` | Responde **422** sin intentar SMTP |

Esto evita que, por error de configuración, lleguen correos a `fabrica@local`, owners reales u otros destinatarios lógicos.

---

## Arquitectura (resumen)

```
Workflows / Projects / Observations
        ↓
NotificationsService (eventos institucionales) ──→ EmailService.sendForNotification
MailService (solicitudes, observaciones)         ──→ EmailService.sendMail
POST /email/test (ADMIN)                       ──→ EmailService.sendMail
        ↓
resolveEffectiveRecipient (override test mode)
        ↓
nodemailer → SMTP → email_delivery_logs
```

- Un solo punto SMTP: `EmailService`.
- `MailService` delega y pasa el **destinatario lógico**; el override lo aplica solo `EmailService`.

---

## Comandos de diagnóstico y QA

Desde `Producto-Backend/`:

```bash
# Ver configuración (sin imprimir contraseñas)
npm run check:email-config

# Probar conexión y autenticación SMTP
npm run check:email-config:verify

# QA modo normal — requiere EMAIL_TEST_RECIPIENT configurado + backend corriendo
npm run qa:email

# QA fail-closed — requiere EMAIL_TEST_RECIPIENT vacío en .env + reiniciar backend
npm run qa:email:fail-closed
```

### Qué valida `qa:email`

- `POST /email/test` → `effectiveRecipient = EMAIL_TEST_RECIPIENT`, `status=SENT` (con SMTP activo)
- Transición institucional → notificación + log con `originalRecipient` lógico y `effectiveRecipient` de prueba
- Workflow no falla si el correo falla

### Qué valida `qa:email:fail-closed`

1. Vaciar `EMAIL_TEST_RECIPIENT` en `.env`
2. Reiniciar backend (`npm run start:dev`)
3. Ejecutar `npm run qa:email:fail-closed`
4. Restaurar `EMAIL_TEST_RECIPIENT` y reiniciar

Esperado: `/email/test` → 422; logs institucionales → `SKIPPED`; workflow OK.

### Prueba manual rápida

```http
POST /email/test
Authorization: Bearer <token admin@local>
Content-Type: application/json

{
  "to": "otro@dominio.com",
  "subject": "Prueba Operación Académica CUN",
  "message": "Correo de prueba."
}
```

Consultar trazas: `GET /email/delivery-logs` (solo ADMIN).

---

## Seguridad

- **No commitear** `.env`, App Passwords ni secretos SMTP.
- `.env.example` solo contiene placeholders vacíos.
- `email_delivery_logs` **no** almacena `SMTP_PASS` ni credenciales.
- En local/dev mantener `EMAIL_TEST_MODE=true` hasta aprobación explícita para producción.

---

## Checklist futuro — activación en producción

Completar **manualmente** antes de `EMAIL_TEST_MODE=false`:

- [ ] Proveedor institucional SMTP/relay **aprobado por IT** (no Gmail personal)
- [ ] Credenciales en secret manager / variables de despliegue (Cloud Run, etc.), no en repo
- [ ] `EMAIL_TEST_MODE=false` solo con **aprobación manual** documentada
- [ ] Usuarios reales en BD con **emails válidos** (no `@local`)
- [ ] Prueba controlada **por rol** (Product, Fábrica, Planeación, LMS) con un subconjunto acotado
- [ ] Monitoreo de `email_delivery_logs`: tasa `SENT` / `FAILED` / `SKIPPED`, alertas en fallos SMTP
- [ ] Revisar `EMAIL_FROM_ADDRESS` institucional (`no-reply@cun.edu.co` o el aprobado)
- [ ] Ejecutar `npm run check:email-config:verify` en el entorno destino
- [ ] Ventana de prueba con rollback plan (`EMAIL_TEST_MODE=true` de nuevo si hay incidente)

---

## Referencias

- Plantilla institucional: `src/email/templates/institutional-notification.template.ts`
- Servicio central: `src/email/email.service.ts`
- Resolución de destinatarios institucionales: `src/email/recipient-resolver.ts`
- Migración logs: `src/database/migrations/20260529120000-email-delivery-logs.ts`

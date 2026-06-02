/**
 * QA: correos institucionales en modo prueba seguro.
 * Ejecutar:
 *   node scripts/qa-email-notifications.mjs           # flujo normal (EMAIL_TEST_RECIPIENT requerido)
 *   node scripts/qa-email-notifications.mjs --fail-closed  # fail-closed (EMAIL_TEST_RECIPIENT vacío + backend reiniciado)
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAIL_CLOSED_MODE = process.argv.includes('--fail-closed');

function loadEnvFile() {
  try {
    const envPath = resolve(__dirname, '../.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  } catch {
    // .env opcional si vars ya están en el entorno
  }
}

loadEnvFile();

const BASE = process.env.API_BASE ?? 'http://localhost:3000';
const TEST_RECIPIENT = (process.env.EMAIL_TEST_RECIPIENT ?? '').trim();
const EMAIL_ENABLED = (process.env.EMAIL_ENABLED ?? 'false').toLowerCase() === 'true';
const EMAIL_PROVIDER = (() => {
  const p = (process.env.EMAIL_PROVIDER ?? '').trim().toLowerCase();
  if (p === 'log' || p === 'smtp') return p;
  return (process.env.EMAIL_TRANSPORT ?? 'smtp').toLowerCase() === 'log' ? 'log' : 'smtp';
})();
const EXPECT_REAL_SEND = EMAIL_ENABLED && EMAIL_PROVIDER === 'smtp';
const TEST_MODE = (process.env.EMAIL_TEST_MODE ?? 'true').toLowerCase() === 'true';

const results = [];
function pass(step, detail) {
  results.push({ step, ok: true, detail });
  console.log(`✓ ${step}: ${detail}`);
}
function fail(step, detail) {
  results.push({ step, ok: false, detail });
  console.error(`✗ ${step}: ${detail}`);
}

async function api(method, path, token, body, expectError = false) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!expectError && !res.ok) {
    const msg = typeof data === 'object' ? JSON.stringify(data) : text;
    throw new Error(`${method} ${path} → ${res.status}: ${msg}`);
  }
  return { status: res.status, data };
}

async function login(email, password) {
  const { data } = await api('POST', '/auth/login', null, { email, password });
  return data.accessToken;
}

async function runInstitutionalTransition(adminToken, factoryToken) {
  const ts = Date.now();
  const productToken = await login('product@local', process.env.SEED_PRODUCT_PASSWORD ?? 'Product123!');
  const planningToken = await login('planeacion@local', process.env.SEED_PLANEACION_PASSWORD ?? 'Planeacion123!');

  const { data: project } = await api('POST', '/projects', productToken, {
    school: 'Escuela QA Email',
    program: `QA Email ${ts}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    expectedDeliveryDate: '2026-09-15T00:00:00.000Z',
    syllabus: { hasSyllabus: true, url: 'https://example.com/syllabus.pdf' },
    semesters: [{ semesterNumber: 1, subjects: [{ name: 'QA Email Materia A' }] }],
  });

  const { data: detail } = await api('GET', `/projects/${project.id}`, productToken);
  const sem1 = detail.semesters?.find((s) => s.semesterNumber === 1);
  if (!sem1?.id) throw new Error('Semestre no creado');

  if (detail.subjectMatterExpertStatus !== 'READY') {
    await api('PATCH', `/projects/${project.id}/subject-matter-expert`, productToken, { status: 'READY' });
  }

  await api('POST', `/semesters/${sem1.id}/operational-transitions`, planningToken, {
    action: 'PLANNING_VALIDATE_INITIAL',
    comment: 'QA email — validación inicial semestre',
  });
  pass('transition', `Semestre ${sem1.id} validado (workflow OK)`);

  const { data: notifications } = await api('GET', '/notifications?limit=50', factoryToken);
  const items = notifications.items ?? notifications;
  const institutional = Array.isArray(items)
    ? items.find((n) => n.eventType === 'INSTITUTIONAL_PLANNING_VALIDATED_INITIAL' && n.projectId === project.id)
    : null;

  if (institutional) {
    pass('notification', `Notificación ${institutional.id} (rol Fábrica)`);
  } else {
    fail('notification', 'No se encontró INSTITUTIONAL_PLANNING_VALIDATED_INITIAL');
  }

  await new Promise((r) => setTimeout(r, 5000));

  const { data: logs } = await api('GET', '/email/delivery-logs?limit=50', adminToken);
  const deliveryItems = logs.items ?? [];
  const institutionalLog = deliveryItems.find(
    (log) =>
      log.eventType === 'INSTITUTIONAL_PLANNING_VALIDATED_INITIAL' &&
      (log.metadata?.projectId === project.id ||
        log.notificationId === institutional?.id ||
        log.metadata?.notificationId === institutional?.id),
  );

  return { project, institutional, institutionalLog };
}

async function runNormalSuite() {
  console.log('=== QA email — modo normal (EMAIL_TEST_RECIPIENT configurado) ===\n');
  pass('0-config', `EMAIL_TEST_MODE=${TEST_MODE} EMAIL_TEST_RECIPIENT=${TEST_RECIPIENT}`);

  if (!TEST_RECIPIENT) {
    fail('0-config', 'EMAIL_TEST_RECIPIENT requerido. Use --fail-closed para probar fail-closed.');
    process.exit(1);
  }

  const adminToken = await login('admin@local', process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');
  const factoryToken = await login('fabrica@local', process.env.SEED_FABRICA_PASSWORD ?? 'Fabrica123!');

  let testResult;
  try {
    const { data } = await api('POST', '/email/test', adminToken, {
      to: 'otro@dominio.com',
      subject: 'Prueba Operación Académica CUN',
      message: 'Este es un correo de prueba.',
    });
    testResult = data;
  } catch (error) {
    fail('1-email-test', error instanceof Error ? error.message : String(error));
    testResult = null;
  }

  if (testResult) {
    if (testResult.effectiveRecipient === TEST_RECIPIENT && testResult.originalRecipient === 'otro@dominio.com') {
      if (EXPECT_REAL_SEND && testResult.status === 'SENT') {
        pass('1-email-test', `SENT effective=${testResult.effectiveRecipient} original=${testResult.originalRecipient}`);
      } else if (!EXPECT_REAL_SEND) {
        pass('1-email-test', `status=${testResult.status} effective=${testResult.effectiveRecipient}`);
      } else {
        fail('1-email-test', `status=${testResult.status} (esperado SENT)`);
      }
    } else {
      fail('1-email-test', JSON.stringify(testResult));
    }
  }

  const { institutionalLog } = await runInstitutionalTransition(adminToken, factoryToken);

  if (institutionalLog) {
    if (institutionalLog.effectiveRecipient === TEST_RECIPIENT) {
      if (institutionalLog.originalRecipient && institutionalLog.originalRecipient !== TEST_RECIPIENT) {
        pass(
          '4-traceability',
          `original=${institutionalLog.originalRecipient} effective=${institutionalLog.effectiveRecipient} status=${institutionalLog.status}`,
        );
      } else if (institutionalLog.originalRecipient === TEST_RECIPIENT) {
        pass('4-traceability', `original=effective (seed/legacy coincide con prueba) status=${institutionalLog.status}`);
      } else {
        fail('4-traceability', `originalRecipient vacío o inválido: ${JSON.stringify(institutionalLog)}`);
      }
      if (EXPECT_REAL_SEND && institutionalLog.status !== 'SENT') {
        fail('4-status', `status=${institutionalLog.status} (esperado SENT con SMTP activo)`);
      } else {
        pass('4-status', `status=${institutionalLog.status}`);
      }
    } else {
      fail('4-traceability', `effective=${institutionalLog.effectiveRecipient} (esperado ${TEST_RECIPIENT})`);
    }
  } else {
    fail('4-traceability', 'Sin log institucional en email_delivery_logs');
  }
}

async function runFailClosedSuite() {
  console.log('=== QA email — fail-closed (EMAIL_TEST_RECIPIENT vacío) ===\n');
  pass('fc-config', `EMAIL_TEST_MODE=${TEST_MODE} EMAIL_TEST_RECIPIENT=${TEST_RECIPIENT || '(vacío)'}`);

  if (TEST_RECIPIENT) {
    fail(
      'fc-config',
      'Vacíe EMAIL_TEST_RECIPIENT en .env, reinicie el backend y vuelva a ejecutar con --fail-closed',
    );
    process.exit(1);
  }

  if (!TEST_MODE) {
    fail('fc-config', 'EMAIL_TEST_MODE debe ser true para esta prueba');
    process.exit(1);
  }

  const adminToken = await login('admin@local', process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!');
  const factoryToken = await login('fabrica@local', process.env.SEED_FABRICA_PASSWORD ?? 'Fabrica123!');

  const testRes = await api(
    'POST',
    '/email/test',
    adminToken,
    { to: 'otro@dominio.com', subject: 'Fail-closed', message: 'No debe enviarse' },
    true,
  );

  if (testRes.status === 422 || testRes.status === 400) {
    pass('fc-email-test', `POST /email/test rechazado con ${testRes.status} (sin SMTP)`);
  } else {
    fail('fc-email-test', `Esperado 422/400, obtenido ${testRes.status}: ${JSON.stringify(testRes.data)}`);
  }

  const { institutionalLog } = await runInstitutionalTransition(adminToken, factoryToken);

  if (institutionalLog?.status === 'SKIPPED') {
    const reason = institutionalLog.errorMessage ?? '';
    if (reason.includes('EMAIL_TEST_MODE activo')) {
      pass('fc-institutional-log', `SKIPPED sin SMTP — ${reason.slice(0, 80)}`);
    } else {
      fail('fc-institutional-log', `SKIPPED pero reason inesperado: ${reason}`);
    }
    if (institutionalLog.effectiveRecipient === institutionalLog.originalRecipient) {
      pass('fc-no-override', `effective=original=${institutionalLog.originalRecipient} (sin envío real)`);
    }
  } else {
    fail('fc-institutional-log', institutionalLog ? JSON.stringify(institutionalLog) : 'Sin log institucional');
  }

  pass('fc-workflow', 'Transición institucional completada sin error');
}

async function main() {
  if (FAIL_CLOSED_MODE) {
    await runFailClosedSuite();
  } else {
    await runNormalSuite();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- QA email: ${results.length - failed.length}/${results.length} OK ---`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

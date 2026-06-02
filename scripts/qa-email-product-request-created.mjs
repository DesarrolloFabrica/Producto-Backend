/**
 * Prueba controlada: creación de solicitud → correo PRODUCT_REQUEST_CREATED en modo prueba.
 * Ejecutar: node scripts/qa-email-product-request-created.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.API_BASE ?? 'http://localhost:3000';

function loadEnvFile() {
  const envPath = resolve(__dirname, '../.env');
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile();

const TEST_RECIPIENT = (process.env.EMAIL_TEST_RECIPIENT ?? '').trim();
const FROM_ADDRESS = (process.env.EMAIL_FROM_ADDRESS ?? 'desarrollofabrica@cun.edu.co').trim();
const FROM_NAME = (process.env.EMAIL_FROM_NAME ?? 'Operación Académica CUN').trim();
const INSTITUTIONAL_RECIPIENT = 'desarrollofabrica@cun.edu.co';
const ALLOWED_DOMAIN = (process.env.EMAIL_ALLOWED_DOMAIN ?? 'cun.edu.co').toLowerCase();
const EXPECTED_FROM = `"${FROM_NAME}" <${FROM_ADDRESS}>`;

async function api(method, path, token, body) {
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
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : text}`);
  }
  return data;
}

async function main() {
  console.log('=== Prueba PRODUCT_REQUEST_CREATED (modo prueba) ===');
  console.log(`EMAIL_TEST_RECIPIENT: ${TEST_RECIPIENT}`);
  if (!TEST_RECIPIENT.endsWith(`@${ALLOWED_DOMAIN}`)) {
    console.warn('⚠ EMAIL_TEST_RECIPIENT no es @cun.edu.co — reinicie el backend tras cambiar .env');
  }

  const { accessToken: productToken } = await api('POST', '/auth/dev/email', null, {
    email: 'jose_camachoc@cun.edu.co',
  });
  const { accessToken: adminToken } = await api('POST', '/auth/dev/email', null, {
    email: 'desarrollofabrica@cun.edu.co',
  });

  const ts = Date.now();
  const project = await api('POST', '/projects', productToken, {
    school: 'Escuela QA Email CUN',
    program: `QA Solicitud CUN ${ts}`,
    modality: 'VIRTUAL',
    subjectMatterExpertType: 'INTERNAL',
    requestType: 'NUEVO',
    priority: 'MEDIUM',
    expectedDeliveryDate: '2026-09-15T00:00:00.000Z',
    syllabus: { hasSyllabus: false },
    semesters: [
      {
        semesterNumber: 1,
        subjects: [{ name: `Asignatura QA ${ts}` }],
      },
    ],
  });

  console.log(`✓ Proyecto creado: ${project.id} — ${project.program}`);
  console.log('  Esperando envío async de correo...');
  await new Promise((r) => setTimeout(r, 8000));

  const logs = await api('GET', '/email/delivery-logs?limit=20', adminToken);
  const match =
    logs.items?.find(
      (item) =>
        item.eventType === 'PRODUCT_REQUEST_CREATED' &&
        item.metadata?.projectId === project.id,
    ) ??
    logs.items?.find(
      (item) =>
        item.eventType === 'PRODUCT_REQUEST_CREATED' &&
        item.subject?.includes(String(ts)),
    );

  if (!match) {
    const recent = logs.items?.filter((i) => i.eventType === 'PRODUCT_REQUEST_CREATED') ?? [];
    console.error('✗ No se encontró log PRODUCT_REQUEST_CREATED para el proyecto');
    console.log('  Últimos logs PRODUCT_REQUEST_CREATED:', JSON.stringify(recent.slice(0, 3), null, 2));
    process.exit(1);
  }

  console.log('\n=== email_delivery_logs ===');
  console.log(`  eventType:           ${match.eventType}`);
  console.log(`  originalRecipient:   ${match.originalRecipient}`);
  console.log(`  effectiveRecipient:  ${match.effectiveRecipient}`);
  console.log(`  fromAddress:         ${match.metadata?.fromAddress ?? '(no registrado)'}`);
  console.log(`  createdByName:       ${match.metadata?.createdByName ?? '(no registrado)'}`);
  console.log(`  createdByEmail:      ${match.metadata?.createdByEmail ?? '(no registrado)'}`);
  console.log(`  status:              ${match.status}`);
  console.log(`  provider:            ${match.provider}`);

  const checks = [
    ['eventType PRODUCT_REQUEST_CREATED', match.eventType === 'PRODUCT_REQUEST_CREATED'],
    [`originalRecipient = ${INSTITUTIONAL_RECIPIENT}`, match.originalRecipient === INSTITUTIONAL_RECIPIENT],
    ['effectiveRecipient = TEST_RECIPIENT', match.effectiveRecipient === TEST_RECIPIENT],
    [`fromAddress institucional (${FROM_ADDRESS})`, match.metadata?.fromAddress === EXPECTED_FROM],
    ['createdByName presente', Boolean(match.metadata?.createdByName)],
    ['createdByEmail presente', Boolean(match.metadata?.createdByEmail)],
    ['correo incluye "Creado por"', match.metadata?.emailIncludesCreatedBy === true],
    ['status SENT', match.status === 'SENT'],
    ['creador no es destinatario', match.originalRecipient !== match.metadata?.createdByEmail],
  ];

  console.log('\n=== Validaciones ===');
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? '✓' : '✗'} ${label}`);
    if (!pass) ok = false;
  }

  if (!ok) process.exit(1);
  console.log(`\n✓ Correo enviado a ${TEST_RECIPIENT} (revisar bandeja de entrada).\n`);
}

main().catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});

/**
 * QA: simulación de envío real (EMAIL_TEST_MODE=false) sin SMTP.
 * Audita usuarios, owners de proyectos y resolución de destinatarios por evento.
 *
 * Ejecutar: npm run qa:email:real-dry-run
 * Opcional: npm run qa:email:real-dry-run -- --json  (salida JSON)
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_OUTPUT = process.argv.includes('--json');

const REAL_MODE_BLOCK_REASON = 'Destinatario no institucional o inválido para envío real';

const INSTITUTIONAL_EMAIL_EVENTS = [
  'INSTITUTIONAL_PLANNING_VALIDATED_INITIAL',
  'INSTITUTIONAL_FACTORY_DELIVERED',
  'INSTITUTIONAL_PLANNING_VALIDATED_PRODUCTION',
  'INSTITUTIONAL_LMS_UPLOAD_COMPLETED',
  'INSTITUTIONAL_PLANNING_VALIDATED_LMS',
  'INSTITUTIONAL_PRODUCT_APPROVED_ACADEMIC',
  'INSTITUTIONAL_PRODUCT_REQUESTED_CHANGES',
  'INSTITUTIONAL_RETURNED_TO_PRODUCT',
  'INSTITUTIONAL_RETURNED_TO_FACTORY',
  'INSTITUTIONAL_RETURNED_TO_LMS',
  'INSTITUTIONAL_FINALIZED',
  'PROJECT_READY_FOR_RADICATION',
  'PLANNING_RADICATION_VALIDATED',
  'PLANNING_RADICATION_RETURNED',
  'PROJECT_FINALIZED',
];

const MAIL_SERVICE_EVENTS = [
  { eventType: 'PRODUCT_REQUEST_CREATED', roleFallback: 'FABRICA', ownerField: 'factoryOwnerEmail' },
  { eventType: 'PROJECT_MODIFIED', roleFallback: 'PLANEACION', ownerField: 'factoryOwnerEmail' },
  { eventType: 'OBSERVATION_BATCH_SENT', roleFallback: 'FABRICA', ownerField: 'factoryOwnerEmail' },
  { eventType: 'CORRECTION_BATCH_NOTIFIED', roleFallback: 'PRODUCT', ownerField: 'productOwnerEmail' },
];

const ROLE_TARGETS = ['PRODUCT', 'FABRICA', 'PLANEACION', 'LMS', 'ADMIN'];

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
    // .env opcional
  }
}

function env(key, fallback = '') {
  return (process.env[key] ?? fallback).trim();
}

function getAllowedDomain() {
  return (env('EMAIL_ALLOWED_DOMAIN', 'cun.edu.co') || 'cun.edu.co').toLowerCase();
}

function isBlockLocal() {
  return (env('EMAIL_BLOCK_LOCAL_RECIPIENTS', 'true') || 'true').toLowerCase() === 'true';
}

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function classifyEmail(email) {
  const trimmed = (email ?? '').trim().toLowerCase();
  if (!trimmed) return 'empty';
  if (trimmed.endsWith('@local')) return 'local';
  if (!EMAIL_FORMAT_RE.test(trimmed)) return 'invalid_format';
  if (trimmed.endsWith(`@${getAllowedDomain()}`)) return 'institutional';
  return 'non_institutional';
}

function getRealModeBlockReason(email) {
  const trimmed = (email ?? '').trim();
  if (!trimmed || trimmed === 'unknown' || trimmed.startsWith('role:')) {
    return REAL_MODE_BLOCK_REASON;
  }
  if (!EMAIL_FORMAT_RE.test(trimmed)) return REAL_MODE_BLOCK_REASON;
  if (isBlockLocal() && trimmed.toLowerCase().endsWith('@local')) return REAL_MODE_BLOCK_REASON;
  if (!trimmed.toLowerCase().endsWith(`@${getAllowedDomain()}`)) return REAL_MODE_BLOCK_REASON;
  return null;
}

function simulateSend(originalRecipient, testMode) {
  const testRecipient = env('EMAIL_TEST_RECIPIENT');
  if (testMode) {
    if (!testRecipient) {
      return { action: 'SKIPPED', effectiveRecipient: originalRecipient, reason: 'EMAIL_TEST_MODE sin EMAIL_TEST_RECIPIENT' };
    }
    return { action: 'SENT_TO_TEST', effectiveRecipient: testRecipient, reason: null };
  }
  const blockReason = getRealModeBlockReason(originalRecipient);
  if (blockReason) {
    return { action: 'SKIPPED', effectiveRecipient: originalRecipient, reason: blockReason };
  }
  return { action: 'WOULD_SEND_REAL', effectiveRecipient: originalRecipient, reason: null };
}

function resolveByRole(users, role) {
  return users
    .filter((u) => u.role === role && u.status === 'ACTIVE' && classifyEmail(u.email) === 'institutional')
    .map((u) => u.email)
    .sort((a, b) => a.localeCompare(b));
}

function resolveMailRecipient(users, projects, evt) {
  const sample = projects.find((p) => p[evt.ownerField]);
  const ownerEmail = sample?.[evt.ownerField];
  if (ownerEmail && classifyEmail(ownerEmail) === 'institutional') {
    return { email: ownerEmail, source: `${evt.ownerField} (${sample.program})` };
  }
  const byRole = resolveByRole(users, evt.roleFallback);
  if (byRole[0]) {
    return { email: byRole[0], source: `rol ${evt.roleFallback}` };
  }
  return { email: null, source: `sin destinatario (${evt.roleFallback})` };
}

function resolveByUserId(users, userId) {
  const user = users.find((u) => u.id === userId && u.status === 'ACTIVE');
  return user?.email ? [user.email] : [];
}

function printSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(title);
  console.log('='.repeat(60));
}

loadEnvFile();

const testMode = (env('EMAIL_TEST_MODE', 'true') || 'true').toLowerCase() === 'true';
const allowedDomain = getAllowedDomain();

async function main() {
  const dbUrl = env('DATABASE_URL');
  if (!dbUrl) {
    console.error('✗ DATABASE_URL no configurado');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: users } = await client.query(
    `SELECT id, email, role, status, name FROM users ORDER BY role, email`,
  );

  const { rows: projects } = await client.query(`
    SELECT
      p.id,
      p.program,
      p.status,
      po.email AS "productOwnerEmail",
      po.role AS "productOwnerRole",
      po.status AS "productOwnerStatus",
      fo.email AS "factoryOwnerEmail",
      fo.role AS "factoryOwnerRole",
      fo.status AS "factoryOwnerStatus"
    FROM projects p
    LEFT JOIN users po ON po.id = p."productOwnerId"
    LEFT JOIN users fo ON fo.id = p."factoryOwnerId"
    ORDER BY p."createdAt" DESC
    LIMIT 50
  `);

  await client.end();

  const report = {
    generatedAt: new Date().toISOString(),
    config: {
      EMAIL_ENABLED: env('EMAIL_ENABLED', 'false'),
      EMAIL_TEST_MODE: testMode,
      EMAIL_ALLOWED_DOMAIN: allowedDomain,
      EMAIL_BLOCK_LOCAL_RECIPIENTS: isBlockLocal(),
      EMAIL_TEST_RECIPIENT: env('EMAIL_TEST_RECIPIENT') ? '(configurado)' : '(vacío)',
    },
    users: { total: users.length, byCategory: {}, list: [] },
    projectOwners: { total: projects.length, invalidOwners: [] },
    roleRecipients: {},
    institutionalEvents: [],
    mailServiceEvents: [],
    risks: [],
    recommendations: [],
  };

  const categories = { institutional: [], local: [], non_institutional: [], invalid_format: [], empty: [] };

  for (const user of users) {
    const category = classifyEmail(user.email);
    categories[category].push(user);
    report.users.list.push({
      email: user.email,
      role: user.role,
      status: user.status,
      name: user.name,
      category,
      realModeBlocked: Boolean(getRealModeBlockReason(user.email)),
    });
  }
  report.users.byCategory = Object.fromEntries(
    Object.entries(categories).map(([k, v]) => [k, v.length]),
  );

  const invalidOwners = [];
  for (const p of projects) {
    for (const [label, email, role, status] of [
      ['productOwner', p.productOwnerEmail, p.productOwnerRole, p.productOwnerStatus],
      ['factoryOwner', p.factoryOwnerEmail, p.factoryOwnerRole, p.factoryOwnerStatus],
    ]) {
      if (!email) continue;
      const cat = classifyEmail(email);
      if (cat !== 'institutional') {
        invalidOwners.push({
          projectId: p.id,
          program: p.program,
          ownerType: label,
          email,
          role,
          status,
          category: cat,
        });
      }
    }
  }
  report.projectOwners.invalidOwners = invalidOwners;

  for (const role of ROLE_TARGETS) {
    const institutional = resolveByRole(users, role);
    const primary = institutional[0] ?? null;
    report.roleRecipients[role] = {
      institutional,
      primaryRecipient: primary,
      realMode: primary ? simulateSend(primary, false) : { action: 'SKIPPED', reason: 'Sin destinatario institucional' },
      testMode: primary ? simulateSend(primary, true) : { action: 'SKIPPED', reason: 'Sin destinatario institucional' },
    };
  }

  for (const eventType of INSTITUTIONAL_EMAIL_EVENTS) {
    for (const role of ['FABRICA', 'PRODUCT', 'PLANEACION', 'LMS']) {
      const recipients = resolveByRole(users, role);
      const original = recipients[0] ?? `role:${role}:${eventType}`;
      const sim = simulateSend(original, false);
      report.institutionalEvents.push({
        eventType,
        roleTarget: role,
        originalRecipient: original,
        effectiveRecipient: sim.effectiveRecipient,
        action: sim.action,
        reason: sim.reason,
      });
    }
  }

  for (const evt of MAIL_SERVICE_EVENTS) {
    const resolved = resolveMailRecipient(users, projects, evt);
    const original = resolved.email ?? `(sin destinatario ${evt.roleFallback})`;
    const simReal = resolved.email ? simulateSend(resolved.email, false) : { action: 'SKIPPED', effectiveRecipient: original, reason: 'Sin destinatario institucional válido' };
    const simTest = resolved.email ? simulateSend(resolved.email, true) : { action: 'SKIPPED', effectiveRecipient: original, reason: 'Sin destinatario institucional válido' };
    report.mailServiceEvents.push({
      eventType: evt.eventType,
      resolvedFrom: resolved.source,
      originalRecipient: original,
      testMode: simTest,
      realMode: simReal,
    });
  }

  if (categories.local.some((u) => u.status === 'ACTIVE')) {
    report.risks.push(
      `${categories.local.filter((u) => u.status === 'ACTIVE').length} usuario(s) ACTIVE con correo @local — bloqueados en modo real.`,
    );
  }
  if (categories.non_institutional.length > 0) {
    report.risks.push(
      `${categories.non_institutional.length} usuario(s) con dominio distinto a @${allowedDomain}.`,
    );
  }
  if (invalidOwners.length > 0) {
    report.risks.push(
      `${invalidOwners.length} owner(s) de proyecto con correo no institucional — observaciones/correcciones no llegarían en modo real.`,
    );
  }
  if (!categories.institutional.some((u) => u.status === 'ACTIVE')) {
    report.risks.push('No hay usuarios ACTIVE con correo @cun.edu.co — ningún evento por rol enviaría correo real.');
  }
  const rolesWithoutInstitutional = ROLE_TARGETS.filter((r) => report.roleRecipients[r].institutional.length === 0);
  if (rolesWithoutInstitutional.length) {
    report.risks.push(`Roles sin destinatario institucional ACTIVE: ${rolesWithoutInstitutional.join(', ')}`);
  }
  const gmailNotify = env('PRODUCT_REQUEST_NOTIFY_EMAIL');
  if (gmailNotify && classifyEmail(gmailNotify) !== 'institutional') {
    report.risks.push(`PRODUCT_REQUEST_NOTIFY_EMAIL=${gmailNotify} — remover; MailService ya no lo usa.`);
  }

  report.recommendations = [
    'Mantener EMAIL_TEST_MODE=true hasta validar manualmente template, logs y correo recibido.',
    `Todos los roles con usuario ACTIVE @${allowedDomain}.`,
    'EMAIL_TEST_RECIPIENT=zuany_acuna@cun.edu.co para pruebas controladas.',
    'Tras aprobación: EMAIL_TEST_MODE=false (envío real a destinatarios lógicos @cun.edu.co).',
  ];

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.risks.length ? 1 : 0);
  }

  printSection('CONFIGURACIÓN ACTUAL (sin cambios aplicados)');
  for (const [k, v] of Object.entries(report.config)) {
    console.log(`  ${k}: ${v}`);
  }
  console.log(`  Modo actual .env: EMAIL_TEST_MODE=${testMode}`);
  console.log(`  Simulación adicional: destinatarios lógicos en modo real (sin SMTP)`);

  printSection(`AUDITORÍA DE USUARIOS (${users.length} total)`);
  const activeLocal = categories.local.filter((u) => u.status === 'ACTIVE');
  if (activeLocal.length) {
    console.log(`  ⚠ ${activeLocal.length} usuario(s) @local aún ACTIVE (ejecute npm run db:deactivate-local-users)`);
  }
  console.log(`  @${allowedDomain} (institucionales): ${categories.institutional.length}`);
  console.log(`  @local:                        ${categories.local.length}`);
  console.log(`  otro dominio:                  ${categories.non_institutional.length}`);
  console.log(`  formato inválido:              ${categories.invalid_format.length}`);
  console.log('');
  console.log('  Detalle:');
  for (const u of report.users.list) {
    const flag = u.realModeBlocked ? '⛔ BLOQUEADO' : '✓ OK';
    console.log(`    ${flag}  ${u.email.padEnd(35)} ${u.role.padEnd(12)} ${u.status}`);
  }

  if (categories.institutional.length) {
    printSection('DESTINATARIOS REALES DETECTADOS (@cun.edu.co)');
    for (const u of categories.institutional) {
      console.log(`  ${u.email}  (${u.role}, ${u.status}) — ${u.name}`);
    }
  }

  if (categories.local.length || categories.non_institutional.length) {
    printSection('DESTINATARIOS INVÁLIDOS PARA MODO REAL');
    for (const u of [...categories.local, ...categories.non_institutional, ...categories.invalid_format]) {
      console.log(`  ⛔ ${u.email}  (${u.role}, ${u.status}) — ${classifyEmail(u.email)}`);
    }
  }

  printSection('DESTINATARIOS POR ROL');
  for (const role of ROLE_TARGETS) {
    const r = report.roleRecipients[role];
    console.log(`  ${role}:`);
    console.log(`    Institucionales ACTIVE: ${r.institutional.join(', ') || '(ninguno)'}`);
    if (r.primaryRecipient) {
      console.log(`    Modo prueba → ${r.testMode.action}: original=${r.primaryRecipient} effective=${r.testMode.effectiveRecipient ?? env('EMAIL_TEST_RECIPIENT')}`);
      console.log(`    Modo real   → ${r.realMode.action}: ${r.primaryRecipient}`);
    } else {
      console.log(`    ⛔ Sin destinatario institucional`);
    }
  }

  printSection('EVENTOS INSTITUCIONALES — muestra por rol primario');
  const seen = new Set();
  for (const evt of report.institutionalEvents) {
    const key = `${evt.eventType}:${evt.roleTarget}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (evt.roleTarget !== 'FABRICA' && evt.roleTarget !== 'PRODUCT') continue;
    console.log(`  ${evt.eventType}`);
    console.log(`    rol=${evt.roleTarget} → ${evt.action}: ${evt.originalRecipient}${evt.reason ? ` | ${evt.reason}` : ''}`);
  }
  console.log(`  (... ${INSTITUTIONAL_EMAIL_EVENTS.length} tipos de evento × roles; ver --json para detalle completo)`);

  printSection('EVENTOS MailService (solicitudes / observaciones)');
  for (const evt of report.mailServiceEvents) {
    console.log(`  ${evt.eventType} (${evt.resolvedFrom})`);
    console.log(`    original=${evt.originalRecipient}`);
    console.log(`    testMode → ${evt.testMode.action} effective=${evt.testMode.effectiveRecipient ?? '—'}`);
    console.log(`    realMode → ${evt.realMode.action}${evt.realMode.reason ? ` (${evt.realMode.reason})` : ''}`);
  }

  if (invalidOwners.length) {
    printSection('OWNERS DE PROYECTO NO INSTITUCIONALES (muestra)');
    for (const o of invalidOwners.slice(0, 15)) {
      console.log(`  ${o.program}: ${o.ownerType}=${o.email} (${o.category})`);
    }
    if (invalidOwners.length > 15) console.log(`  ... y ${invalidOwners.length - 15} más`);
  }

  printSection('RIESGOS');
  if (report.risks.length === 0) {
    console.log('  (ninguno crítico detectado)');
  } else {
    for (const r of report.risks) console.log(`  ⚠ ${r}`);
  }

  printSection('CONFIGURACIÓN RECOMENDADA (activación controlada — NO aplicada)');
  console.log(`
  EMAIL_ENABLED=true
  EMAIL_PROVIDER=smtp
  EMAIL_TEST_MODE=true          ← mantener hasta corregir usuarios y aprobar
  EMAIL_TEST_RECIPIENT=zuany_acuna@cun.edu.co
  EMAIL_ALLOWED_DOMAIN=cun.edu.co
  EMAIL_BLOCK_LOCAL_RECIPIENTS=true
  # Tras revisión manual:
  # EMAIL_TEST_MODE=false
  `);

  for (const rec of report.recommendations) {
    console.log(`  • ${rec}`);
  }

  console.log('\n✓ Dry-run completado — no se envió ningún correo SMTP.\n');
  process.exit(report.risks.length ? 1 : 0);
}

main().catch((err) => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});

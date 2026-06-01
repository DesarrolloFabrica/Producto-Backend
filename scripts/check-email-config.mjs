/**
 * Diagnóstico de configuración SMTP (sin imprimir contraseñas).
 * Ejecutar: node scripts/check-email-config.mjs
 * Opcional: node scripts/check-email-config.mjs --verify
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const nodemailer = require('nodemailer');

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFY = process.argv.includes('--verify');

const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE'];
const LEGACY_KEYS = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_SECURE', 'EMAIL_TRANSPORT', 'EMAIL_FROM'];
const EMAIL_ADDR_KEYS = ['SMTP_USER', 'EMAIL_FROM_ADDRESS', 'EMAIL_TEST_RECIPIENT', 'EMAIL_USER'];

function parseEnvFileRaw() {
  const envPath = resolve(__dirname, '../.env');
  const content = readFileSync(envPath, 'utf8');
  const entries = [];
  const keyCounts = new Map();

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
    entries.push({ key, val, line: trimmed });
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    process.env[key] = val;
  }

  return { envPath, entries, keyCounts };
}

function env(key, fallback = '') {
  return (process.env[key] ?? fallback).trim();
}

function yesNo(value) {
  return value ? 'sí' : 'no';
}

function maskEmail(email) {
  if (!email) return '(no configurado)';
  const at = email.indexOf('@');
  if (at <= 0) return '(formato inválido)';
  return `${email.slice(0, 3)}***@${email.slice(at + 1)}`;
}

function looksLikeMarkdownEmail(value) {
  return /\[.+?\]\(mailto:.+?\)/.test(value) || value.includes('mailto:');
}

function isPlainEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveProvider() {
  const provider = env('EMAIL_PROVIDER').toLowerCase();
  if (provider === 'log' || provider === 'smtp') return provider;
  return env('EMAIL_TRANSPORT', 'smtp').toLowerCase() === 'log' ? 'log' : 'smtp';
}

function resolveSmtpConfig() {
  const smtpUser = env('SMTP_USER');
  const smtpPass = env('SMTP_PASS');
  const emailUser = env('EMAIL_USER');
  const emailPass = env('EMAIL_PASSWORD');

  return {
    host: env('SMTP_HOST') || env('EMAIL_HOST'),
    port: Number(env('SMTP_PORT') || env('EMAIL_PORT') || '587'),
    secure: (env('SMTP_SECURE') || env('EMAIL_SECURE') || 'false').toLowerCase() === 'true',
    user: smtpUser || emailUser,
    pass: smtpPass || emailPass,
    sources: {
      host: env('SMTP_HOST') ? 'SMTP_HOST' : env('EMAIL_HOST') ? 'EMAIL_HOST (legacy)' : null,
      user: smtpUser ? 'SMTP_USER' : emailUser ? 'EMAIL_USER (legacy)' : null,
      pass: smtpPass ? 'SMTP_PASS' : emailPass ? 'EMAIL_PASSWORD (legacy)' : null,
    },
  };
}

function analyzeEnvFile(keyCounts, entries) {
  const duplicates = [...keyCounts.entries()].filter(([, count]) => count > 1);
  const legacyPresent = LEGACY_KEYS.filter((k) => keyCounts.has(k));
  const smtpPresent = SMTP_KEYS.filter((k) => keyCounts.has(k));

  const markdownIssues = [];
  for (const key of EMAIL_ADDR_KEYS) {
    const val = env(key);
    if (val && looksLikeMarkdownEmail(val)) {
      markdownIssues.push(`${key} contiene formato Markdown/link — use email plano (ej. usuario@cun.edu.co)`);
    }
  }
  if (env('SMTP_USER') && looksLikeMarkdownEmail(env('SMTP_USER'))) {
    markdownIssues.push('SMTP_USER contiene Markdown — Gmail recibirá un username inválido → 535 BadCredentials');
  }

  return { duplicates, legacyPresent, smtpPresent, markdownIssues };
}

function analyzeCredentials(smtp) {
  const notes = [];
  const pass = smtp.pass;
  const user = smtp.user;

  if (pass) {
    notes.push(`SMTP_PASS longitud: ${pass.length} caracteres (esperado: 16 para App Password Google)`);
    if (/\s/.test(pass)) {
      notes.push('⚠ SMTP_PASS contiene espacios — quítelos (Google muestra "abcd efgh..." → .env: abcdefgh...)');
    }
    if (pass.length !== 16 && !/\s/.test(pass)) {
      notes.push('⚠ SMTP_PASS no tiene 16 caracteres — puede ser contraseña normal en lugar de App Password');
    }
  }

  if (user) {
    if (/\s/.test(user)) notes.push('⚠ SMTP_USER contiene espacios');
    if (!isPlainEmail(user)) notes.push(`⚠ SMTP_USER no parece email válido: "${user.slice(0, 20)}..."`);
    if (user.endsWith('@cun.edu.co') && smtp.host === 'smtp.gmail.com') {
      notes.push('Cuenta @cun.edu.co → verifique que sea Google Workspace (no Microsoft 365) con App Passwords habilitadas');
    }
  }

  return notes;
}

function formatSmtpError(error, config) {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();
  const base = `SMTP error [host=${config.host} port=${config.port} secure=${config.secure} user=${maskEmail(config.user)}]: ${raw}`;

  if (looksLikeMarkdownEmail(config.user ?? '')) {
    return `${base}\n→ CAUSA PROBABLE: SMTP_USER tiene formato Markdown/link en .env. Debe ser: SMTP_USER=desarrollofabrica@cun.edu.co`;
  }
  if (lower.includes('smtpclientauthentication is disabled') || lower.includes('smtp_auth_disabled')) {
    return `${base}\n→ Cuenta Microsoft 365 o Google Workspace con SMTP AUTH/App Passwords bloqueado por administrador.`;
  }
  if (lower.includes('auth') || lower.includes('535') || lower.includes('invalid login') || lower.includes('badcredentials')) {
    return `${base}\n→ Posibles causas:\n   1. App Password incorrecta o revocada\n   2. 2FA no activa en la cuenta Google\n   3. App Passwords deshabilitadas por admin Workspace\n   4. SMTP_USER mal copiado (espacios, Markdown, comillas)\n   5. Cuenta @cun.edu.co no es Google (es Microsoft 365 → smtp.gmail.com no aplica)`;
  }
  if (lower.includes('timeout') || lower.includes('etimedout')) {
    return `${base}\n→ Timeout de red/firewall hacia ${config.host}:${config.port}.`;
  }
  if (lower.includes('econnrefused') || lower.includes('connection refused')) {
    return `${base}\n→ Conexión rechazada. Revise SMTP_HOST y SMTP_PORT.`;
  }
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return `${base}\n→ Problema TLS — pruebe SMTP_SECURE=${config.secure ? 'false' : 'true'} o puerto ${config.secure ? 587 : 465}.`;
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return `${base}\n→ SMTP_HOST no resuelve DNS.`;
  }
  return `${base}\n→ Revise host, puerto, secure, usuario y contraseña en .env.`;
}

function printConfig() {
  const { keyCounts, entries } = parseEnvFileRaw();
  const fileAnalysis = analyzeEnvFile(keyCounts, entries);
  const smtp = resolveSmtpConfig();
  const provider = resolveProvider();
  const testRecipient = env('EMAIL_TEST_RECIPIENT');
  const credNotes = analyzeCredentials(smtp);

  console.log('=== Configuración de correo (local) ===');
  console.log(`EMAIL_ENABLED:        ${env('EMAIL_ENABLED', 'false')}`);
  console.log(`EMAIL_PROVIDER:       ${provider}${env('EMAIL_PROVIDER') ? '' : ` (derivado de EMAIL_TRANSPORT=${env('EMAIL_TRANSPORT', 'smtp')})`}`);
  console.log(`EMAIL_TEST_MODE:      ${env('EMAIL_TEST_MODE', 'true')}`);
  console.log(`EMAIL_ALLOWED_DOMAIN: ${env('EMAIL_ALLOWED_DOMAIN', 'cun.edu.co')}`);
  console.log(`EMAIL_BLOCK_LOCAL:    ${env('EMAIL_BLOCK_LOCAL_RECIPIENTS', 'true')}`);
  console.log(`EMAIL_TEST_RECIPIENT: ${maskEmail(testRecipient)}`);
  console.log(`EMAIL_TEST_RECIPIENT configurado: ${yesNo(Boolean(testRecipient))}`);
  console.log(`SMTP_HOST configurado:  ${yesNo(Boolean(smtp.host))}${smtp.host ? ` (${smtp.host})` : ''}`);
  console.log(`SMTP_PORT:             ${Number.isFinite(smtp.port) ? smtp.port : '(inválido)'}`);
  console.log(`SMTP_USER configurado: ${yesNo(Boolean(smtp.user))} (${maskEmail(smtp.user)})`);
  console.log(`SMTP_PASS configurado: ${yesNo(Boolean(smtp.pass))}`);
  console.log(`SMTP_SECURE:           ${smtp.secure}`);
  console.log(`EMAIL_FROM:            ${env('EMAIL_FROM_NAME', 'Operación Académica CUN')} <${maskEmail(env('EMAIL_FROM_ADDRESS') || env('EMAIL_FROM') || '')}>`);
  const fromAddr = env('EMAIL_FROM_ADDRESS').toLowerCase();
  const smtpUserAddr = smtp.user?.toLowerCase() ?? '';
  if (smtp.host?.includes('gmail.com') && fromAddr && smtpUserAddr && fromAddr !== smtpUserAddr) {
    console.log(`  ⚠ EMAIL_FROM_ADDRESS ≠ SMTP_USER — Gmail mostrará SMTP_USER como remitente`);
  } else if (smtp.host?.includes('gmail.com') && smtpUserAddr) {
    console.log(`  Remitente efectivo Gmail: ${maskEmail(smtpUserAddr)} (SMTP_USER)`);
  }
  console.log('');

  console.log('=== Fuentes de variables SMTP ===');
  console.log(`  host ← ${smtp.sources.host ?? '(no configurado)'}`);
  console.log(`  user ← ${smtp.sources.user ?? '(no configurado)'}`);
  console.log(`  pass ← ${smtp.sources.pass ?? '(no configurado)'}`);
  if (fileAnalysis.legacyPresent.length) {
    console.log(`  Variables legacy presentes en .env: ${fileAnalysis.legacyPresent.join(', ')}`);
    if (smtp.sources.user?.includes('legacy') || smtp.sources.pass?.includes('legacy')) {
      console.log('  ⚠ Se están usando variables LEGACY para autenticación SMTP');
    } else {
      console.log('  (legacy presentes pero NO usadas — SMTP_* tiene prioridad)');
    }
  } else {
    console.log('  Variables legacy: ninguna en .env ✓');
  }
  if (fileAnalysis.duplicates.length) {
    console.log('  ⚠ Claves duplicadas en .env (gana la última):');
    for (const [key, count] of fileAnalysis.duplicates) {
      console.log(`    - ${key}: ${count} veces`);
    }
  } else {
    console.log('  Claves duplicadas: ninguna ✓');
  }
  console.log('');

  console.log('=== Diagnóstico credenciales (sin secretos) ===');
  for (const note of credNotes) console.log(`  ${note}`);
  console.log(`  SMTP_PASS contiene espacios: ${yesNo(/\s/.test(smtp.pass ?? ''))}`);
  console.log(`  SMTP_USER contiene espacios: ${yesNo(/\s/.test(smtp.user ?? ''))}`);
  console.log('');

  const issues = [...fileAnalysis.markdownIssues];
  if (env('EMAIL_ENABLED', 'false').toLowerCase() !== 'true') {
    issues.push('EMAIL_ENABLED no está en true — no se enviarán correos reales.');
  }
  if (provider === 'log') {
    issues.push('EMAIL_PROVIDER=log — solo modo mock/log, no SMTP real.');
  }
  if (env('EMAIL_TEST_MODE', 'true').toLowerCase() !== 'true') {
    issues.push('EMAIL_TEST_MODE=false — los correos irían a destinatarios reales por rol.');
    issues.push('Verifique EMAIL_ALLOWED_DOMAIN y EMAIL_BLOCK_LOCAL_RECIPIENTS antes de activar modo real.');
  }
  if (!testRecipient) {
    issues.push('Falta EMAIL_TEST_RECIPIENT — el override de prueba no funcionará.');
  }
  if (testRecipient && looksLikeMarkdownEmail(testRecipient)) {
    issues.push('EMAIL_TEST_RECIPIENT tiene formato Markdown — corrija a email plano.');
  }
  if (provider === 'smtp') {
    if (!smtp.host) issues.push('Falta SMTP_HOST (o EMAIL_HOST).');
    if (!smtp.user) issues.push('Falta SMTP_USER (o EMAIL_USER).');
    if (!smtp.pass) issues.push('Falta SMTP_PASS (o EMAIL_PASSWORD).');
    if (smtp.user && !isPlainEmail(smtp.user)) {
      issues.push('SMTP_USER no es un email válido — revise .env (sin Markdown ni mailto:)');
    }
  }

  if (issues.length) {
    console.log('⚠ Problemas detectados:');
    for (const issue of issues) console.log(`  - ${issue}`);
    console.log('');
  } else {
    console.log('✓ Configuración mínima OK para envío SMTP en modo prueba.\n');
  }

  return { smtp, provider, testRecipient, issues };
}

async function verifySmtp(config) {
  console.log('=== Verificación SMTP (nodemailer.verify) ===');
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    tls: { minVersion: 'TLSv1.2' },
    ...(config.port === 587 && !config.secure ? { requireTLS: true } : {}),
  });

  try {
    await transporter.verify();
    console.log('✓ Conexión SMTP y autenticación OK.\n');
    return true;
  } catch (error) {
    console.error('✗ Verificación SMTP falló:');
    console.error(formatSmtpError(error, config));
    console.log('');
    return false;
  }
}

const { smtp, provider, issues } = printConfig();

if (VERIFY && provider === 'smtp' && smtp.host && smtp.user && smtp.pass) {
  verifySmtp(smtp).then((ok) => process.exit(ok && issues.length === 0 ? 0 : 1));
} else if (VERIFY) {
  console.error('✗ No se puede verificar SMTP: configuración incompleta.');
  process.exit(1);
} else {
  console.log('Tip: ejecute `node scripts/check-email-config.mjs --verify` para probar conexión SMTP.');
  process.exit(issues.length ? 1 : 0);
}

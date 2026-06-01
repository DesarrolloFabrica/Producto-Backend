/**
 * Desactiva usuarios seed @local (status=INACTIVE). No elimina registros.
 * Ejecutar: npm run db:deactivate-local-users
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Client } = require('pg');

const __dirname = dirname(fileURLToPath(import.meta.url));

const LOCAL_SEED_EMAILS = [
  'product@local',
  'fabrica@local',
  'planeacion@local',
  'lms@local',
  'admin@local',
];

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile();

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('✗ DATABASE_URL no configurado');
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  const before = await client.query(
    `SELECT email, name, role, status FROM users ORDER BY role, email`,
  );

  console.log('=== Usuarios antes ===');
  for (const row of before.rows) {
    console.log(`  ${row.email.padEnd(40)} ${row.role.padEnd(12)} ${row.status}`);
  }

  const result = await client.query(
    `UPDATE users SET status = 'INACTIVE', "updatedAt" = NOW()
     WHERE email = ANY($1::text[]) AND status = 'ACTIVE'
     RETURNING email, role`,
    [LOCAL_SEED_EMAILS],
  );

  console.log(`\n✓ Desactivados: ${result.rowCount}`);
  for (const row of result.rows) {
    console.log(`  → ${row.email} (${row.role})`);
  }

  const after = await client.query(
    `SELECT email, name, role, status FROM users ORDER BY role, email`,
  );

  console.log('\n=== Usuarios después ===');
  for (const row of after.rows) {
    console.log(`  ${row.email.padEnd(40)} ${row.role.padEnd(12)} ${row.status}`);
  }

  const roles = ['PRODUCT', 'FABRICA', 'PLANEACION', 'LMS', 'ADMIN'];
  console.log('\n=== Cobertura @cun.edu.co ACTIVE por rol ===');
  for (const role of roles) {
    const { rows } = await client.query(
      `SELECT email FROM users
       WHERE role = $1 AND status = 'ACTIVE' AND email ILIKE '%@cun.edu.co'
       ORDER BY email`,
      [role],
    );
    const ok = rows.length > 0 ? '✓' : '✗';
    console.log(`  ${ok} ${role}: ${rows.map((r) => r.email).join(', ') || '(ninguno)'}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error('✗ Error:', err.message);
  process.exit(1);
});

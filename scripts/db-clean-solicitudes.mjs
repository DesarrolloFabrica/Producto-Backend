/**
 * Limpia todas las solicitudes (projects) y datos relacionados.
 * Usa DATABASE_URL del .env del backend o la variable de entorno.
 *
 * Uso: node scripts/db-clean-solicitudes.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const raw = readFileSync(envPath, 'utf8');
    const match = raw.match(/^DATABASE_URL=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, '');
  } catch {
    /* ignore */
  }
  throw new Error('No se encontró DATABASE_URL en .env ni en el entorno');
}

const url = loadDatabaseUrl();
const masked = url.replace(/:([^:@]+)@/, ':****@');
const client = new pg.Client({ connectionString: url });

await client.connect();

const before = await client.query('SELECT COUNT(*)::int AS n FROM projects');
console.log(`Antes: ${before.rows[0].n} proyectos (${masked})`);

await client.query('BEGIN');
try {
  await client.query(`
    DELETE FROM notifications
    WHERE "projectId" IS NOT NULL OR "subjectId" IS NOT NULL
  `);
  await client.query(`
    DELETE FROM audit_logs
    WHERE "entityType" IN ('PROJECT', 'SEMESTER', 'SUBJECT', 'OBSERVATION')
  `);
  await client.query(`
    DELETE FROM status_history
    WHERE "entityType" IN ('PROJECT', 'SEMESTER', 'SUBJECT')
  `);
  const del = await client.query('DELETE FROM projects');
  await client.query('COMMIT');
  console.log(`Eliminados: ${del.rowCount} proyectos (y cascada de semestres/materias/etc.)`);
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
}

const after = await client.query('SELECT COUNT(*)::int AS n FROM projects');
const sem = await client.query('SELECT COUNT(*)::int AS n FROM semesters');
console.log(`Después: ${after.rows[0].n} proyectos, ${sem.rows[0].n} semestres`);
console.log(after.rows[0].n === 0 ? 'OK — BD de solicitudes limpia' : 'ATENCIÓN: aún quedan registros');

await client.end();

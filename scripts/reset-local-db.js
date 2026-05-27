const { Client } = require('pg');
const { spawnSync } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL no definida');
  const isLocal = /(localhost|127\.0\.0\.1)/i.test(dbUrl);
  const forceRemote = process.env.RESET_DB_FORCE === 'true';
  if (!isLocal && !forceRemote) {
    throw new Error(
      'ABORTADO: DATABASE_URL no apunta a localhost. Use RESET_DB_FORCE=true solo en entornos de desarrollo.',
    );
  }
  if (!isLocal && forceRemote) {
    console.warn('\n⚠️  RESET_DB_FORCE=true: limpiando base remota de desarrollo\n');
  }
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error('ABORTADO: NODE_ENV=production');
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  console.log('\n==> Limpieza de esquema public (DROP SCHEMA CASCADE)');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  await client.query('GRANT ALL ON SCHEMA public TO postgres');
  await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await client.end();

  const root = path.join(__dirname, '..');
  console.log('\n==> Ejecutando migraciones');
  const migrate = spawnSync('npm run migration:run', {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  if (migrate.status !== 0) throw new Error('migration:run falló');

  console.log('\n==> Ejecutando seed de usuarios');
  const seed = spawnSync('npm run seed', {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  if (seed.status !== 0) throw new Error('seed falló');

  const verify = new Client({ connectionString: dbUrl });
  await verify.connect();
  const summary = await verify.query(`
    SELECT 'users' AS tabla, COUNT(*)::text AS registros FROM users
    UNION ALL SELECT 'projects', COUNT(*)::text FROM projects
    UNION ALL SELECT 'notifications', COUNT(*)::text FROM notifications
    UNION ALL SELECT 'observations', COUNT(*)::text FROM observations
    UNION ALL SELECT 'typeorm_migrations', COUNT(*)::text FROM typeorm_migrations
  `);
  console.log('\n==> Resumen post-reset');
  console.table(summary.rows);
  await verify.end();

  console.log('\nReset local completado correctamente.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
const role = process.argv[3]?.trim().toUpperCase();

if (!email || !role) {
  console.error('Uso: node scripts/set-user-role.mjs <email> <role>');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const before = await client.query(
  `SELECT email, name, role, status FROM users WHERE email = $1`,
  [email],
);

if (!before.rows.length) {
  console.error(`✗ Usuario no encontrado: ${email}`);
  await client.end();
  process.exit(1);
}

console.log('Antes:', before.rows[0]);

const result = await client.query(
  `UPDATE users SET role = $2, "updatedAt" = NOW() WHERE email = $1 RETURNING email, name, role, status`,
  [email, role],
);

console.log('Después:', result.rows[0]);
await client.end();

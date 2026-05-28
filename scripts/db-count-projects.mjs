import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:123456@localhost:5432/producto_backend';
const client = new pg.Client({ connectionString: url });

await client.connect();
const projects = await client.query('SELECT COUNT(*)::int AS n FROM projects');
const semesters = await client.query('SELECT COUNT(*)::int AS n FROM semesters');
const list = await client.query(
  `SELECT id, program, status, "deletedAt" FROM projects ORDER BY "createdAt" DESC LIMIT 10`,
);
console.log('DATABASE_URL:', url.replace(/:[^:@]+@/, ':****@'));
console.log('projects:', projects.rows[0].n, '| semesters:', semesters.rows[0].n);
console.table(list.rows);
await client.end();

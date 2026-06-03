import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query(
  `SELECT email, role, status FROM users WHERE status = 'ACTIVE' ORDER BY role, email LIMIT 30`,
);
console.table(res.rows);
await client.end();

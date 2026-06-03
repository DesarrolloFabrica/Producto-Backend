import 'dotenv/config';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const res = await client.query(
  `SELECT action, "afterJson"->>'format' AS format, "createdAt"
   FROM audit_logs WHERE action = 'REPORT_EXPORT'
   ORDER BY "createdAt" DESC LIMIT 5`,
);
console.table(res.rows);
await client.end();

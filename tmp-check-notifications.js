const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgres://postgres:123456@localhost:5432/producto_backend',
  });
  await client.connect();
  const subject = await client.query(
    `SELECT id, name, status FROM subjects WHERE id = '4a2f6621-f526-4982-807c-e88ae67f6341'`,
  );
  console.log('subject', subject.rows);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

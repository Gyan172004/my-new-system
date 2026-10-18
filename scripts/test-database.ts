import { Client } from 'pg';
import { allocateTestDatabase } from '../tests/helpers/test-database';
async function main() {
  if (process.argv.length > 2)
    throw new Error('test_database_arguments_invalid');
  const lease = await allocateTestDatabase({ purpose: 'isolation' });
  try {
    const client = new Client({
      connectionString: lease.connectionString,
      connectionTimeoutMillis: 500,
      statement_timeout: 500,
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      await client.end();
    }
    process.stdout.write(
      JSON.stringify({ status: 'ok', database: lease.name }) + '\n',
    );
  } finally {
    await lease.dispose();
  }
}
void main().catch(() => {
  process.stderr.write('test_database_check_failed\n');
  process.exitCode = 1;
});

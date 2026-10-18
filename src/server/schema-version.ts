import type { ClientBase } from 'pg';
// Read library-owned metadata only. No DDL, migration or ledger repair in probes.
export async function readSchemaHistory(
  client: Pick<ClientBase, 'query'>,
): Promise<readonly string[] | null> {
  const ledger = await client.query<{ ledger: string | null }>(
    "SELECT to_regclass('public.pgmigrations') AS ledger",
  );
  if (!ledger.rows[0]?.ledger) return null;
  const result = await client.query<{ name: string }>(
    'SELECT name FROM public.pgmigrations ORDER BY id ASC',
  );
  if (!result.rows.every((row) => typeof row.name === 'string'))
    throw new Error('schema_unavailable');
  return result.rows.map((row) => row.name);
}

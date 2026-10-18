import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { expect, it } from 'vitest';
it('keeps development and integration PostgreSQL separate with loopback ports, named storage, secret references and finite health checks', async () => {
  const text = await readFile('compose.yaml', 'utf8').catch(() => null);
  expect(text, 'missing local test service definition').not.toBeNull();
  const config = parse(text!);
  const db = config.services.db;
  const test = config.services['test-db'];
  for (const service of [db, test]) {
    expect(service.image).toMatch(
      /^postgres:17\.\d+-bookworm@sha256:[a-f0-9]{64}$/,
    );
    expect(service.ports).toHaveLength(1);
    expect(service.ports[0]).toMatch(/^127\.0\.0\.1:\d+:5432$/);
    expect(service.environment.POSTGRES_PASSWORD).toBeUndefined();
    expect(service.environment.POSTGRES_PASSWORD_FILE).toMatch(
      /^\/run\/secrets\//,
    );
    expect(service.healthcheck.test[0]).toBe('CMD-SHELL');
    expect(service.healthcheck.test[1]).toContain('pg_isready');
    expect(service.healthcheck.timeout).toBe('2s');
    expect(service.healthcheck.interval).toBe('2s');
    expect(service.healthcheck.retries).toBeLessThanOrEqual(10);
  }
  expect(db.ports[0]).not.toBe(test.ports[0]);
  expect(db.volumes[0]).not.toBe(test.volumes[0]);
  expect(db.environment.POSTGRES_USER).not.toBe(test.environment.POSTGRES_USER);
  expect(db.networks).not.toEqual(test.networks);
  expect(config.secrets.dev_db_password.file).not.toBe(
    config.secrets.test_db_password.file,
  );
});

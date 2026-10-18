import { parseIntoClientConfig } from 'pg-connection-string';
// Parse once, before setting owned budgets. pg otherwise reparses connectionString
// over explicit fields; raw startup options can also bypass server-side caps.
export function databaseConnectionOptions(value: string) {
  const config = parseIntoClientConfig(value);
  delete config.connectionString;
  delete config.options;
  return config;
}

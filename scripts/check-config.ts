import { ConfigurationError, parseRuntimeConfig } from '../src/server/config';

try {
  parseRuntimeConfig(process.env);
  process.stdout.write('configuration_valid\n');
} catch (error) {
  process.stderr.write(
    `${error instanceof ConfigurationError ? error.message : 'configuration_check_failed'}\n`,
  );
  process.exitCode = 1;
}

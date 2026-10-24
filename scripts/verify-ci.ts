import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export const stages = {
  install: ['ci'],
  format: ['run', 'format:check'],
  lint: ['run', 'lint'],
  typecheck: ['run', 'typecheck'],
  unit: ['run', 'test:unit'],
  integration: ['run', 'test:integration'],
  'identity-coverage': ['run', 'coverage:identity'],
  'catalogue-coverage': ['run', 'coverage:catalogue'],
  contract: ['run', 'test:contract'],
  architecture: ['run', 'verify:architecture'],
  build: ['run', 'build'],
  process: ['run', 'test:process'],
  browser: ['run', 'test:e2e'],
  audit: ['audit', '--audit-level=high'],
  secrets: ['run', 'scan:secrets'],
  container: ['run', 'container:build'],
  'ci-controls': ['run', 'test:ci'],
  image: ['run', 'scan:image'],
  filesystem: ['run', 'scan:filesystem'],
  foundation: ['run', 'verify:foundation'],
  'negative-controls': ['run', 'verify:ci-failures'],
} as const;
export async function command(
  program: string,
  args: readonly string[],
  options: {
    cwd?: string;
    timeoutMs?: number;
    quiet?: boolean;
    environment?: NodeJS.ProcessEnv;
  } = {},
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(program, [...args], {
      cwd: options.cwd ?? process.cwd(),
      env: options.environment ?? process.env,
      detached: true,
      stdio: options.quiet ? 'ignore' : 'inherit',
    });
    let expired = false;
    const terminate = () => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* Already closed. */
      }
    };
    const timer = setTimeout(() => {
      expired = true;
      terminate();
    }, options.timeoutMs ?? 600000);
    child.once('error', () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      resolve(expired ? 1 : (code ?? 1));
    });
  });
}
export async function runStage(
  stage: keyof typeof stages,
  cwd = process.cwd(),
) {
  const code = await command('npm', stages[stage], { cwd });
  if (code !== 0) throw new Error(`ci_stage_failed:${stage}`);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') {
    console.log(JSON.stringify(Object.keys(stages)));
    return;
  }
  if (args.length === 0) {
    for (const stage of Object.keys(stages) as (keyof typeof stages)[])
      await runStage(stage);
    return;
  }
  if (
    args.length === 2 &&
    args[0] === '--stage' &&
    Object.hasOwn(stages, args[1]!)
  ) {
    await runStage(args[1] as keyof typeof stages);
    return;
  }
  throw new Error('ci_arguments_invalid');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch((error) => {
    console.error(
      error instanceof Error &&
        /^(ci_arguments_invalid|ci_stage_failed:[a-z-]+)$/.test(error.message)
        ? error.message
        : 'ci_failed',
    );
    process.exitCode = 1;
  });

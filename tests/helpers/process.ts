import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import {
  cp,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export interface ManagedChild {
  child: ChildProcess;
  done: Promise<number>;
  output(): string;
}
const owned = new Set<string>();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('test_port_unavailable');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
export async function portIsFree(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
}
export async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  milliseconds: number,
): Promise<T> {
  const deadline = performance.now() + milliseconds;
  while (performance.now() < deadline) {
    try {
      const value = await read();
      if (accept(value)) return value;
    } catch {
      /* Retry only inside this owned test deadline. */
    }
    await delay(100);
  }
  throw new Error('test_observation_deadline');
}
export class ProcessProject {
  readonly #children: ManagedChild[] = [];
  constructor(readonly root: string) {}
  run(args: string[], environment: Record<string, string> = {}): ManagedChild {
    if (!owned.has(this.root)) throw new Error('test_project_not_owned');
    const child = spawn(process.execPath, args, {
      cwd: this.root,
      detached: true,
      env: {
        NODE_ENV: 'production',
        PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
        HOME: this.root,
        NEXT_TELEMETRY_DISABLED: '1',
        npm_config_cache: join(this.root, '.npm-cache'),
        ...environment,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let overflow = false;
    const capture = (data: Buffer) => {
      output += data.toString();
      if (output.length > 256000) {
        overflow = true;
        if (child.pid) process.kill(-child.pid, 'SIGKILL');
      }
    };
    child.stdout!.on('data', capture);
    child.stderr!.on('data', capture);
    const done = new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => {
        if (overflow) reject(new Error('test_output_limit'));
        else resolve(code ?? -1);
      });
    });
    const managed = { child, done, output: () => output };
    this.#children.push(managed);
    return managed;
  }
  async command(
    args: string[],
    environment: Record<string, string> = {},
    milliseconds = 120000,
  ): Promise<ManagedChild> {
    const process = this.run(args, environment);
    const result = await this.deadline(process.done, milliseconds);
    if (result !== 0)
      throw new Error(`test_command_failed: ${process.output().slice(-3000)}`);
    return process;
  }
  async deadline<T>(work: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('test_process_deadline')),
            milliseconds,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async stop(process: ManagedChild): Promise<number> {
    if (!this.#children.includes(process))
      throw new Error('test_process_not_owned');
    if (process.child.exitCode === null && process.child.pid)
      this.signal(process, 'SIGTERM');
    return this.deadline(process.done, 30000);
  }
  signal(process: ManagedChild, signal: NodeJS.Signals): void {
    if (!this.#children.includes(process) || !process.child.pid)
      throw new Error('test_process_not_owned');
    try {
      globalThis.process.kill(-process.child.pid, signal);
    } catch (error) {
      if (!(
        error instanceof Error &&
        'code' in error &&
        error.code === 'ESRCH'
      ))
        throw error;
    }
  }
  async instrument(): Promise<void> {
    if (!owned.has(this.root)) throw new Error('test_project_not_owned');
    const observerPath = join(this.root, 'observation.json');
    await writeFile(
      join(this.root, 'src/server/test-observer.ts'),
      `
import { writeFileSync } from 'node:fs';
import { getRuntime } from './runtime';
const slot = Symbol.for('foundation.test.observer');
const root = globalThis as typeof globalThis & { [slot]?: { calls: number; listeners: number; original?: object } };
export function observe(kind: string) {
 const state = root[slot] ??= { calls: 0, listeners: 0 };
 if (kind === 'listener') state.listeners++;
 const runtime = getRuntime();
 const resource = runtime.getOrCreate(Symbol.for('foundation.test.owned-resource'), () => { state.calls++; return { close: async () => {}, destroy: () => {} }; });
 state.original ??= resource;
 writeFileSync(${JSON.stringify(observerPath)}, JSON.stringify({ pid: process.pid, calls: state.calls, listeners: state.listeners, sameHandle: state.original === resource, lifecycle: runtime.state }));
}
`,
    );
    const boot = join(this.root, 'src/server/bootstrap.ts');
    let text = await readFile(boot, 'utf8');
    if (
      !text.includes("this.#setState('SERVING');") ||
      !text.includes("server.off('error', onError);")
    )
      throw new Error('test_instrumentation_anchor_missing');
    text =
      "import { observe } from './test-observer';\n" +
      text
        .replace(
          "this.#setState('SERVING');",
          "this.#setState('SERVING'); observe('startup');",
        )
        .replace(
          "server.off('error', onError);",
          "server.off('error', onError); observe('listener');",
        );
    await writeFile(boot, text);
    const route = join(this.root, 'src/app/api/v1/health/live/route.ts');
    await writeFile(
      route,
      "import { observe } from '../../../../../server/test-observer';\n" +
        (await readFile(route, 'utf8')).replace(
          '  getRuntime();',
          "  getRuntime(); observe('request');",
        ),
    );
  }
  async observation() {
    return JSON.parse(
      await readFile(join(this.root, 'observation.json'), 'utf8'),
    ) as {
      pid: number;
      calls: number;
      listeners: number;
      sameHandle: boolean;
      lifecycle: string;
    };
  }
  async dispose(): Promise<void> {
    if (
      !owned.has(this.root) ||
      !this.root.startsWith(join(tmpdir(), 'foundation-process-'))
    )
      throw new Error('test_cleanup_not_owned');
    try {
      for (const process of this.#children) {
        if (process.child.exitCode === null) {
          try {
            await this.stop(process);
          } catch {
            this.signal(process, 'SIGKILL');
            await this.deadline(process.done, 5000);
          }
        }
        // Kill any owned descendants left after the npm wrapper exits.
        this.signal(process, 'SIGKILL');
      }
    } finally {
      await rm(this.root, { recursive: true, force: true });
      owned.delete(this.root);
    }
  }
}
export async function createProcessProject(): Promise<ProcessProject> {
  const root = await mkdtemp(join(tmpdir(), 'foundation-process-'));
  owned.add(root);
  const fixture = new ProcessProject(root);
  try {
    for (const name of [
      'src',
      'scripts',
      'config',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'next.config.ts',
    ])
      await cp(resolve(name), join(root, name), { recursive: true });
    await cp(resolve('node_modules'), join(root, 'node_modules'), {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      verbatimSymlinks: true,
    });
    if (
      !(await realpath(join(root, 'node_modules/.bin/next'))).startsWith(
        root + '/',
      )
    )
      throw new Error('test_dependency_escape');
    return fixture;
  } catch (error) {
    await fixture.dispose();
    throw error;
  }
}
export async function readLiveness(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/health/live`, {
    signal: AbortSignal.timeout(2000),
  });
  return {
    status: response.status,
    cache: response.headers.get('cache-control'),
    body: (await response.json()) as { status: string; timestamp: string },
  };
}

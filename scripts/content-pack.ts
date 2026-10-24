import { createReadStream } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Readable } from 'node:stream';
import { parseRuntimeConfig } from '../src/server/config';
import { createRuntime } from '../src/server/runtime';
import { runtimeDatabase } from '../src/server/database';
import { runtimeIdentity } from '../src/modules/identity-profile/public';
import {
  createPublishingService,
  validatePack,
  PublishingFailure,
} from '../src/modules/content-publishing/public';
export class ContentCommandFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ContentCommandFailure';
  }
}
const failure = (code: string): never => {
  throw new ContentCommandFailure(code);
};
async function boundedStream(
  stream: Readable,
  max: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  const cancelled = () =>
    stream.destroy(new ContentCommandFailure('command_cancelled'));
  signal?.addEventListener('abort', cancelled, { once: true });
  try {
    if (signal?.aborted) failure('command_cancelled');
    for await (const chunk of stream) {
      if (signal?.aborted) failure('command_cancelled');
      const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      length += b.length;
      if (length > max) failure('input_too_large');
      chunks.push(b);
    }
    return Buffer.concat(chunks, length);
  } finally {
    signal?.removeEventListener('abort', cancelled);
    stream.destroy();
  }
}
export interface ContentCommandOptions {
  readonly stdin: Readable;
  readonly signal?: AbortSignal;
  readonly read?: (
    path: string,
    max: number,
    signal?: AbortSignal,
  ) => Promise<Buffer>;
  readonly services?: () => Promise<
    Readonly<{
      service: ReturnType<typeof createPublishingService>;
      close(): Promise<void>;
    }>
  >;
}
export async function runContentCommand(
  args: readonly string[],
  options: ContentCommandOptions,
): Promise<unknown> {
  const [command, ...values] = args;
  const count: Record<string, number> = {
    validate: 1,
    review: 2,
    publish: 2,
    withdraw: 3,
  };
  if (
    !command ||
    !Object.hasOwn(count, command) ||
    values.length !== count[command] ||
    values.some(
      (v) =>
        !v ||
        v.startsWith('-') ||
        Buffer.byteLength(v) > 4096 ||
        [...v].some((char) => char.charCodeAt(0) < 32),
    )
  )
    failure('invalid_command');
  if (options.signal?.aborted) failure('command_cancelled');
  const read = async (path: string, max: number) => {
    const bytes = options.read
      ? await options.read(path, max, options.signal)
      : await boundedStream(
          createReadStream(path, { highWaterMark: 65536 }),
          max,
          options.signal,
        );
    if (bytes.length > max) failure('input_too_large');
    if (options.signal?.aborted) failure('command_cancelled');
    return bytes;
  };
  if (command === 'validate') {
    const result = validatePack(await read(values[0]!, 2097152), 'draft');
    return result.ok
      ? Object.freeze({
          ok: true,
          checksum: result.checksum,
          publishable: result.publishable,
        })
      : result;
  }
  let credential: Buffer;
  try {
    credential = await boundedStream(options.stdin, 8193, options.signal);
  } catch (error) {
    if (
      error instanceof ContentCommandFailure &&
      error.code === 'command_cancelled'
    )
      throw error;
    failure('invalid_operator_credential');
  }
  const token = credential!.toString('utf8').replace(/\r?\n$/, '');
  credential!.fill(0);
  if (!token || Buffer.byteLength(token) > 8192 || /\s/.test(token))
    failure('invalid_operator_credential');
  const auth = {
    authorization: `Bearer ${token}`,
    sourceAddress: 'local-content-operator',
    ...(options.signal ? { signal: options.signal } : {}),
  };
  const raw =
    command === 'withdraw' ? undefined : await read(values[0]!, 2097152);
  let evidence: unknown;
  if (command === 'review') {
    const bytes = await read(values[1]!, 16384);
    try {
      evidence = JSON.parse(bytes.toString('utf8'));
    } catch {
      failure('invalid_review_evidence');
    }
  }
  const resources = await (options.services ?? defaultServices)();
  try {
    if (command === 'review')
      return await resources.service.review(auth, raw!, evidence);
    if (command === 'publish')
      return await resources.service.publish(auth, raw!, values[1]!);
    return await resources.service.withdraw(
      auth,
      values[0]!,
      values[1]!,
      values[2]!,
    );
  } finally {
    await resources.close();
  }
}
async function defaultServices() {
  const runtime = createRuntime(parseRuntimeConfig(process.env));
  try {
    const service = createPublishingService(runtimeDatabase(runtime), {
      identity: runtimeIdentity(runtime),
      staff: runtime.config.contentStaff,
    });
    return { service, close: () => runtime.closeResources() };
  } catch (error) {
    await runtime.closeResources();
    throw error;
  }
}
async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const timer = setTimeout(stop, 30000);
  try {
    const result = await runContentCommand(process.argv.slice(2), {
      stdin: process.stdin,
      signal: controller.signal,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
    if (
      typeof result === 'object' &&
      result !== null &&
      'ok' in result &&
      result.ok === false
    )
      process.exitCode = 1;
  } catch (error) {
    const code =
      error instanceof ContentCommandFailure ||
      error instanceof PublishingFailure
        ? error.code
        : typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            [
              'unauthorized',
              'forbidden',
              'rate_limited',
              'identity_unavailable',
              'review_mismatch',
              'published_version_conflict',
              'reviewer_not_authorized',
              'release_not_found',
              'slug_conflict',
            ].includes(String(error.code))
          ? String(error.code)
          : 'content_command_failed';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();

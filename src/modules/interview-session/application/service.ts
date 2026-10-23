import { z } from 'zod';
import type { createDatabase } from '../../../server/database';
import type { AuthenticatedCaller } from '../../identity-profile/public';
import {
  createCatalogueResolver,
  createCatalogueReader,
} from '../../problem-catalogue/public';
import {
  createTransactionRunner,
  TransactionDomainFailure,
} from '../../../server/transaction';
import {
  createSessionRepository,
  type PinnedInput,
} from '../persistence/sessions';
const uuid = z.uuid();
const inputSchema = z
  .object({
    problemId: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value) <= 256),
    problemPackVersion: z
      .string()
      .min(1)
      .refine((value) => Buffer.byteLength(value) <= 256),
    clientContext: z
      .object({
        selfReportedExperience: z
          .string()
          .refine((value) => [...value].length <= 2000)
          .optional(),
        preferredInterviewLanguage: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
// Internal services only. The future HTTP command facade must add owner-scoped
// idempotency around published creation; fixture-only createPinned stays internal.
export function createSessionService(
  db: Pick<ReturnType<typeof createDatabase>, 'withClient'>,
) {
  const repository = createSessionRepository(db);
  const resolver = createCatalogueResolver(db);
  const catalogue = createCatalogueReader(db);
  const transaction = createTransactionRunner(db);
  return {
    async readPinnedCandidateOwned(
      caller: AuthenticatedCaller,
      id: string,
      signal?: AbortSignal,
    ) {
      if (
        !uuid.safeParse(caller?.userId).success ||
        !uuid.safeParse(id).success
      )
        return null;
      const session = await repository.read(caller.userId, id, signal);
      if (!session) return null;
      try {
        return await catalogue.readPinnedCandidate(
          session.problemId,
          session.problemPackVersion,
          signal,
        );
      } catch {
        throw new Error('pinned_content_unavailable');
      }
    },
    async createPublishedSession(
      caller: AuthenticatedCaller,
      problemId: string,
      signal?: AbortSignal,
    ) {
      if (
        !uuid.safeParse(caller?.userId).success ||
        typeof problemId !== 'string' ||
        !problemId.isWellFormed() ||
        problemId.trim().length === 0 ||
        Buffer.byteLength(problemId) > 256 ||
        [...problemId].some((character) => {
          const point = character.codePointAt(0)!;
          return point < 32 || point === 127;
        })
      )
        throw new Error('invalid_session_input');
      try {
        return await transaction.run(async (scope) => {
          const pin = await resolver.resolveForNewSession(problemId, scope);
          return repository.createInScope(scope, caller.userId, {
            problemId: pin.problemId,
            problemPackVersion: pin.version,
          });
        }, signal);
      } catch (error) {
        if (error instanceof TransactionDomainFailure) throw error;
        // Driver causes may contain private content; retain only the safe outcome.
        // eslint-disable-next-line preserve-caught-error
        throw new Error('session_unavailable');
      }
    },
    async createPinned(
      caller: AuthenticatedCaller,
      input: PinnedInput,
      signal?: AbortSignal,
    ) {
      const parsed = inputSchema.safeParse(input);
      if (
        !uuid.safeParse(caller.userId).success ||
        !parsed.success ||
        Buffer.byteLength(JSON.stringify(parsed.data)) > 16384
      )
        throw new Error('invalid_session_input');
      return repository.create(caller.userId, parsed.data, signal);
    },
    async readOwned(
      caller: AuthenticatedCaller,
      id: string,
      signal?: AbortSignal,
    ) {
      if (!uuid.safeParse(caller.userId).success || !uuid.safeParse(id).success)
        return null;
      return repository.read(caller.userId, id, signal);
    },
    async startOwned(
      caller: AuthenticatedCaller,
      id: string,
      expectedVersion: number,
      signal?: AbortSignal,
    ) {
      if (!uuid.safeParse(caller.userId).success || !uuid.safeParse(id).success)
        return { outcome: 'not_found' as const };
      if (
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 0 ||
        expectedVersion >= 2147483647
      )
        return { outcome: 'stale_version' as const };
      return repository.start(caller.userId, id, expectedVersion, signal);
    },
  };
}

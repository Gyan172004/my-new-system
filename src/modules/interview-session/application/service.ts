import { z } from 'zod';
import type { createDatabase } from '../../../server/database';
import type { AuthenticatedCaller } from '../../identity-profile/public';
import {
  createSessionRepository,
  type PinnedInput,
} from '../persistence/sessions';
const uuid = z.uuid();
const inputSchema = z
  .object({
    problemId: z.string().min(1).max(256),
    problemPackVersion: z.string().min(1).max(256),
    clientContext: z
      .object({
        selfReportedExperience: z.string().max(2000).optional(),
        preferredInterviewLanguage: z.string().max(256).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
// Internal persistence prerequisite. The future command facade must first resolve
// published packs and owner-scoped idempotency; this is never an HTTP endpoint.
export function createSessionService(
  db: Pick<ReturnType<typeof createDatabase>, 'withClient'>,
) {
  const repository = createSessionRepository(db);
  return {
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

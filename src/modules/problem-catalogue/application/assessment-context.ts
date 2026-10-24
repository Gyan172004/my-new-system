import { z } from 'zod';
import {
  parsePrivateInterview,
  parseHintRouting,
  validateHintRouting,
  hintRoutingHash,
  freezeContent,
} from '../../content-publishing/public';
import {
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
export interface AssessmentPin {
  readonly problemId: string;
  readonly packVersion: string;
  readonly packChecksum: string;
}
const pinSchema = z.strictObject({
  problemId: z.string().min(1).max(256),
  packVersion: z.string().min(1).max(256),
  packChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});
const fail = (): never => {
  throw Error('pinned_content_unavailable');
};
export function createAssessmentContextReader(db: TransactionDatabase) {
  const load = async (pin: AssessmentPin, scope?: TransactionScope) => {
    if (!pinSchema.safeParse(pin).success) fail();
    const work = async (c: import('pg').PoolClient) => {
      const row = (
        await c.query<{
          releaseId: string;
          checksum: string;
          schemaVersion: number;
          interview: unknown;
        }>(
          'SELECT id AS "releaseId",content_checksum AS checksum,schema_version AS "schemaVersion",interview FROM catalogue_releases WHERE problem_id=$1 AND version=$2 AND sealed',
          [pin.problemId, pin.packVersion],
        )
      ).rows[0];
      if (!row || row.checksum !== pin.packChecksum || row.schemaVersion !== 1)
        fail();
      try {
        return {
          releaseId: row!.releaseId,
          interview: parsePrivateInterview(row!.interview),
        };
      } catch {
        return fail();
      }
    };
    try {
      return scope
        ? await work(repositoryClient(scope, db))
        : await db.withClient(work);
    } catch {
      return fail();
    }
  };
  const catalogue = (
    interview: Awaited<ReturnType<typeof load>>['interview'],
  ) =>
    freezeContent({
      approachIds: interview.approaches.map((a) => a.id),
      ladders: interview.hintLadders.map((l) => ({
        id: l.id,
        approachId: l.approachId,
      })),
    });
  return Object.freeze({
    async readPinnedAssessmentContext(pin: AssessmentPin) {
      const { interview } = await load(pin);
      return freezeContent({
        ...pin,
        references: interview.approaches.map((a) => ({
          id: a.id,
          name: a.name,
          summary: a.summary,
          preconditions: a.preconditions,
          matchingFeatures: a.matchingFeatures,
        })),
      });
    },
    async readPinnedHintLadder(pin: AssessmentPin, ladderId: string) {
      const { interview } = await load(pin);
      const ladder = interview.hintLadders.find((l) => l.id === ladderId);
      if (!ladder) fail();
      return freezeContent({ ...pin, ...ladder! });
    },
    async readRoutingCatalogue(pin: AssessmentPin, scope?: TransactionScope) {
      const loaded = await load(pin, scope);
      return freezeContent({
        releaseId: loaded.releaseId,
        ...catalogue(loaded.interview),
      });
    },
    async readPinnedHintRouting(pin: AssessmentPin, exactHash?: string) {
      try {
        const loaded = await load(pin);
        const row = await db.withClient(
          async (c) =>
            (
              await c.query<{ manifest: unknown; hash: string }>(
                exactHash === undefined
                  ? 'SELECT r.manifest,r.hash FROM catalogue_hint_routing_current p JOIN catalogue_hint_routing_revisions r ON r.release_id=p.release_id AND r.hash=p.hash WHERE p.release_id=$1'
                  : 'SELECT manifest,hash FROM catalogue_hint_routing_revisions WHERE release_id=$1 AND hash=$2',
                exactHash === undefined
                  ? [loaded.releaseId]
                  : [loaded.releaseId, exactHash],
              )
            ).rows[0],
        );
        if (!row) throw Error();
        const route = validateHintRouting(
          parseHintRouting(row.manifest),
          catalogue(loaded.interview),
        );
        if (
          route.problemId !== pin.problemId ||
          route.packVersion !== pin.packVersion ||
          route.packChecksum !== pin.packChecksum ||
          hintRoutingHash(route) !== row.hash
        )
          throw Error();
        return freezeContent({ ...route, hash: row.hash });
      } catch {
        throw Error('hint_routing_unavailable');
      }
    },
  });
}

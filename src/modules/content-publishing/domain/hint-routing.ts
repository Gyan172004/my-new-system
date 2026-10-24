import { createHash } from 'node:crypto';
import { z } from 'zod';
import { packSchema } from './pack-schema';
import { canonicalizePack } from './checksum';

const identifier = z
  .string()
  .min(1)
  .max(256)
  .refine(
    (v) =>
      v.trim() === v &&
      ![...v].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127) &&
      v.isWellFormed(),
  );
const schema = z.strictObject({
  schemaVersion: z.literal(1),
  problemId: identifier,
  packVersion: identifier,
  packChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  revision: identifier,
  authorId: z.uuid(),
  provenance: z.string().min(1).max(32768),
  defaultLadderId: identifier,
  approachLadders: z
    .array(z.strictObject({ approachId: identifier, ladderId: identifier }))
    .max(2000),
});
export type HintRouting = Readonly<z.infer<typeof schema>>;
export interface RoutingCatalogue {
  readonly approachIds: readonly string[];
  readonly ladders: readonly Readonly<{ id: string; approachId: string }>[];
}
export function freezeContent<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeContent(nested);
    Object.freeze(value);
  }
  return value;
}
const unavailable = (): never => {
  throw Error('hint_routing_unavailable');
};
export function parseHintRouting(input: unknown): HintRouting {
  try {
    const canonical = canonicalizePack(input);
    if (Buffer.byteLength(canonical) > 262144) unavailable();
    const parsed = schema.safeParse(JSON.parse(canonical));
    if (!parsed.success) unavailable();
    return freezeContent(parsed.data!);
  } catch {
    return unavailable();
  }
}
export function validateHintRouting(
  route: HintRouting,
  catalogue: RoutingCatalogue,
): HintRouting {
  const approaches = new Set(catalogue.approachIds);
  const ladders = new Map(catalogue.ladders.map((l) => [l.id, l.approachId]));
  if (!approaches.size || !ladders.size || !ladders.has(route.defaultLadderId))
    unavailable();
  const selected = new Set<string>();
  for (const choice of route.approachLadders) {
    if (
      !approaches.has(choice.approachId) ||
      selected.has(choice.approachId) ||
      ladders.get(choice.ladderId) !== choice.approachId
    )
      unavailable();
    selected.add(choice.approachId);
  }
  for (const approachId of ladders.values())
    if (!selected.has(approachId)) unavailable();
  return route;
}
export function selectHintLadder(
  route: HintRouting,
  catalogue: RoutingCatalogue,
  matchedApproachId: string | null,
): string {
  validateHintRouting(route, catalogue);
  if (matchedApproachId === null) return route.defaultLadderId;
  if (!catalogue.approachIds.includes(matchedApproachId)) unavailable();
  const chosen = route.approachLadders.find(
    (c) => c.approachId === matchedApproachId,
  );
  return chosen?.ladderId ?? route.defaultLadderId;
}
export function hintRoutingHash(route: HintRouting): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: route.schemaVersion,
        problemId: route.problemId,
        packVersion: route.packVersion,
        packChecksum: route.packChecksum,
        revision: route.revision,
        authorId: route.authorId,
        provenance: route.provenance,
        defaultLadderId: route.defaultLadderId,
        approachLadders: [...route.approachLadders].sort((a, b) =>
          a.approachId < b.approachId
            ? -1
            : a.approachId > b.approachId
              ? 1
              : 0,
        ),
      }),
    )
    .digest('hex');
}
/** Schema validation only; no content is fetched through this public validator. */
export function parsePrivateInterview(input: unknown) {
  try {
    const value = packSchema.shape.interview.parse(
      JSON.parse(canonicalizePack(input)),
    );
    const approaches = new Set(value.approaches.map((a) => a.id));
    const ladderIds = new Set(value.hintLadders.map((l) => l.id));
    if (
      approaches.size !== value.approaches.length ||
      ladderIds.size !== value.hintLadders.length
    )
      throw Error('pinned_content_unavailable');
    for (const ladder of value.hintLadders) {
      if (
        !approaches.has(ladder.approachId) ||
        new Set(ladder.hints.map((h) => h.id)).size !== ladder.hints.length ||
        ladder.hints.some((h, i) => h.ordinal !== i + 1)
      )
        throw Error('pinned_content_unavailable');
    }
    return freezeContent(value);
  } catch {
    throw Error('pinned_content_unavailable');
  }
}

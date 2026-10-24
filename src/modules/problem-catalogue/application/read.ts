import type { TransactionDatabase } from '../../../server/transaction';
import { createCatalogueReadRepository } from '../persistence/reads';
import {
  CatalogueFailure,
  projectSummary,
  projectDetail,
  projectCandidate,
} from './projections';
export function requireCatalogueId(value: unknown): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Buffer.byteLength(value) > 256 ||
    Array.from(value).some((character) => {
      const point = character.codePointAt(0)!;
      return point < 32 || point === 127;
    }) ||
    !value.isWellFormed()
  )
    throw new CatalogueFailure('bad_request');
}
export function encodeCursor(lastProblemId: string) {
  return Buffer.from(
    JSON.stringify({ formatVersion: 1, lastProblemId }),
  ).toString('base64url');
}
export function decodeCursor(value?: string): string | null {
  if (value === undefined) return null;
  try {
    if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw Error();
    const raw = Buffer.from(value, 'base64url');
    if (raw.toString('base64url') !== value) throw Error();
    const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
    const parsed: unknown = JSON.parse(text);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      Object.keys(parsed).sort().join(',') !== 'formatVersion,lastProblemId'
    )
      throw Error();
    const p = parsed as { formatVersion: unknown; lastProblemId: unknown };
    if (p.formatVersion !== 1) throw Error();
    requireCatalogueId(p.lastProblemId);
    if (encodeCursor(p.lastProblemId) !== value) throw Error();
    return p.lastProblemId;
  } catch {
    throw new CatalogueFailure('bad_request');
  }
}
export function parseListInput(input: { limit?: string; cursor?: string }) {
  if (input.limit !== undefined && !/^(?:[1-9][0-9]?|100)$/.test(input.limit))
    throw new CatalogueFailure('bad_request');
  return {
    limit: input.limit === undefined ? 20 : Number(input.limit),
    after: decodeCursor(input.cursor),
  };
}
export function createCatalogueReader(db: TransactionDatabase) {
  const repository = createCatalogueReadRepository(db);
  return Object.freeze({
    async list(
      input: { limit?: string; cursor?: string } = {},
      signal?: AbortSignal,
    ) {
      const { limit, after } = parseListInput(input);
      const rows = await repository.list(after, limit + 1, signal);
      const items = Object.freeze(rows.slice(0, limit).map(projectSummary));
      return Object.freeze({
        items,
        nextCursor:
          rows.length > limit ? encodeCursor(items.at(-1)!.problemId) : null,
      });
    },
    async detail(problemId: string, signal?: AbortSignal) {
      requireCatalogueId(problemId);
      const row = await repository.current(problemId, signal);
      if (!row) throw new CatalogueFailure('not_found');
      return projectDetail(row);
    },
    async readPinnedCandidate(
      problemId: string,
      version: string,
      signal?: AbortSignal,
    ) {
      requireCatalogueId(problemId);
      requireCatalogueId(version);
      const row = await repository.exact(problemId, version, signal);
      if (!row) throw new CatalogueFailure('catalogue_unavailable');
      return Object.freeze({
        problemId,
        problemPackVersion: version,
        candidate: projectCandidate(row),
      });
    },
  });
}

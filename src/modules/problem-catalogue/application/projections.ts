import { z } from 'zod';
export class CatalogueFailure extends Error {
  constructor(
    readonly code: 'bad_request' | 'not_found' | 'catalogue_unavailable',
  ) {
    super(code);
    this.name = 'CatalogueFailure';
  }
}
const prose = z
  .string()
  .min(1)
  .refine((v) => Buffer.byteLength(v) <= 32768);
const candidateSchema = z.object({
  title: prose,
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']),
  topicTags: z.array(prose).min(1).max(2000),
  statement: prose,
  constraints: z.array(prose).min(1).max(2000),
  examples: z
    .array(
      z.object({ input: prose, output: prose, explanation: prose.optional() }),
    )
    .min(1)
    .max(2000),
});
export interface CandidateRow {
  readonly problemId: string;
  readonly version: string;
  readonly candidate: unknown;
}
export interface SummaryRow {
  readonly problemId: string;
  readonly version: string;
  readonly title: unknown;
  readonly difficulty: unknown;
  readonly topicTags: unknown;
}
export function projectSummary(row: CandidateRow | SummaryRow) {
  const raw =
    'candidate' in row
      ? row.candidate
      : {
          title: row.title,
          difficulty: row.difficulty,
          topicTags: row.topicTags,
        };
  const parsed = candidateSchema
    .pick({ title: true, difficulty: true, topicTags: true })
    .safeParse(raw);
  if (!parsed.success) throw new CatalogueFailure('catalogue_unavailable');
  return Object.freeze({
    problemId: row.problemId,
    title: parsed.data.title,
    difficulty: parsed.data.difficulty,
    topicTags: Object.freeze([...parsed.data.topicTags]),
    latestPublishedVersion: row.version,
  });
}
export function projectCandidate(row: CandidateRow) {
  const parsed = candidateSchema.safeParse(row.candidate);
  if (!parsed.success) throw new CatalogueFailure('catalogue_unavailable');
  const value = Object.freeze({
    statement: parsed.data.statement,
    constraints: Object.freeze([...parsed.data.constraints]),
    examples: Object.freeze(
      parsed.data.examples.map((e) =>
        Object.freeze({
          input: e.input,
          output: e.output,
          ...(e.explanation === undefined
            ? {}
            : { explanation: e.explanation }),
        }),
      ),
    ),
  });
  if (Buffer.byteLength(JSON.stringify(value)) > 262144)
    throw new CatalogueFailure('catalogue_unavailable');
  return value;
}
export function projectDetail(row: CandidateRow) {
  const value = Object.freeze({
    ...projectSummary(row),
    ...projectCandidate(row),
    problemPackVersion: row.version,
  });
  if (Buffer.byteLength(JSON.stringify(value)) > 262144)
    throw new CatalogueFailure('catalogue_unavailable');
  return value;
}
export type ProblemSummary = ReturnType<typeof projectSummary>;
export type ProblemDetail = ReturnType<typeof projectDetail>;

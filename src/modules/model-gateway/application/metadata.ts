import { reservation } from './budgets';
import type { GatewayMetadata, RateCard } from './types';
export type Completeness = 'complete' | 'partial' | 'unknown';
export type TokenCounts = Readonly<{
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  cachedInputTokens: number | null;
}>;
export type AttemptUsage = TokenCounts &
  Readonly<{ completeness: Completeness }>;
export type AttemptMetadata = Readonly<{
  attempt: number;
  attemptId: string;
  durationMs: number;
  outcome: GatewayMetadata['outcome'];
  usage: AttemptUsage;
  estimatedCostUsd: number | null;
}>;
export type GatewayUsage = Readonly<{
  completeness: Completeness;
  unknownAttempts: number;
  partialAttempts: number;
  totals: TokenCounts;
  attempts: readonly AttemptMetadata[];
}>;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
export function normalizeUsage(raw: unknown): AttemptUsage {
  const source =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const inputTokens = count(source.inputTokens),
    outputTokens = count(source.outputTokens);
  let totalTokens = count(source.totalTokens);
  let reasoningTokens = count(source.reasoningTokens),
    cachedInputTokens = count(source.cachedInputTokens);
  let inconsistent = false;
  if (inputTokens !== null && outputTokens !== null) {
    const sum = count(inputTokens + outputTokens);
    if (source.totalTokens === undefined) totalTokens = sum;
    else if (totalTokens !== sum) {
      totalTokens = null;
      inconsistent = true;
    }
  }
  if (
    reasoningTokens !== null &&
    (outputTokens === null || reasoningTokens > outputTokens)
  ) {
    reasoningTokens = null;
    inconsistent = true;
  }
  if (
    cachedInputTokens !== null &&
    (inputTokens === null || cachedInputTokens > inputTokens)
  ) {
    cachedInputTokens = null;
    inconsistent = true;
  }
  const completeness =
    !inconsistent &&
    inputTokens !== null &&
    outputTokens !== null &&
    totalTokens !== null
      ? 'complete'
      : [
            inputTokens,
            outputTokens,
            totalTokens,
            reasoningTokens,
            cachedInputTokens,
          ].some((v) => v !== null)
        ? 'partial'
        : 'unknown';
  return Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
    completeness,
  });
}
export function estimateUsage(
  usage: AttemptUsage,
  card: RateCard | undefined,
  model: string | null,
): number | null {
  if (
    !card ||
    !model ||
    reservation(card, model, 1, 0, 1) === null ||
    usage.inputTokens === null ||
    usage.outputTokens === null
  )
    return null;
  const cached = usage.cachedInputTokens ?? 0;
  const value =
    ((usage.inputTokens - cached) * card.inputUsdPerMillion +
      cached * (card.cachedInputUsdPerMillion ?? card.inputUsdPerMillion) +
      usage.outputTokens * card.outputUsdPerMillion) /
    1_000_000;
  return Number.isFinite(value) ? value : null;
}
export function summarizeUsage(
  attempts: readonly AttemptMetadata[],
): GatewayUsage {
  const unknownAttempts = attempts.filter(
    (a) => a.usage.completeness === 'unknown',
  ).length;
  const partialAttempts = attempts.filter(
    (a) => a.usage.completeness === 'partial',
  ).length;
  const sum = (key: keyof TokenCounts) => {
    const counts = attempts
      .map((a) => a.usage[key])
      .filter((n): n is number => n !== null);
    return counts.length ? count(counts.reduce((a, b) => a + b, 0)) : null;
  };
  const completeness =
    !attempts.length || unknownAttempts === attempts.length
      ? 'unknown'
      : unknownAttempts || partialAttempts
        ? 'partial'
        : 'complete';
  return Object.freeze({
    completeness,
    unknownAttempts,
    partialAttempts,
    totals: Object.freeze({
      inputTokens: sum('inputTokens'),
      outputTokens: sum('outputTokens'),
      totalTokens: sum('totalTokens'),
      reasoningTokens: sum('reasoningTokens'),
      cachedInputTokens: sum('cachedInputTokens'),
    }),
    attempts: Object.freeze(attempts.map((a) => Object.freeze({ ...a }))),
  });
}
// Only a flattened projection crosses the logger boundary; it never receives a provider object.
export function modelCallLogFields(
  metadata: GatewayMetadata,
): Readonly<Record<string, unknown>> {
  const { usage, ...fields } = metadata;
  return Object.freeze({
    ...fields,
    ...usage.totals,
    usageCompleteness: usage.completeness,
    unknownAttempts: usage.unknownAttempts,
    partialAttempts: usage.partialAttempts,
  });
}

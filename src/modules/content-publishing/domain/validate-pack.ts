import { z } from 'zod';
import {
  packSchema,
  PACK_LIMITS,
  type DeepReadonly,
  type MutableProblemPack,
  type ProblemPack,
} from './pack-schema';
import {
  canonicalizePack,
  checksumPack,
  PackJsonFailure,
  parsePackJson,
} from './checksum';

export type PackValidationError = Readonly<{ code: string; path: string }>;
export type PackValidationResult =
  | Readonly<{
      ok: true;
      pack: ProblemPack;
      checksum: string;
      /** Metadata readiness only; detached independent review and authority are still required. */ publishable: boolean;
    }>
  | Readonly<{
      ok: false;
      errors: readonly PackValidationError[];
      truncated: boolean;
    }>;
function immutable<T>(value: T): DeepReadonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Offline data admission only. This function neither fetches nor executes authored material. */
export function validatePack(
  raw: Uint8Array | string,
  mode: 'draft' | 'publication' = 'draft',
): PackValidationResult {
  const errors: PackValidationError[] = [];
  let truncated = false;
  const add = (code: string, path: string) => {
    if (errors.length < PACK_LIMITS.errors) errors.push({ code, path });
    else truncated = true;
  };
  const invalid = (): PackValidationResult =>
    immutable({ ok: false as const, errors, truncated });
  let input: unknown;
  try {
    input = parsePackJson(raw);
  } catch (error) {
    add(
      error instanceof PackJsonFailure ? error.code : 'invalid_json',
      'bundle',
    );
    return invalid();
  }
  // Validate descendants before handing a container to Zod's bulk parser. Zod
  // otherwise materializes every issue before an error callback/output cap runs.
  // The selected strict schema remains the sole source of field/type/refinement
  // rules; this traversal only adds early bounded admission and error budgeting.
  const preflight = (
    schema: z.core.$ZodType,
    value: unknown,
    path: string,
  ): void => {
    if (truncated) return;
    const before = errors.length;
    if (schema instanceof z.ZodOptional) {
      if (value !== undefined) preflight(schema.unwrap(), value, path);
      return;
    }
    if (schema instanceof z.ZodNullable) {
      if (value !== null) preflight(schema.unwrap(), value, path);
      return;
    }
    if (schema instanceof z.ZodObject) {
      if (
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        const record = value as Record<string, unknown>;
        const shape = schema.shape;
        for (const key in record) {
          if (Object.hasOwn(record, key) && !Object.hasOwn(shape, key)) {
            add('invalid_schema', path);
            return;
          }
        }
        for (const [key, child] of Object.entries(shape)) {
          preflight(
            child,
            record[key],
            path === 'bundle' ? key : `${path}.${key}`,
          );
          if (truncated) return;
        }
      }
    } else if (schema instanceof z.ZodArray) {
      if (Array.isArray(value)) {
        const maximum = path.endsWith('.input.nums')
          ? 10000
          : path === 'evaluation.cases'
            ? PACK_LIMITS.cases
            : PACK_LIMITS.entries;
        if (value.length > maximum) {
          add('invalid_schema', path);
          return;
        }
        for (let i = 0; i < value.length; i++) {
          preflight(schema.element, value[i], `${path}.${i}`);
          if (truncated) return;
        }
      }
    } else if (schema instanceof z.ZodTuple) {
      if (Array.isArray(value)) {
        const items = schema.def.items;
        if (schema.def.rest || value.length !== items.length) {
          add('invalid_schema', path);
          return;
        }
        for (let i = 0; i < items.length; i++) {
          preflight(items[i]!, value[i], `${path}.${i}`);
          if (truncated) return;
        }
      }
    } else if (
      !['string', 'number', 'boolean', 'literal', 'enum'].includes(
        schema._zod.def.type,
      )
    ) {
      // A registry/schema extension must explicitly define bounded traversal.
      add('unsupported_schema_node', path);
      return;
    }
    if (errors.length !== before || truncated || schema === packSchema) return;
    const checked = z.safeParse(schema, value);
    if (!checked.success) {
      // Children already passed; only a bounded node-local failure can remain.
      for (const issue of checked.error.issues) {
        add(
          'invalid_schema',
          issue.path.length ? `${path}.${issue.path.join('.')}` : path,
        );
        if (truncated) return;
      }
    }
  };
  preflight(packSchema, input, 'bundle');
  if (errors.length) return invalid();

  const parsed = packSchema.safeParse(input);
  if (!parsed.success) {
    // Strict schemas only emit declared property paths and array indexes. Unknown-key
    // diagnostics use their containing object path, never authored key names/messages.
    for (const issue of parsed.error.issues)
      add(
        'invalid_schema',
        issue.path.length ? issue.path.join('.') : 'bundle',
      );
    return invalid();
  }
  const pack = parsed.data;
  const index = (entries: readonly { id: string }[], path: string) => {
    const result = new Set<string>();
    entries.forEach((entry, i) => {
      if (result.has(entry.id)) add('duplicate_id', `${path}.${i}.id`);
      result.add(entry.id);
    });
    return result;
  };
  const refs = (
    values: readonly string[],
    known: ReadonlySet<string>,
    path: string,
  ) =>
    values.forEach((value, i) => {
      if (!known.has(value)) add('unknown_reference', `${path}.${i}`);
    });
  const interview = pack.interview;
  index(interview.clarifications, 'interview.clarifications');
  const approachIds = index(interview.approaches, 'interview.approaches');
  index(interview.mistakes, 'interview.mistakes');
  index(interview.hintLadders, 'interview.hintLadders');
  index(interview.followups, 'interview.followups');
  index(interview.variants, 'interview.variants');
  index(interview.rubric.dimensions, 'interview.rubric.dimensions');
  const sources = index(pack.provenance.sources, 'provenance.sources');
  const cases = index(pack.evaluation.cases, 'evaluation.cases');
  const hintIds = new Set<string>();
  for (const section of ['mistakes', 'followups', 'variants'] as const)
    if (
      interview[section].length === 0 &&
      !interview.emptySectionReasons?.[section]
    )
      add('empty_section_reason_required', `interview.${section}`);
  interview.mistakes.forEach((entry, i) => {
    refs(entry.approachIds, approachIds, `interview.mistakes.${i}.approachIds`);
    refs(entry.testCaseIds, cases, `interview.mistakes.${i}.testCaseIds`);
  });
  interview.hintLadders.forEach((ladder, i) => {
    if (!approachIds.has(ladder.approachId))
      add('unknown_reference', `interview.hintLadders.${i}.approachId`);
    ladder.hints.forEach((hint, j) => {
      const path = `interview.hintLadders.${i}.hints.${j}`;
      if (hintIds.has(hint.id)) add('duplicate_id', `${path}.id`);
      hintIds.add(hint.id);
      if (hint.ordinal !== j + 1) add('invalid_hint_order', `${path}.ordinal`);
    });
  });
  interview.followups.forEach((entry, i) => {
    refs(
      entry.approachIds,
      approachIds,
      `interview.followups.${i}.approachIds`,
    );
    refs(
      entry.sourceReferences,
      sources,
      `interview.followups.${i}.sourceReferences`,
    );
  });
  interview.variants.forEach((entry, i) =>
    refs(entry.approachIds, approachIds, `interview.variants.${i}.approachIds`),
  );
  const manifest = pack.evaluation.manifest;
  if (
    manifest.caseIds.length !== pack.evaluation.cases.length ||
    manifest.caseIds.some((id, i) => id !== pack.evaluation.cases[i]?.id)
  )
    add('invalid_case_manifest', 'evaluation.manifest.caseIds');
  const publicCases = new Map<
    string,
    MutableProblemPack['evaluation']['cases'][number][]
  >();
  pack.evaluation.cases.forEach((entry, i) => {
    const path = `evaluation.cases.${i}`;
    refs(
      entry.validationEvidence.sourceReferences,
      sources,
      `${path}.validationEvidence.sourceReferences`,
    );
    for (const field of ['input', 'expectedOutput'] as const)
      if (Buffer.byteLength(canonicalizePack(entry[field])) > PACK_LIMITS.data)
        add('test_data_too_large', `${path}.${field}`);
    const { nums, target } = entry.input;
    const [a, b] = entry.expectedOutput;
    if (
      a === b ||
      a >= nums.length ||
      b >= nums.length ||
      (nums[a] ?? NaN) + (nums[b] ?? NaN) !== target
    )
      add('invalid_expected_pair', `${path}.expectedOutput`);
    const frequencies = new Map<number, number>();
    let pairs = 0;
    for (const n of nums) {
      pairs += frequencies.get(target - n) ?? 0;
      frequencies.set(n, (frequencies.get(n) ?? 0) + 1);
    }
    if (pairs !== 1) add('non_unique_answer', `${path}.input`);
    if (entry.visibility === 'public') {
      const key = canonicalizePack(entry.input);
      const existing = publicCases.get(key) ?? [];
      existing.push(entry);
      publicCases.set(key, existing);
    }
  });
  pack.candidate.examples.forEach((example, i) => {
    const path = `candidate.examples.${i}`;
    try {
      const input = parsePackJson(example.input),
        output = parsePackJson(example.output);
      const matches = publicCases.get(canonicalizePack(input));
      if (
        !Array.isArray(output) ||
        output.length !== 2 ||
        !output.every(
          (n) => typeof n === 'number' && Number.isSafeInteger(n),
        ) ||
        !matches?.some((entry) => {
          const [a, b] = entry.expectedOutput;
          return (
            (output[0] === a && output[1] === b) ||
            (output[0] === b && output[1] === a)
          );
        })
      )
        add('example_not_public_case', path);
    } catch {
      add('invalid_example_json', path);
    }
  });
  const detail = {
    problemId: pack.problemId,
    ...pack.candidate,
    latestPublishedVersion: pack.version,
    problemPackVersion: pack.version,
  };
  if (Buffer.byteLength(JSON.stringify(detail)) > PACK_LIMITS.candidate)
    add('candidate_too_large', 'candidate');
  if (
    pack.provenance.rightsReview.status === 'approved' &&
    pack.provenance.rightsReview.evidence === null
  )
    add('rights_evidence_required', 'provenance.rightsReview.evidence');
  const readiness: PackValidationError[] = [];
  if (pack.authorId === null)
    readiness.push({ code: 'author_required', path: 'authorId' });
  interview.followups.forEach((entry, i) => {
    if (entry.reviewStatus !== 'approved')
      readiness.push({
        code: 'review_pending',
        path: `interview.followups.${i}.reviewStatus`,
      });
  });
  interview.variants.forEach((entry, i) => {
    if (entry.reviewStatus !== 'approved')
      readiness.push({
        code: 'review_pending',
        path: `interview.variants.${i}.reviewStatus`,
      });
  });
  pack.evaluation.cases.forEach((entry, i) => {
    if (entry.validationEvidence.humanReviewStatus !== 'approved')
      readiness.push({
        code: 'review_pending',
        path: `evaluation.cases.${i}.validationEvidence.humanReviewStatus`,
      });
  });
  if (
    pack.provenance.rightsReview.status !== 'approved' ||
    pack.provenance.rightsReview.evidence === null
  )
    readiness.push({
      code: 'rights_review_required',
      path: 'provenance.rightsReview',
    });
  if (mode === 'publication')
    for (const error of readiness) add(error.code, error.path);
  if (errors.length) return invalid();
  return immutable({
    ok: true as const,
    pack,
    checksum: checksumPack(pack),
    publishable: readiness.length === 0,
  });
}

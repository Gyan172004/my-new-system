import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  projectDetail,
  projectSummary,
} from '../../src/modules/problem-catalogue/application/projections';
import { createApprovedPack } from '../fixtures/problem-catalogue';
import { catalogueResponse } from '../../src/server/catalogue-http';
import { CatalogueFailure } from '../../src/modules/problem-catalogue/public';
const contract = parse(readFileSync('contracts/api/v1_openapi.yaml', 'utf8'));
const ajv = new Ajv2020({ strict: false });
const validator = (schema: string) =>
  ajv.compile({
    components: contract.components,
    $ref: '#/components/schemas/' + schema,
  });
it('candidate projections satisfy canonical list/detail schemas and contain only the allowlist', () => {
  const p = createApprovedPack();
  const row = {
    problemId: p.problemId,
    version: p.version,
    candidate: p.candidate,
  };
  expect(validator('ProblemDetail')(projectDetail(row))).toBe(true);
  expect(
    validator('ProblemListResponse')({
      items: [projectSummary(row)],
      nextCursor: null,
    }),
  ).toBe(true);
  expect(JSON.stringify(projectDetail(row))).not.toContain('interview');
});
it('maps catalogue domain and dependency errors to canonical safe error schemas', async () => {
  const validate = validator('ApiError');
  for (const [error, status] of [
    [new CatalogueFailure('bad_request'), 400],
    [new CatalogueFailure('not_found'), 404],
    [new Error('CANARY_SQL'), 503],
  ] as const) {
    const response = await catalogueResponse(async () => {
      throw error;
    });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(validate(body)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('CANARY');
  }
});

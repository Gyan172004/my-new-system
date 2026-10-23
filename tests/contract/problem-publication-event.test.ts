import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../contracts/events/async_schemas.json';
import { publicationEvent } from '../../src/modules/content-publishing/application/publish';
it('publication events satisfy the canonical closed event envelope and never contain pack data', () => {
  const ajv = new Ajv2020({ strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const event = publicationEvent(
    'synthetic',
    'v1',
    'a'.repeat(64),
    '2026-10-23T00:00:00.000Z',
  );
  expect(validate(event), JSON.stringify(validate.errors)).toBe(true);
  expect(Object.keys(event.payload).sort()).toEqual([
    'contentChecksum',
    'problemId',
    'problemPackVersion',
    'publishedAt',
    'reviewStatus',
  ]);
  expect(
    validate({
      ...event,
      payload: { ...event.payload, hiddenInput: 'private-canary' },
    }),
  ).toBe(false);
});

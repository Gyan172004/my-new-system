import { expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalOperations } from '../../../src/modules/model-gateway/application/operations';
import { probeOutputSchema } from '../../../src/modules/model-gateway/application/validation';
import { outputCases } from '../../fixtures/model-gateway/probe';

it.each(outputCases)(
  'provider JSON Schema and runtime agree on exact probe output: $value',
  ({ value, valid }) => {
    const definition = canonicalOperations[0]!;
    const jsonValidate = new Ajv2020({ strict: false }).compile(
      definition.outputJsonSchema!,
    );
    expect(Boolean(jsonValidate(value))).toBe(valid);
    expect(probeOutputSchema.safeParse(value).success).toBe(valid);
  },
);

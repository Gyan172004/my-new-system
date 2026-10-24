import { syntheticProbeFixture } from '../../../src/modules/model-gateway/public';
export const probeInput = syntheticProbeFixture.input;
export const probeOutput = syntheticProbeFixture.output;
export const probeContext = syntheticProbeFixture.context;
export const outputCases = [
  { value: { schemaVersion: 1, acknowledged: true }, valid: true },
  { value: { schemaVersion: 2, acknowledged: true }, valid: false },
  { value: { schemaVersion: 1, acknowledged: false }, valid: false },
  { value: { schemaVersion: 1 }, valid: false },
  {
    value: { schemaVersion: 1, acknowledged: true, extra: 'private' },
    valid: false,
  },
  { value: null, valid: false },
] as const;

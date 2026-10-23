export const probeInput = Object.freeze({
  text: 'Synthetic gateway probe v1.',
});
export const probeOutput = Object.freeze({
  schemaVersion: 1,
  acknowledged: true,
});
export const probeContext = Object.freeze({
  requestId: 'b648277e-ad0b-48cf-996d-128c2475f0ce',
  operationId: 'synthetic-probe-v1',
});
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

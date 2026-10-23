// Versioned public synthetic text only. Production code never imports test directories.
export const syntheticProbeFixture = Object.freeze({
  id: 'gateway-probe-v1',
  input: Object.freeze({ text: 'Synthetic gateway probe v1.' }),
  output: Object.freeze({ schemaVersion: 1, acknowledged: true }),
  context: Object.freeze({
    requestId: 'b648277e-ad0b-48cf-996d-128c2475f0ce',
    operationId: 'synthetic-probe-v1',
  }),
});

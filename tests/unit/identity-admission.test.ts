import { expect, it } from 'vitest';
import { createAdmission } from '../../src/modules/identity-profile/application/admission';
const identity = {
  provider: 'clerk',
  issuer: 'https://clerk.example',
  subject: 'user_alice',
};
it('enforces independent global/source/identity budgets and computes refill Retry-After', () => {
  let now = 0;
  const admission = createAdmission({
    now: () => now,
    global: { capacity: 10, refillPerMinute: 10 },
    source: { capacity: 1, refillPerMinute: 1 },
    identity: { capacity: 1, refillPerMinute: 1 },
  });
  admission.beforeVerification('127.0.0.1');
  expect(() => admission.beforeVerification('127.0.0.1')).toThrow(
    expect.objectContaining({ status: 429, retryAfterSeconds: 60 }),
  );
  admission.beforeVerification('127.0.0.2');
  admission.beforeMapping(identity);
  expect(() => admission.beforeMapping(identity)).toThrow(
    expect.objectContaining({ status: 429, retryAfterSeconds: 60 }),
  );
  now = 30000;
  expect(() => admission.beforeMapping(identity)).toThrow(
    expect.objectContaining({ retryAfterSeconds: 30 }),
  );
  now = 60000;
  admission.beforeMapping(identity);
  admission.beforeVerification('127.0.0.1');
});
it('serializes simultaneous admission without over-admitting and blocks all source rotation at the global cap', async () => {
  const admission = createAdmission({
    global: { capacity: 2, refillPerMinute: 1 },
  });
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      Promise.resolve().then(() => {
        try {
          admission.beforeVerification('127.0.0.' + (i + 1));
          return true;
        } catch {
          return false;
        }
      }),
    ),
  );
  expect(outcomes.filter(Boolean)).toHaveLength(2);
});
it('bounds bucket state, never evicts depleted identities and recovers after safe expiry', () => {
  let now = 0;
  const admission = createAdmission({ now: () => now, maxEntries: 2 });
  admission.beforeVerification('127.0.0.1');
  admission.beforeMapping(identity);
  expect(() => admission.beforeVerification('127.0.0.2')).toThrow(
    expect.objectContaining({ status: 429 }),
  );
  expect(admission.observe().activeBuckets).toBe(2);
  now = 120000;
  admission.beforeVerification('127.0.0.2');
  expect(admission.observe().activeBuckets).toBeLessThanOrEqual(2);
});
it('fails closed after lifecycle shutdown and rejects invalid limiter policies', async () => {
  const admission = createAdmission();
  await admission.close();
  expect(() => admission.beforeVerification('127.0.0.1')).toThrow(
    expect.objectContaining({ status: 503 }),
  );
  expect(() => admission.beforeMapping(identity)).toThrow(
    expect.objectContaining({ status: 503 }),
  );
  for (const options of [
    { maxEntries: 0 },
    { global: { capacity: 0, refillPerMinute: 1 } },
    { source: { capacity: 1, refillPerMinute: 0 } },
  ])
    expect(() => createAdmission(options)).toThrow();
});
it('does not refund depleted budgets on a backwards clock or expose raw identity in observations', () => {
  let now = 60000;
  const admission = createAdmission({
    now: () => now,
    identity: { capacity: 1, refillPerMinute: 1 },
  });
  admission.beforeMapping(identity);
  now = 0;
  expect(() => admission.beforeMapping(identity)).toThrow(
    expect.objectContaining({ status: 429 }),
  );
  expect(JSON.stringify(admission.observe())).not.toContain('user_alice');
});

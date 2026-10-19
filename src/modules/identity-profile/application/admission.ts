import { IdentityFailure, unavailable, type VerifiedIdentity } from './types';
interface Budget {
  readonly capacity: number;
  readonly refillPerMinute: number;
}
interface Bucket {
  tokens: number;
  at: number;
  budget: Budget;
}
export interface AdmissionOptions {
  readonly now?: () => number;
  readonly global?: Budget;
  readonly source?: Budget;
  readonly identity?: Budget;
  readonly maxEntries?: number;
}
export function createAdmission(options: AdmissionOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const global = options.global ?? { capacity: 120, refillPerMinute: 120 };
  const source = options.source ?? { capacity: 30, refillPerMinute: 30 };
  const identity = options.identity ?? { capacity: 60, refillPerMinute: 60 };
  const maxEntries = options.maxEntries ?? 2048;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000)
    throw new Error('invalid_admission_policy');
  for (const budget of [global, source, identity]) {
    if (
      !Number.isSafeInteger(budget.capacity) ||
      !Number.isSafeInteger(budget.refillPerMinute) ||
      budget.capacity < 1 ||
      budget.refillPerMinute < 1 ||
      budget.capacity > 10000 ||
      budget.refillPerMinute > 10000
    )
      throw new Error('invalid_admission_policy');
  }
  let stopped = false;
  const buckets = new Map<string, Bucket>();
  let cursor = buckets.entries();
  const globalBucket: Bucket = {
    tokens: global.capacity,
    at: now(),
    budget: global,
  };
  const refill = (bucket: Bucket, time: number) => {
    const elapsed = Math.max(0, time - bucket.at);
    bucket.tokens = Math.min(
      bucket.budget.capacity,
      bucket.tokens + (elapsed * bucket.budget.refillPerMinute) / 60000,
    );
    bucket.at = Math.max(time, bucket.at);
  };
  const limited = (seconds: number): never => {
    throw new IdentityFailure(
      429,
      'rate_limited',
      Math.max(1, Math.ceil(seconds)),
    );
  };
  const ready = () => {
    if (stopped) throw unavailable();
  };
  const cleanup = (time: number) => {
    for (let i = 0; i < 8; i++) {
      const next = cursor.next();
      if (next.done) {
        cursor = buckets.entries();
        break;
      }
      const [key, bucket] = next.value;
      refill(bucket, time);
      if (bucket.tokens === bucket.budget.capacity) buckets.delete(key);
    }
  };
  const consume = (bucket: Bucket, time: number) => {
    refill(bucket, time);
    if (bucket.tokens < 1)
      limited(((1 - bucket.tokens) * 60) / bucket.budget.refillPerMinute);
    bucket.tokens -= 1;
  };
  const consumeKey = (key: string, budget: Budget, time: number) => {
    cleanup(time);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxEntries)
        limited(
          Math.max(
            source.capacity / source.refillPerMinute,
            identity.capacity / identity.refillPerMinute,
          ) * 60,
        );
      bucket = { tokens: budget.capacity, at: time, budget };
      buckets.set(key, bucket);
    }
    consume(bucket, time);
  };
  const end = () => {
    stopped = true;
    buckets.clear();
  };
  return {
    beforeVerification(address: string) {
      ready();
      if (!address || address.length > 128) throw unavailable();
      const time = now();
      consume(globalBucket, time);
      consumeKey('source:' + address, source, time);
    },
    beforeMapping(value: VerifiedIdentity) {
      ready();
      consumeKey(
        'identity:' +
          JSON.stringify([value.provider, value.issuer, value.subject]),
        identity,
        now(),
      );
    },
    observe() {
      return Object.freeze({ activeBuckets: buckets.size });
    },
    async close() {
      end();
    },
    destroy: end,
  };
}

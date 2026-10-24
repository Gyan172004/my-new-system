import { randomInt } from 'node:crypto';
import type { RateCard } from './types';
export function safely(action: () => void) {
  try {
    action();
  } catch {
    /* Cleanup cannot replace a call outcome. */
  }
}
export function createAdmission() {
  let active = 0;
  return {
    acquire(limit: number): (() => void) | null {
      if (active >= limit) return null;
      active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          active--;
        }
      };
    },
  };
}
export function createScope(
  signals: readonly AbortSignal[],
  timeoutMs: number,
) {
  const controller = new AbortController();
  let expired = false;
  const abort = () => safely(() => controller.abort());
  const timer = setTimeout(
    () => {
      expired = true;
      abort();
    },
    Math.max(0, timeoutMs),
  );
  const cleanup = () => {
    clearTimeout(timer);
    for (const signal of signals)
      safely(() => signal.removeEventListener('abort', abort));
    abort();
  };
  try {
    for (const signal of signals) {
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return {
    signal: controller.signal,
    get expired() {
      return expired;
    },
    close: cleanup,
  };
}
// Race even adapters that fail to honor abort; settled late promises cannot mutate call state.
export function abortable<T>(
  work: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (success: boolean, value: T | unknown) => {
      if (settled) return;
      settled = true;
      safely(() => signal.removeEventListener('abort', abort));
      if (success) resolve(value as T);
      else reject(value);
    };
    const abort = () => finish(false, new Error('gateway_aborted'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve()
      .then(() => {
        if (signal.aborted) throw new Error('gateway_aborted');
        return work();
      })
      .then(
        (value) => finish(true, value),
        (error) => finish(false, error),
      );
  });
}
export function reservation(
  card: RateCard | undefined,
  model: string,
  input: number | null,
  output: number,
  attempts: number,
): number | null {
  if (
    !card ||
    !card.reviewed ||
    card.model !== model ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(card.version) ||
    !Number.isFinite(card.inputUsdPerMillion) ||
    card.inputUsdPerMillion < 0 ||
    !Number.isFinite(card.outputUsdPerMillion) ||
    card.outputUsdPerMillion < 0 ||
    (card.cachedInputUsdPerMillion !== undefined &&
      (!Number.isFinite(card.cachedInputUsdPerMillion) ||
        card.cachedInputUsdPerMillion < 0)) ||
    input === null ||
    !Number.isSafeInteger(input) ||
    input < 1
  )
    return null;
  const cost =
    (attempts *
      (input *
        Math.max(card.inputUsdPerMillion, card.cachedInputUsdPerMillion ?? 0) +
        output * card.outputUsdPerMillion)) /
    1_000_000;
  return Number.isFinite(cost) ? cost : null;
}

export function retryDelay(
  raw: string | undefined,
  milliseconds?: number,
): number {
  let providerDelay = 0;
  if (raw !== undefined) {
    const value = raw.trim();
    if (/^\d+$/.test(value)) providerDelay = Number(value) * 1000;
    else if (
      /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
        value,
      )
    ) {
      const date = Date.parse(value);
      if (Number.isFinite(date)) providerDelay = Math.max(0, date - Date.now());
    }
  } else if (
    milliseconds !== undefined &&
    Number.isFinite(milliseconds) &&
    milliseconds >= 0
  )
    providerDelay = milliseconds;
  return Math.max(randomInt(250, 501), providerDelay);
}
export async function sleep(delay: number, signal: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await abortable(
      () =>
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, delay);
        }),
      signal,
    );
  } finally {
    clearTimeout(timer);
  }
}

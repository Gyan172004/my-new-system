// Process observation only: never acquire storage, providers or migration state.
export function liveness() {
  return { status: 'ok' as const, timestamp: new Date().toISOString() };
}

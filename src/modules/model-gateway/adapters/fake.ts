import type { GatewayAdapter } from '../application/types';
export function createFakeAdapter(): GatewayAdapter {
  return Object.freeze({
    provider: 'fake',
    async send() {
      return {
        status: 'complete',
        text: '{"schemaVersion":1,"acknowledged":true}',
        reportedModel: 'fake-probe-v1',
        usage: null,
      } as const;
    },
  });
}

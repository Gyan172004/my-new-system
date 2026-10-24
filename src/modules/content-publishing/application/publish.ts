import { randomUUID } from 'node:crypto';
import type { PublicationEvent } from './types';
export function publicationEvent(
  problemId: string,
  version: string,
  checksum: string,
  publishedAt: string,
): PublicationEvent {
  return Object.freeze({
    eventId: randomUUID(),
    eventType: 'content.problem_pack.published',
    schemaVersion: 1,
    occurredAt: publishedAt,
    producer: 'content-publishing',
    correlationId: randomUUID(),
    payload: Object.freeze({
      problemId,
      problemPackVersion: version,
      publishedAt,
      reviewStatus: 'approved',
      contentChecksum: checksum,
    }),
  });
}

export interface PublicationEvent {
  readonly eventId: string;
  readonly eventType: 'content.problem_pack.published';
  readonly schemaVersion: 1;
  readonly occurredAt: string;
  readonly producer: 'content-publishing';
  readonly correlationId: string;
  readonly payload: Readonly<{
    problemId: string;
    problemPackVersion: string;
    publishedAt: string;
    reviewStatus: 'approved';
    contentChecksum: string;
  }>;
}
export interface PublicationReceipt {
  readonly releaseId: string;
  readonly reviewId: string;
  readonly publisherId: string;
  readonly publishedAt: string;
  readonly permissionRevision: string;
  readonly permissionDigest: string;
  readonly event: PublicationEvent;
}

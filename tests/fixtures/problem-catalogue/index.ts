import fixture from './synthetic-approved.json';

/** Synthetic fixture identities and annotations never establish real content approval. */
export function createApprovedPack() {
  return structuredClone(fixture);
}

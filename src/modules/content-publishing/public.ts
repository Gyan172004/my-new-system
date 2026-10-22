// Server-only, data-only admission boundary. Readiness never grants publication authority.
export { validatePack } from './domain/validate-pack';
export type {
  PackValidationError,
  PackValidationResult,
} from './domain/validate-pack';
export type { ProblemPack, DeepReadonly } from './domain/pack-schema';
export {
  checksumPack,
  canonicalizePack,
  parsePackJson,
  PackJsonFailure,
} from './domain/checksum';

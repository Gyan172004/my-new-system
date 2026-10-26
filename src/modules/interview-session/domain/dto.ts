import { z } from 'zod';
const identifier = z.string().min(1).max(256);
const stage = z.string().min(1).max(64);
export const safeSessionSchema = z.strictObject({
  sessionId: z.uuid(),
  problemId: identifier,
  problemPackVersion: identifier,
  status: z.string().min(1).max(32),
  currentStage: stage,
  version: z.number().int().min(0),
  createdAt: z.string(),
  updatedAt: z.string(),
  latestTurn: z
    .strictObject({ id: z.uuid(), text: z.string().min(1).max(8192) })
    .optional(),
});
export const commandResponseSchema = z.strictObject({
  session: safeSessionSchema,
  etag: z.string(),
});
export const approachAssessedEventSchema = z.strictObject({
  sessionId: z.uuid(),
  userId: z.uuid(),
  sessionVersion: z.number().int().min(0),
  problemId: identifier,
  problemPackVersion: identifier,
  stage,
  actionType: z.literal('candidate_response'),
  assessmentId: z.uuid(),
  candidateTurnId: z.uuid(),
  turnId: z.uuid(),
});
export const hintExposedEventSchema = z.strictObject({
  sessionId: z.uuid(),
  userId: z.uuid(),
  sessionVersion: z.number().int().min(0),
  problemId: identifier,
  problemPackVersion: identifier,
  stage,
  actionType: z.literal('request_hint'),
  exposureId: z.uuid(),
  ladderId: identifier,
  hintId: identifier,
  localOrdinal: z.number().int().positive(),
  turnId: z.uuid(),
});

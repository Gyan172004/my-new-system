import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { createDatabase } from '../../../server/database';
import {
  repositoryClient,
  type TransactionScope,
} from '../../../server/transaction';
export interface Snapshot {
  readonly sessionId: string;
  readonly problemId: string;
  readonly problemPackVersion: string;
  readonly currentStage: string;
  readonly status: string;
  readonly version: number;
}
export interface PinnedInput {
  readonly problemId: string;
  readonly problemPackVersion: string;
  readonly clientContext?:
    | {
        readonly selfReportedExperience?: string | undefined;
        readonly preferredInterviewLanguage?: string | undefined;
      }
    | undefined;
}
const columns =
  'id AS "sessionId", problem_id AS "problemId", problem_pack_version AS "problemPackVersion", current_stage AS "currentStage", status, version';
export function createSessionRepository(
  db: Pick<ReturnType<typeof createDatabase>, 'withClient'>,
) {
  const transaction = async <T>(
    work: (client: PoolClient) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> => {
    try {
      return await db.withClient(async (c) => {
        await c.query('BEGIN');
        try {
          const result = await work(c);
          await c.query('COMMIT');
          return result;
        } catch {
          await c.query('ROLLBACK');
          throw new Error('session_unavailable');
        }
      }, signal);
    } catch {
      throw new Error('session_unavailable');
    }
  };
  const event = async (
    c: PoolClient,
    owner: string,
    snapshot: Snapshot,
    kind: 'created' | 'started',
  ) => {
    const payload = {
      sessionId: snapshot.sessionId,
      userId: owner,
      sessionVersion: snapshot.version,
      problemId: snapshot.problemId,
      problemPackVersion: snapshot.problemPackVersion,
      stage: snapshot.currentStage,
    };
    await c.query(
      'INSERT INTO session_events (event_id,session_id,session_version,schema_version,event_type,producer,correlation_id,payload) VALUES ($1,$2,$3,1,$4,$5,$6,$7)',
      [
        randomUUID(),
        snapshot.sessionId,
        snapshot.version,
        `interview.session.${kind}`,
        'interview-session',
        randomUUID(),
        payload,
      ],
    );
  };
  const insert = async (c: PoolClient, owner: string, input: PinnedInput) => {
    const result = await c.query<Snapshot>(
      `INSERT INTO interview_sessions (id,owner_id,problem_id,problem_pack_version,current_stage,status,version,context) VALUES ($1,$2,$3,$4,'created','created',0,$5) RETURNING ${columns}`,
      [
        randomUUID(),
        owner,
        input.problemId,
        input.problemPackVersion,
        input.clientContext ?? {},
      ],
    );
    const snapshot = result.rows[0]!;
    await event(c, owner, snapshot, 'created');
    return Object.freeze(snapshot);
  };
  return {
    async createInScope(
      scope: TransactionScope,
      owner: string,
      input: PinnedInput,
    ) {
      return insert(repositoryClient(scope, db), owner, input);
    },
    async create(owner: string, input: PinnedInput, signal?: AbortSignal) {
      return transaction((c) => insert(c, owner, input), signal);
    },
    async read(owner: string, id: string, signal?: AbortSignal) {
      try {
        return await db.withClient(async (c) => {
          const result = await c.query<Snapshot>(
            `SELECT ${columns} FROM interview_sessions WHERE id=$1 AND owner_id=$2`,
            [id, owner],
          );
          return result.rows[0] ? Object.freeze(result.rows[0]) : null;
        }, signal);
      } catch {
        throw new Error('session_unavailable');
      }
    },
    async start(
      owner: string,
      id: string,
      version: number,
      signal?: AbortSignal,
    ) {
      return transaction(async (c) => {
        const result = await c.query<Snapshot>(
          `SELECT ${columns} FROM interview_sessions WHERE id=$1 AND owner_id=$2 FOR UPDATE`,
          [id, owner],
        );
        const previous = result.rows[0];
        if (!previous) return { outcome: 'not_found' as const };
        if (previous.version !== version)
          return { outcome: 'stale_version' as const };
        if (
          previous.status !== 'created' ||
          previous.currentStage !== 'created'
        )
          return { outcome: 'invalid_transition' as const };
        const updated = await c.query<Snapshot>(
          `UPDATE interview_sessions SET current_stage='intro',status='active',version=version+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND version=$3 RETURNING ${columns}`,
          [id, owner, version],
        );
        if (!updated.rows[0]) return { outcome: 'stale_version' as const };
        await event(c, owner, updated.rows[0], 'started');
        return {
          outcome: 'accepted' as const,
          session: Object.freeze(updated.rows[0]),
        };
      }, signal);
    },
  };
}

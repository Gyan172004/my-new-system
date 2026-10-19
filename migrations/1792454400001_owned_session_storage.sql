-- Up Migration
CREATE TABLE interview_sessions (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES users(id),
  problem_id text NOT NULL CHECK (octet_length(problem_id) BETWEEN 1 AND 256),
  problem_pack_version text NOT NULL CHECK (octet_length(problem_pack_version) BETWEEN 1 AND 256),
  current_stage text NOT NULL CHECK (current_stage IN ('created','intro','experience_context','problem_read_and_clarify','problem_restatement','sample_trace','initial_approach','approach_clarification','hints','code','test_and_debug','improve_approach','variants_and_followups','complexity_analysis','feedback','completed')),
  status text NOT NULL CHECK (status IN ('created','active','paused','recoverable_error','completed','abandoned')),
  version integer NOT NULL CHECK (version >= 0),
  context jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(context)='object' AND octet_length(context::text) <= 16384),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX interview_sessions_owner_created_idx ON interview_sessions(owner_id, created_at DESC, id DESC);
CREATE FUNCTION preserve_session_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.problem_id IS DISTINCT FROM OLD.problem_id OR NEW.problem_pack_version IS DISTINCT FROM OLD.problem_pack_version THEN
    RAISE EXCEPTION 'immutable_session_identity';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_session_identity BEFORE UPDATE ON interview_sessions FOR EACH ROW EXECUTE FUNCTION preserve_session_identity();
CREATE TABLE session_events (
  event_id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES interview_sessions(id),
  session_version integer NOT NULL CHECK (session_version >= 0),
  schema_version integer NOT NULL CHECK (schema_version = 1),
  event_type text NOT NULL CHECK (event_type IN ('interview.session.created','interview.session.started','interview.session.transitioned','interview.candidate_response.accepted','interview.approach_assessed','interview.hint.exposed','interview.code_submission.created','interview.session.paused','interview.session.resumed','interview.session.recoverable_failure','interview.feedback.generated','interview.session.completed','interview.session.abandoned','interview.evaluation.evidence_recorded','interview.voice_consent.changed','interview.voice_turn.transcribed','interview.voice_response.speech_generated')),
  producer text NOT NULL CHECK (producer = 'interview-session'),
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text) <= 4096),
  UNIQUE (session_id,session_version)
);

-- Down Migration
DROP TABLE session_events;
DROP TABLE interview_sessions;
DROP FUNCTION preserve_session_identity();

-- Up Migration
ALTER TABLE interview_sessions ADD COLUMN pack_checksum text CHECK(pack_checksum IS NULL OR pack_checksum ~ '^[a-f0-9]{64}$'), ADD COLUMN hint_count integer NOT NULL DEFAULT 0 CHECK(hint_count>=0), ADD COLUMN selected_ladder_id text, ADD COLUMN routing_revision_hash text, ADD COLUMN latest_assessment_id uuid, ADD COLUMN latest_assessment_version integer;
UPDATE interview_sessions s SET pack_checksum=r.content_checksum FROM catalogue_releases r WHERE r.problem_id=s.problem_id AND r.version=s.problem_pack_version AND r.sealed;
ALTER TABLE interview_sessions ADD CONSTRAINT session_hint_lock CHECK((hint_count=0 AND selected_ladder_id IS NULL AND routing_revision_hash IS NULL) OR (hint_count>0 AND selected_ladder_id IS NOT NULL AND routing_revision_hash IS NOT NULL AND routing_revision_hash ~ '^[a-f0-9]{64}$'));
ALTER TABLE interview_sessions ADD CONSTRAINT session_assessment_pair CHECK((latest_assessment_id IS NULL AND latest_assessment_version IS NULL) OR (latest_assessment_id IS NOT NULL AND latest_assessment_version IS NOT NULL AND latest_assessment_version BETWEEN 1 AND version));
CREATE FUNCTION preserve_session_checksum() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD.pack_checksum IS NOT NULL AND NEW.pack_checksum IS DISTINCT FROM OLD.pack_checksum THEN RAISE EXCEPTION 'immutable_session_checksum'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER immutable_session_checksum BEFORE UPDATE ON interview_sessions FOR EACH ROW EXECUTE FUNCTION preserve_session_checksum();
CREATE TABLE session_command_operations (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES users(id), session_id uuid NOT NULL REFERENCES interview_sessions(id), idempotency_key text NOT NULL CHECK(octet_length(idempotency_key) BETWEEN 1 AND 128), command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'), action_type text NOT NULL CHECK(action_type IN ('candidate_response','request_hint')),
 normalized_payload jsonb NOT NULL CHECK(jsonb_typeof(normalized_payload)='object' AND octet_length(normalized_payload::text)<=32768), source_version integer NOT NULL CHECK(source_version>=0), source_stage text NOT NULL, problem_id text NOT NULL, pack_version text NOT NULL, pack_checksum text NOT NULL CHECK(pack_checksum ~ '^[a-f0-9]{64}$'), reserved_candidate_turn_id uuid, reserved_interviewer_turn_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('in_flight','retryable','committed','rejected')), lease_expires_at timestamptz NOT NULL CHECK(isfinite(lease_expires_at)), fence integer NOT NULL CHECK(fence>0), context_hash text CHECK(context_hash ~ '^[a-f0-9]{64}$'), profile_hash text CHECK(profile_hash ~ '^[a-f0-9]{64}$'), replay jsonb CHECK(jsonb_typeof(replay)='object' AND octet_length(replay::text)<=32768), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,session_id,idempotency_key), UNIQUE(session_id,id), CHECK((status='committed')=(replay IS NOT NULL))
);
CREATE INDEX session_command_operations_session_idx ON session_command_operations(session_id);
CREATE FUNCTION preserve_command_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='committed' OR (to_jsonb(NEW)-ARRAY['status','lease_expires_at','fence','context_hash','profile_hash','replay']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','lease_expires_at','fence','context_hash','profile_hash','replay']) OR NEW.fence<OLD.fence OR (OLD.context_hash IS NOT NULL AND NEW.context_hash IS DISTINCT FROM OLD.context_hash) OR (OLD.profile_hash IS NOT NULL AND NEW.profile_hash IS DISTINCT FROM OLD.profile_hash) THEN RAISE EXCEPTION 'immutable_command'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER immutable_command BEFORE UPDATE ON session_command_operations FOR EACH ROW EXECUTE FUNCTION preserve_command_identity();
CREATE TABLE conversation_turns (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES interview_sessions(id), operation_id uuid NOT NULL, speaker text NOT NULL CHECK(speaker IN ('candidate','interviewer')), stage text NOT NULL, modality text NOT NULL CHECK(modality IN ('text','accepted_transcript')), text text NOT NULL CHECK(octet_length(text) BETWEEN 1 AND 32768), result_session_version integer NOT NULL CHECK(result_session_version>0), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,operation_id,speaker), FOREIGN KEY(session_id,operation_id) REFERENCES session_command_operations(session_id,id)
);
CREATE INDEX conversation_turns_session_version_idx ON conversation_turns(session_id,result_session_version DESC,id);
CREATE TABLE approach_assessments (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES interview_sessions(id), operation_id uuid NOT NULL, candidate_turn_id uuid NOT NULL REFERENCES conversation_turns(id) DEFERRABLE INITIALLY DEFERRED, source_session_version integer NOT NULL CHECK(source_session_version>=0), result_session_version integer NOT NULL CHECK(result_session_version=source_session_version+1), problem_id text NOT NULL, pack_version text NOT NULL, pack_checksum text NOT NULL CHECK(pack_checksum ~ '^[a-f0-9]{64}$'), outcome text NOT NULL CHECK(outcome IN ('matched','ambiguous','abstained','novel')), matched_reference_id text, reported_confidence double precision CHECK(reported_confidence BETWEEN 0 AND 1), record jsonb NOT NULL CHECK(jsonb_typeof(record)='object' AND octet_length(record::text)<=262144), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,operation_id), UNIQUE(session_id,id), CHECK((outcome='matched')=(matched_reference_id IS NOT NULL)), FOREIGN KEY(session_id,operation_id) REFERENCES session_command_operations(session_id,id)
);
CREATE INDEX approach_assessments_session_version_idx ON approach_assessments(session_id,result_session_version DESC,id);
CREATE INDEX approach_assessments_candidate_turn_idx ON approach_assessments(candidate_turn_id);
ALTER TABLE interview_sessions ADD CONSTRAINT session_latest_assessment_fk FOREIGN KEY(id,latest_assessment_id) REFERENCES approach_assessments(session_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION assessment_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_assessment_record'; END; $$;
CREATE TRIGGER immutable_assessment BEFORE UPDATE ON approach_assessments FOR EACH ROW EXECUTE FUNCTION assessment_immutable();
CREATE TRIGGER immutable_conversation_turn BEFORE UPDATE ON conversation_turns FOR EACH ROW EXECUTE FUNCTION assessment_immutable();
-- Down Migration
ALTER TABLE interview_sessions DROP CONSTRAINT session_latest_assessment_fk;
DROP TABLE approach_assessments;
DROP TABLE conversation_turns;
DROP TABLE session_command_operations;
DROP FUNCTION assessment_immutable();
DROP FUNCTION preserve_command_identity();
DROP TRIGGER immutable_session_checksum ON interview_sessions;
DROP FUNCTION preserve_session_checksum();
ALTER TABLE interview_sessions DROP CONSTRAINT session_hint_lock, DROP CONSTRAINT session_assessment_pair, DROP COLUMN pack_checksum, DROP COLUMN hint_count, DROP COLUMN selected_ladder_id, DROP COLUMN routing_revision_hash, DROP COLUMN latest_assessment_id, DROP COLUMN latest_assessment_version;

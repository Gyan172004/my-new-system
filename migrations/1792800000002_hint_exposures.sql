-- Up Migration
CREATE TABLE hint_exposures (
 id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES interview_sessions(id), operation_id uuid NOT NULL, turn_id uuid NOT NULL REFERENCES conversation_turns(id) DEFERRABLE INITIALLY DEFERRED,
 ladder_id text NOT NULL CHECK(octet_length(ladder_id) BETWEEN 1 AND 256), routing_revision_hash text NOT NULL CHECK(routing_revision_hash ~ '^[a-f0-9]{64}$'), hint_id text NOT NULL CHECK(octet_length(hint_id) BETWEEN 1 AND 256), local_ordinal integer NOT NULL CHECK(local_ordinal>0),
 source_session_version integer NOT NULL CHECK(source_session_version>=0), result_session_version integer NOT NULL CHECK(result_session_version=source_session_version+1),
 problem_id text NOT NULL, pack_version text NOT NULL, pack_checksum text NOT NULL CHECK(pack_checksum ~ '^[a-f0-9]{64}$'), policy_version text NOT NULL CHECK(octet_length(policy_version) BETWEEN 1 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(session_id,operation_id), UNIQUE(session_id,ladder_id,local_ordinal), UNIQUE(session_id,id),
 FOREIGN KEY(session_id,operation_id) REFERENCES session_command_operations(session_id,id)
);
CREATE INDEX hint_exposures_session_idx ON hint_exposures(session_id,result_session_version DESC,id);
CREATE TRIGGER immutable_hint_exposure BEFORE UPDATE ON hint_exposures FOR EACH ROW EXECUTE FUNCTION assessment_immutable();
-- Down Migration
DROP TABLE hint_exposures;

-- Up Migration
CREATE TABLE catalogue_problems (
 id text PRIMARY KEY CHECK(octet_length(id) BETWEEN 1 AND 256),
 slug text NOT NULL UNIQUE CHECK(octet_length(slug) BETWEEN 1 AND 256),
 current_release_id uuid,
 current_sealed boolean NOT NULL DEFAULT true CHECK(current_sealed),
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Content JSONB storage ceilings allow PostgreSQL whitespace expansion of the
-- independently validated 2 MiB compact pack; these are not extra authoring limits.
CREATE TABLE catalogue_releases (
 id uuid PRIMARY KEY,
 problem_id text NOT NULL REFERENCES catalogue_problems(id),
 version text NOT NULL CHECK(octet_length(version) BETWEEN 1 AND 256),
 schema_version integer NOT NULL CHECK(schema_version=1),
 author_id uuid NOT NULL REFERENCES users(id),
 authored_author_id text NOT NULL CHECK(authored_author_id::uuid=author_id),
 candidate jsonb NOT NULL CHECK(jsonb_typeof(candidate)='object' AND octet_length(candidate::text)<=4194304),
 interview jsonb NOT NULL CHECK(jsonb_typeof(interview)='object' AND octet_length(interview::text)<=4194304),
 provenance jsonb NOT NULL CHECK(jsonb_typeof(provenance)='object' AND octet_length(provenance::text)<=4194304),
 suite_manifest jsonb NOT NULL CHECK(jsonb_typeof(suite_manifest)='object' AND jsonb_typeof(suite_manifest->'caseIds')='array'),
 content_checksum text NOT NULL CHECK(content_checksum ~ '^[a-f0-9]{64}$'),
 published_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false,
 UNIQUE(problem_id,version), UNIQUE(problem_id,id,sealed), UNIQUE(id,sealed)
);
CREATE INDEX catalogue_releases_author_idx ON catalogue_releases(author_id);
ALTER TABLE catalogue_problems ADD CONSTRAINT catalogue_current_release_fk FOREIGN KEY(id,current_release_id,current_sealed) REFERENCES catalogue_releases(problem_id,id,sealed);
CREATE INDEX catalogue_problems_current_idx ON catalogue_problems(current_release_id);
CREATE TABLE catalogue_test_cases (
 release_id uuid NOT NULL REFERENCES catalogue_releases(id),
 case_id text NOT NULL CHECK(octet_length(case_id) BETWEEN 1 AND 256),
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 1000),
 category text NOT NULL,
 visibility text NOT NULL CHECK(visibility IN ('public','hidden')),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object' AND octet_length(definition::text)<=4194304),
 PRIMARY KEY(release_id,case_id), UNIQUE(release_id,ordinal),
 CHECK((definition->>'id'=case_id AND definition->>'category'=category AND definition->>'visibility'=visibility) IS TRUE)
);
CREATE TABLE catalogue_release_availability (
 release_id uuid PRIMARY KEY REFERENCES catalogue_releases(id),
 status text NOT NULL CHECK(status IN ('eligible','withdrawn')),
 reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
 changed_at timestamptz NOT NULL
);
CREATE TABLE content_reviews (
 id uuid PRIMARY KEY,
 problem_id text NOT NULL CHECK(octet_length(problem_id) BETWEEN 1 AND 256),
 version text NOT NULL CHECK(octet_length(version) BETWEEN 1 AND 256),
 content_checksum text NOT NULL CHECK(content_checksum ~ '^[a-f0-9]{64}$'),
 author_id uuid NOT NULL REFERENCES users(id),
 reviewer_id uuid NOT NULL REFERENCES users(id),
 decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 checklist jsonb NOT NULL CHECK(jsonb_typeof(checklist)='object' AND octet_length(checklist::text)<=16384),
 recorded_at timestamptz NOT NULL,
 permission_revision text NOT NULL CHECK(octet_length(permission_revision) BETWEEN 1 AND 256),
 permission_digest text NOT NULL CHECK(permission_digest ~ '^[a-f0-9]{64}$'),
 CHECK(author_id<>reviewer_id)
);
CREATE INDEX content_reviews_author_idx ON content_reviews(author_id);
CREATE INDEX content_reviews_reviewer_idx ON content_reviews(reviewer_id);
CREATE INDEX content_reviews_pack_idx ON content_reviews(problem_id,version,content_checksum);
CREATE TABLE content_publications (
 release_id uuid PRIMARY KEY,
 sealed boolean NOT NULL DEFAULT true CHECK(sealed),
 review_id uuid NOT NULL REFERENCES content_reviews(id),
 publisher_id uuid NOT NULL REFERENCES users(id),
 published_at timestamptz NOT NULL,
 permission_revision text NOT NULL CHECK(octet_length(permission_revision) BETWEEN 1 AND 256),
 permission_digest text NOT NULL CHECK(permission_digest ~ '^[a-f0-9]{64}$'),
 event jsonb NOT NULL CHECK(jsonb_typeof(event)='object' AND octet_length(event::text)<=16384),
 FOREIGN KEY(release_id,sealed) REFERENCES catalogue_releases(id,sealed)
);
CREATE INDEX content_publications_review_idx ON content_publications(review_id);
CREATE INDEX content_publications_publisher_idx ON content_publications(publisher_id);
CREATE TABLE content_publication_audit (
 id uuid PRIMARY KEY,
 action text NOT NULL CHECK(action IN ('published','withdrawn')),
 actor_id uuid NOT NULL REFERENCES users(id),
 release_id uuid NOT NULL REFERENCES catalogue_releases(id),
 reason_code text CHECK(reason_code IS NULL OR reason_code ~ '^[a-z][a-z0-9_]{0,63}$'),
 permission_revision text NOT NULL CHECK(octet_length(permission_revision) BETWEEN 1 AND 256),
 permission_digest text NOT NULL CHECK(permission_digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL
);
CREATE INDEX content_publication_audit_actor_idx ON content_publication_audit(actor_id);
CREATE INDEX content_publication_audit_release_idx ON content_publication_audit(release_id);
CREATE FUNCTION catalogue_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable_catalogue_record'; END; $$;
CREATE FUNCTION catalogue_problem_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.slug IS DISTINCT FROM OLD.slug OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'immutable_problem_identity'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER catalogue_problem_guard BEFORE UPDATE ON catalogue_problems FOR EACH ROW EXECUTE FUNCTION catalogue_problem_guard();
CREATE FUNCTION catalogue_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual jsonb; n integer;
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.sealed THEN RAISE EXCEPTION 'initially_sealed_release'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'immutable_release'; END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'immutable_release'; END IF;
 SELECT jsonb_agg(case_id ORDER BY ordinal),count(*) INTO actual,n FROM catalogue_test_cases WHERE release_id=NEW.id;
 IF n<1 OR actual IS DISTINCT FROM NEW.suite_manifest->'caseIds' OR EXISTS(SELECT 1 FROM (SELECT ordinal,row_number() OVER(ORDER BY ordinal) AS expected FROM catalogue_test_cases WHERE release_id=NEW.id) x WHERE ordinal<>expected) THEN RAISE EXCEPTION 'incomplete_release'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER catalogue_release_guard BEFORE INSERT OR UPDATE OR DELETE ON catalogue_releases FOR EACH ROW EXECUTE FUNCTION catalogue_release_guard();
CREATE FUNCTION catalogue_case_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_sealed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'immutable_case'; END IF;
 SELECT sealed INTO parent_sealed FROM catalogue_releases WHERE id=NEW.release_id FOR UPDATE;
 IF parent_sealed IS DISTINCT FROM false THEN RAISE EXCEPTION 'sealed_or_absent_release'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER catalogue_case_guard BEFORE INSERT OR UPDATE OR DELETE ON catalogue_test_cases FOR EACH ROW EXECUTE FUNCTION catalogue_case_guard();
CREATE FUNCTION catalogue_require_sealed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM catalogue_releases WHERE id=NEW.id AND NOT sealed) THEN RAISE EXCEPTION 'unsealed_release'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER catalogue_require_sealed AFTER INSERT OR UPDATE ON catalogue_releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalogue_require_sealed();
CREATE TRIGGER content_reviews_immutable BEFORE UPDATE OR DELETE ON content_reviews FOR EACH ROW EXECUTE FUNCTION catalogue_immutable();
CREATE TRIGGER content_publications_immutable BEFORE UPDATE OR DELETE ON content_publications FOR EACH ROW EXECUTE FUNCTION catalogue_immutable();
CREATE TRIGGER content_audit_immutable BEFORE UPDATE OR DELETE ON content_publication_audit FOR EACH ROW EXECUTE FUNCTION catalogue_immutable();
-- Down Migration
DROP TABLE content_publication_audit,content_publications,content_reviews,catalogue_release_availability,catalogue_test_cases;
ALTER TABLE catalogue_problems DROP CONSTRAINT catalogue_current_release_fk;
DROP TABLE catalogue_releases,catalogue_problems;
DROP FUNCTION catalogue_problem_guard(),catalogue_require_sealed(),catalogue_case_guard(),catalogue_release_guard(),catalogue_immutable();

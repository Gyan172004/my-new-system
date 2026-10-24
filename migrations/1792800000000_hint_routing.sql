-- Up Migration
CREATE TABLE content_hint_routing_reviews (
 id uuid PRIMARY KEY,
 release_id uuid NOT NULL REFERENCES catalogue_releases(id),
 routing_hash text NOT NULL CHECK(routing_hash ~ '^[a-f0-9]{64}$'),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=524288),
 author_id uuid NOT NULL REFERENCES users(id),
 reviewer_id uuid NOT NULL REFERENCES users(id),
 evidence_ref text NOT NULL CHECK(octet_length(evidence_ref) BETWEEN 1 AND 32768),
 permission_revision text NOT NULL CHECK(octet_length(permission_revision) BETWEEN 1 AND 256),
 permission_digest text NOT NULL CHECK(permission_digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CHECK(author_id<>reviewer_id),
 UNIQUE(id,release_id,routing_hash)
);
CREATE INDEX hint_routing_reviews_release_idx ON content_hint_routing_reviews(release_id);
CREATE INDEX hint_routing_reviews_author_idx ON content_hint_routing_reviews(author_id);
CREATE INDEX hint_routing_reviews_reviewer_idx ON content_hint_routing_reviews(reviewer_id);
CREATE TABLE catalogue_hint_routing_revisions (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 release_id uuid NOT NULL REFERENCES catalogue_releases(id),
 revision text NOT NULL CHECK(octet_length(revision) BETWEEN 1 AND 256),
 manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=524288),
 review_id uuid NOT NULL,
 publisher_id uuid NOT NULL REFERENCES users(id),
 permission_revision text NOT NULL CHECK(octet_length(permission_revision) BETWEEN 1 AND 256),
 permission_digest text NOT NULL CHECK(permission_digest ~ '^[a-f0-9]{64}$'),
 installed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(review_id,release_id,hash) REFERENCES content_hint_routing_reviews(id,release_id,routing_hash),
 UNIQUE(release_id,revision), UNIQUE(release_id,hash)
);
CREATE INDEX hint_routing_revisions_review_idx ON catalogue_hint_routing_revisions(review_id);
CREATE INDEX hint_routing_revisions_publisher_idx ON catalogue_hint_routing_revisions(publisher_id);
CREATE TABLE catalogue_hint_routing_current (
 release_id uuid PRIMARY KEY REFERENCES catalogue_releases(id),
 hash text NOT NULL,
 FOREIGN KEY(release_id,hash) REFERENCES catalogue_hint_routing_revisions(release_id,hash)
);
CREATE INDEX hint_routing_current_hash_idx ON catalogue_hint_routing_current(hash);
CREATE TRIGGER hint_routing_review_immutable BEFORE UPDATE OR DELETE ON content_hint_routing_reviews FOR EACH ROW EXECUTE FUNCTION catalogue_immutable();
CREATE TRIGGER hint_routing_revision_immutable BEFORE UPDATE OR DELETE ON catalogue_hint_routing_revisions FOR EACH ROW EXECUTE FUNCTION catalogue_immutable();
-- Down Migration
DROP TABLE catalogue_hint_routing_current,catalogue_hint_routing_revisions,content_hint_routing_reviews;

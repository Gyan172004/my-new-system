-- Up Migration
-- Operational no-domain baseline. node-pg-migrate owns public.pgmigrations.
SELECT 1;

-- Down Migration
-- No domain objects exist; production rollback is never automatic.
SELECT 1;

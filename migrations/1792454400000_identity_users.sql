-- Up Migration
CREATE TABLE users (
  id uuid PRIMARY KEY,
  identity_provider text NOT NULL CHECK (identity_provider IN ('clerk','test')),
  identity_issuer text NOT NULL CHECK (octet_length(identity_issuer) BETWEEN 1 AND 512),
  identity_subject text NOT NULL CHECK (octet_length(identity_subject) BETWEEN 1 AND 256 AND identity_subject ~ '^[A-Za-z0-9_:-]+$'),
  account_status text NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (identity_provider, identity_issuer, identity_subject)
);

-- Down Migration
-- Data-bearing rollbacks require an explicit operator recovery plan.
DROP TABLE users;

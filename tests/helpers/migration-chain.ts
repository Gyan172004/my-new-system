// Explicit accepted chain: keep independent of the production manifest builder.
export const acceptedMigrations = [
  '1781654400000_foundation',
  '1792454400000_identity_users',
  '1792454400001_owned_session_storage',
  '1792713600000_problem_catalogue',
] as const;

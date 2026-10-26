// Explicit accepted chain: keep independent of the production manifest builder.
export const acceptedMigrations = [
  '1781654400000_foundation',
  '1792454400000_identity_users',
  '1792454400001_owned_session_storage',
  '1792713600000_problem_catalogue',
  '1792800000000_hint_routing',
  '1792800000001_assessment_commands',
  '1792800000002_hint_exposures',
] as const;

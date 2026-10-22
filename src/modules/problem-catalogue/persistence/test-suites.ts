import type { ProblemPack } from '../../content-publishing/public';
import {
  repositoryClient,
  type TransactionDatabase,
  type TransactionScope,
} from '../../../server/transaction';
export function createTestSuiteRepository(db: TransactionDatabase) {
  return Object.freeze({
    async install(
      scope: TransactionScope,
      releaseId: string,
      cases: ProblemPack['evaluation']['cases'],
    ) {
      const c = repositoryClient(scope, db);
      // One parameterized statement preserves order without one network round trip per case.
      await c.query(
        `INSERT INTO catalogue_test_cases(release_id,case_id,ordinal,category,visibility,definition)
    SELECT $1,definition->>'id',ordinality::integer,definition->>'category',definition->>'visibility',definition
    FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS entries(definition,ordinality)`,
        [releaseId, JSON.stringify(cases)],
      );
    },
    async read(scope: TransactionScope, releaseId: string) {
      const result = await repositoryClient(scope, db).query<{
        definition: ProblemPack['evaluation']['cases'][number];
      }>(
        'SELECT definition FROM catalogue_test_cases WHERE release_id=$1 ORDER BY ordinal',
        [releaseId],
      );
      return result.rows.map((r) => r.definition);
    },
  });
}

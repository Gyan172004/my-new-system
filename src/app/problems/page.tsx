import { getRuntime } from '../../server/runtime';
import { runtimeDatabase } from '../../server/database';
import { createCatalogueReader } from '../../modules/problem-catalogue/public';
import { AccountControls } from '../../modules/identity-ui/public';

export default async function ProblemsPage() {
  const runtime = getRuntime();
  const enabled = runtime.config.identityAdapter === 'clerk';
  let problems: Awaited<
    ReturnType<ReturnType<typeof createCatalogueReader>['list']>
  > | null = null;
  try {
    problems = await createCatalogueReader(runtimeDatabase(runtime)).list({
      limit: '50',
    });
  } catch {
    /* Rendered as the unavailable state below; no detail is leaked. */
  }
  return (
    <>
      <header className="topbar">
        <a aria-label="DSA Interview home" href="/">
          ~/dsa-interview
        </a>
        <nav aria-label="Account">
          {enabled ? <AccountControls /> : <a href="/sign-in">Sign in</a>}
        </nav>
      </header>
      <main className="problems">
        <p className="path">~/dsa-interview / problems</p>
        <h1>Problems</h1>
        {!problems ? (
          <section className="unavailable">
            <p role="status">
              Problems are temporarily unavailable. Please try again later.
            </p>
          </section>
        ) : problems.items.length === 0 ? (
          <p className="empty">No problems are published yet.</p>
        ) : (
          <ul className="problem-list" role="list">
            {problems.items.map((problem) => (
              <li key={problem.problemId} className="problem-row">
                <a href={`/problems/${problem.problemId}`}>
                  <span className="problem-title">{problem.title}</span>
                  <span className={`badge badge-${problem.difficulty}`}>
                    {problem.difficulty}
                  </span>
                  <span className="problem-tags">
                    {problem.topicTags.join(' · ')}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

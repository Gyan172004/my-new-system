import { notFound } from 'next/navigation';
import { getRuntime } from '../../../server/runtime';
import { runtimeDatabase } from '../../../server/database';
import {
  createCatalogueReader,
  CatalogueFailure,
} from '../../../modules/problem-catalogue/public';
import { AccountControls } from '../../../modules/identity-ui/public';

function Topbar({ enabled }: { enabled: boolean }) {
  return (
    <header className="topbar">
      <a aria-label="DSA Interview home" href="/">
        ~/dsa-interview
      </a>
      <nav aria-label="Account">
        {enabled ? <AccountControls /> : <a href="/sign-in">Sign in</a>}
      </nav>
    </header>
  );
}

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ problemId: string }>;
}) {
  const { problemId } = await params;
  const runtime = getRuntime();
  const enabled = runtime.config.identityAdapter === 'clerk';
  let problem;
  try {
    problem = await createCatalogueReader(runtimeDatabase(runtime)).detail(
      problemId,
    );
  } catch (error) {
    if (
      error instanceof CatalogueFailure &&
      (error.code === 'not_found' || error.code === 'bad_request')
    )
      notFound();
    return (
      <>
        <Topbar enabled={enabled} />
        <main className="problem-detail">
          <section className="unavailable">
            <p role="status">
              Problem is temporarily unavailable. Please try again later.
            </p>
          </section>
        </main>
      </>
    );
  }
  return (
    <>
      <Topbar enabled={enabled} />
      <main className="problem-detail">
        <p className="path">
          <a href="/problems">~/dsa-interview / problems</a> /{' '}
          {problem.problemId}
        </p>
        <h1>{problem.title}</h1>
        <p>
          <span className={`badge badge-${problem.difficulty}`}>
            {problem.difficulty}
          </span>
          {problem.topicTags.map((tag) => (
            <span key={tag} className="tag">
              {tag}
            </span>
          ))}
        </p>
        <section>
          <h2>Problem</h2>
          <p>{problem.statement}</p>
        </section>
        <section>
          <h2>Constraints</h2>
          <ul>
            {problem.constraints.map((constraint, index) => (
              <li key={index}>{constraint}</li>
            ))}
          </ul>
        </section>
        <section>
          <h2>Examples</h2>
          {problem.examples.map((example, index) => (
            <div key={index} className="example">
              <p>
                <strong>Input:</strong> {example.input}
              </p>
              <p>
                <strong>Output:</strong> {example.output}
              </p>
              {example.explanation ? (
                <p>
                  <strong>Explanation:</strong> {example.explanation}
                </p>
              ) : null}
            </div>
          ))}
        </section>
        <p className="pack-version">
          Pack version: {problem.problemPackVersion}
        </p>
        <button
          className="primary"
          type="button"
          disabled
          title="Starting an interview isn't available yet"
        >
          Start interview
        </button>
      </main>
    </>
  );
}

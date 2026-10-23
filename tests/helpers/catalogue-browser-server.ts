import {
  publicationFixture,
  auth,
  approvedChecklist,
} from './catalogue-publication';
import { createProcessProject, availablePort, eventually } from './process';
const fixture = await publicationFixture();
const project = await createProcessProject();
let disposing = false;
async function stop() {
  if (disposing) return;
  disposing = true;
  await project.dispose();
  await fixture.close();
}
process.once('SIGTERM', () => {
  void stop();
});
process.once('SIGINT', () => {
  void stop();
});
try {
  const review = await fixture.service.review(auth, fixture.raw(), {
    decision: 'approved',
    checklist: approvedChecklist,
  });
  await fixture.service.publish(auth, fixture.raw(), review.reviewId);
  const port = await availablePort();
  const child = project.run(['--import', 'tsx', 'src/server/bootstrap.ts'], {
    NODE_ENV: 'development',
    APP_ENV: 'test',
    IDENTITY_ADAPTER: 'test',
    DATABASE_URL: fixture.config.databaseUrl,
    PORT: String(port),
    LOG_LEVEL: 'silent',
    NEXT_TELEMETRY_DISABLED: '1',
  });
  await eventually(
    async () =>
      (await fetch(`http://127.0.0.1:${port}/api/v1/health/live`)).status,
    (s) => s === 200,
    90000,
  );
  console.info(
    JSON.stringify({
      port,
      projectRoot: project.root,
      problemId: fixture.pack.problemId,
    }),
  );
  await child.done;
} finally {
  await stop();
}

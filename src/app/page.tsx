import { getRuntime } from '../server/runtime';
import { Topbar } from './_components/topbar';
import { HeroCta } from './_components/hero-cta';
export default function Home() {
  const enabled = getRuntime().config.identityAdapter === 'clerk';
  return (
    <>
      <Topbar identityEnabled={enabled} />
      <main className="entry">
        <p className="path">~/practice</p>
        <h1>Practice the reasoning behind your code.</h1>
        <p>
          Explain your approach, trace your choices, and defend the complexity.
        </p>
        {enabled ? (
          <HeroCta />
        ) : (
          <a className="primary" href="/sign-in">
            Continue to sign in
          </a>
        )}
      </main>
    </>
  );
}

import { getRuntime } from '../server/runtime';
import { AccountControls } from '../modules/identity-ui/public';
export default function Home() {
  const enabled = getRuntime().config.identityAdapter === 'clerk';
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
      <main className="entry">
        <p className="path">~/practice</p>
        <h1>Practice the reasoning behind your code.</h1>
        <p>
          Explain your approach, trace your choices, and defend the complexity.
        </p>
        <a className="primary" href="/sign-in">
          Continue to sign in
        </a>
      </main>
    </>
  );
}

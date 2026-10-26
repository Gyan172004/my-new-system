import { AccountControls } from '../../modules/identity-ui/public';

export function Topbar({ identityEnabled }: { identityEnabled: boolean }) {
  return (
    <header className="topbar">
      <nav aria-label="Primary" className="topbar-nav">
        <a aria-label="DSA Interview home" href="/">
          ~/dsa-interview
        </a>
        <a href="/problems">problems</a>
      </nav>
      <nav aria-label="Account">
        {identityEnabled ? <AccountControls /> : <a href="/sign-in">Sign in</a>}
      </nav>
    </header>
  );
}

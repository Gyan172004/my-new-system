'use client';
import { useIsSignedIn } from '../../modules/identity-ui/public';

export function HeroCta() {
  const { isLoaded, isSignedIn } = useIsSignedIn();
  if (isLoaded && isSignedIn)
    return (
      <a className="primary" href="/problems">
        Browse problems
      </a>
    );
  return (
    <a className="primary" href="/sign-in">
      Continue to sign in
    </a>
  );
}

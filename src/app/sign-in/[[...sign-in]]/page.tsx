import { getRuntime } from '../../../server/runtime';
import { EmbeddedSignIn } from '../../../modules/identity-ui/public';
import { safeReturnPath } from '../../../modules/identity-profile/public';
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnPath(
    typeof params.returnTo === 'string' ? params.returnTo : undefined,
  );
  const enabled = getRuntime().config.identityAdapter === 'clerk';
  return (
    <>
      <header className="topbar">
        <a aria-label="DSA Interview home" href="/">
          ~/dsa-interview
        </a>
      </header>
      <main className="signin">
        <p className="path">~/dsa-interview</p>
        <h1>Sign in to continue</h1>
        <p>Sessions, transcripts and feedback are tied to your account.</p>
        {enabled ? (
          <EmbeddedSignIn returnTo={returnTo} />
        ) : (
          <section className="unavailable">
            <p role="status">
              Sign-in is temporarily unavailable. Please try again later.
            </p>
            <a href="/">Return home</a>
          </section>
        )}
        <p className="privacy-note">
          Google or an email verification code. Sign-in is managed by Clerk.
        </p>
      </main>
    </>
  );
}

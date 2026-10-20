'use client';
import { ClerkProvider, SignIn, UserButton, useAuth } from '@clerk/nextjs';
import type { ReactNode } from 'react';
import { AccountStateBoundary } from './account-boundary';

function AccountBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId } = useAuth();
  if (!isLoaded) return <p role="status">Loading your account…</p>;
  // Remount user-scoped state on sign-out, account switch, or session replacement.
  // Private pages must also abort their pending requests on unmount.
  return (
    <AccountStateBoundary
      accountKey={`${userId ?? 'signed-out'}:${sessionId ?? 'none'}`}
    >
      {children}
    </AccountStateBoundary>
  );
}
export function IdentityProvider({
  publishableKey,
  children,
}: {
  publishableKey: string;
  children: ReactNode;
}) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-in"
      signInForceRedirectUrl="/"
      signUpForceRedirectUrl="/"
      telemetry={false}
    >
      <AccountBoundary>{children}</AccountBoundary>
    </ClerkProvider>
  );
}
export function EmbeddedSignIn({ returnTo }: { returnTo: string }) {
  return (
    <SignIn
      path="/sign-in"
      routing="path"
      withSignUp
      oauthFlow="redirect"
      forceRedirectUrl={returnTo}
      signUpForceRedirectUrl={returnTo}
      appearance={{
        variables: {
          colorPrimary: '#7FA8D8',
          colorBackground: '#0E1420',
          colorForeground: '#E8DFD2',
          colorInput: '#1A2332',
          colorInputForeground: '#E8DFD2',
          colorMutedForeground: '#A4ADBD',
          borderRadius: '3px',
          fontFamily: 'var(--font-plex-sans), system-ui, sans-serif',
        },
        elements: {
          cardBox: { boxShadow: 'none' },
          card: { boxShadow: 'none', border: '1px solid #283344' },
          footer: { background: '#0E1420' },
        },
      }}
    />
  );
}
export function AccountControls() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <span role="status">Loading account…</span>;
  return isSignedIn ? <UserButton /> : <a href="/sign-in">Sign in</a>;
}

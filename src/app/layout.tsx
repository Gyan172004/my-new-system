import type { ReactNode } from 'react';
import { getRuntime } from '../server/runtime';
import { IdentityProvider } from '../modules/identity-ui/public';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'DSA Interview',
  description: 'Practice explaining and defending your approach.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  const clerk = getRuntime().config.clerk;
  return (
    <html lang="en">
      <body>
        {clerk ? (
          <IdentityProvider publishableKey={clerk.publishableKey}>
            {children}
          </IdentityProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}

import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import { getRuntime } from '../server/runtime';
import { IdentityProvider } from '../modules/identity-ui/public';
import './globals.css';
const sans = localFont({
  src: [
    {
      path: './fonts/IBMPlexSans-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/IBMPlexSans-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-plex-sans',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});
const mono = localFont({
  src: './fonts/IBMPlexMono-Regular.woff2',
  weight: '400',
  variable: '--font-plex-mono',
  display: 'swap',
  fallback: ['monospace'],
});
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'DSA Interview',
  description: 'Practice explaining and defending your approach.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  const clerk = getRuntime().config.clerk;
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
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

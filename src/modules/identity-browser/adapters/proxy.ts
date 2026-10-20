import { parseRuntimeConfig } from '../../../server/config';
import { clerkMiddleware } from '@clerk/nextjs/server';
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from 'next/server';
export async function identityBrowserProxy(
  request: NextRequest,
  event: NextFetchEvent,
) {
  if (process.env.IDENTITY_ADAPTER !== 'clerk') return NextResponse.next();
  try {
    const settings = parseRuntimeConfig(process.env).clerk;
    if (!settings) throw new Error('identity_unavailable');
    const middleware = clerkMiddleware({
      publishableKey: settings.publishableKey,
      // The startup-validated CLERK_SECRET_KEY stays in the server environment.
      // Passing it here opts into dynamic-key propagation and another secret.
      jwtKey: settings.jwtKey,
      authorizedParties: [...settings.authorizedParties],
      clockSkewInMs: 0,
      signInUrl: '/sign-in',
      signUpUrl: '/sign-in',
      debug: false,
      frontendApiProxy: { enabled: false },
    });
    const response = await middleware(request, event);
    if (response) response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return new NextResponse(
      'Sign-in is temporarily unavailable. Please try again.',
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      },
    );
  }
}

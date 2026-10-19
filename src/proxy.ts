import { identityBrowserProxy } from './modules/identity-browser/public';
export const proxy = identityBrowserProxy;
// Browser SDK plumbing only. Domain APIs verify bearer tokens after admission.
export const config = {
  matcher: ['/', '/sign-in/:path*', '/problems/:path*', '/sessions/:path*'],
};

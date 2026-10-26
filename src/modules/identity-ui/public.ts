// Browser-safe entry: never re-export identity server services here.
export {
  IdentityProvider,
  EmbeddedSignIn,
  AccountControls,
  useIsSignedIn,
} from './adapters/components';

export {
  AccountStateBoundary,
  useAccountSignal,
} from './adapters/account-boundary';

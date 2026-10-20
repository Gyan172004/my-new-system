// Browser-safe entry: never re-export identity server services here.
export {
  IdentityProvider,
  EmbeddedSignIn,
  AccountControls,
} from './adapters/components';

export {
  AccountStateBoundary,
  useAccountSignal,
} from './adapters/account-boundary';

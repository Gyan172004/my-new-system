'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
const AccountSignal = createContext<AbortSignal | undefined>(undefined);
function AccountScope({ children }: { children: ReactNode }) {
  const [controller, setController] = useState(() => new AbortController());
  useEffect(() => {
    // StrictMode replays mount effects. Renew the lease after its test cleanup.
    if (controller.signal.aborted) {
      setController(new AbortController());
      return;
    }
    return () => controller.abort();
  }, [controller]);
  return (
    <AccountSignal.Provider value={controller.signal}>
      {children}
    </AccountSignal.Provider>
  );
}
export function AccountStateBoundary({
  accountKey,
  children,
}: {
  accountKey: string;
  children: ReactNode;
}) {
  return <AccountScope key={accountKey}>{children}</AccountScope>;
}
export function useAccountSignal(): AbortSignal {
  const signal = useContext(AccountSignal);
  if (!signal) throw new Error('account_scope_required');
  return signal;
}

import type { PGlite, PGliteInterfaceExtensions } from "@electric-sql/pglite";
import { PGliteProvider } from "@electric-sql/pglite-react";
import { type live } from "@electric-sql/pglite/live";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

export type PGliteWithLive = PGlite &
  PGliteInterfaceExtensions<{
    live: typeof live;
  }>;

interface PGliteAsyncContextType {
  db: PGliteWithLive | null;
  isLoading: boolean;
  error: Error | null;
}

const PGliteAsyncContext = createContext<PGliteAsyncContextType>({
  db: null,
  isLoading: false,
  error: null,
});

export interface PGliteAsyncProviderProps extends PropsWithChildren {
  pgLiteFactory?: () => Promise<PGliteWithLive>;
}

export function PGliteAsyncProvider({
  pgLiteFactory,
  children,
}: PGliteAsyncProviderProps) {
  const [pgLiteDB, setPgLiteDB] = useState<PGliteWithLive | null>(null);
  const [isLoading, setIsLoading] = useState(!!pgLiteFactory);
  const [error, setError] = useState<Error | null>(null);
  const initializationStarted = useRef(false);

  useEffect(() => {
    if (!pgLiteFactory || initializationStarted.current) return;

    initializationStarted.current = true;

    pgLiteFactory()
      .then((db) => {
        setPgLiteDB(db);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setIsLoading(false);
      });
  }, [pgLiteFactory]);

  const contextValue: PGliteAsyncContextType = {
    db: pgLiteDB,
    isLoading,
    error,
  };

  return (
    <PGliteAsyncContext.Provider value={contextValue}>
      {pgLiteDB ? (
        <PGliteProvider db={pgLiteDB}>{children}</PGliteProvider>
      ) : (
        children
      )}
    </PGliteAsyncContext.Provider>
  );
}

export function usePGliteAsync() {
  const context = useContext(PGliteAsyncContext);
  if (!context) {
    throw new Error("usePGliteAsync must be used within a PGliteAsyncProvider");
  }
  return context;
}

import { type PGliteWithLive } from "@electric-sql/pglite/live";
import { useEffect, useState } from "react";

export const PGLITE_UPDATE_EVENT = "pglite-update";

export interface PGliteState {
  db: PGliteWithLive | null;
  isLoading: boolean;
  error: Error | null;
}

const defaultPGliteState: PGliteState = {
  db: null,
  isLoading: true,
  error: null,
};

export const usePGliteDB = () => {
  const [state, setState] = useState<PGliteState>(
    () => window.pglite ?? defaultPGliteState,
  );

  useEffect(() => {
    const handlePgliteUpdate = () =>
      setState(window.pglite ?? defaultPGliteState);

    window.addEventListener(PGLITE_UPDATE_EVENT, handlePgliteUpdate);

    return () =>
      window.removeEventListener(PGLITE_UPDATE_EVENT, handlePgliteUpdate);
  }, []);

  return state;
};

export const useSetPGliteDB = () => {
  const setPGliteState = (pglite: Partial<PGliteState>) => {
    const currentState = window.pglite ?? defaultPGliteState;
    window.pglite = {
      ...currentState,
      ...pglite,
    };
    window.dispatchEvent(new CustomEvent(PGLITE_UPDATE_EVENT));
  };

  return setPGliteState;
};

export const usePGlite = () => {
  const pglite = usePGliteDB();
  const setPGlite = useSetPGliteDB();

  return [pglite, setPGlite];
};

declare global {
  interface Window {
    pglite?: PGliteState;
  }
}

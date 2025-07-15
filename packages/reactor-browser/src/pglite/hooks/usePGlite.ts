import { type PGliteWithLive } from "@electric-sql/pglite/live";
import { useEffect, useState } from "react";

export const PGLITE_UPDATE_EVENT = "ph:pglite-update";

export interface PGliteState {
  db: PGliteWithLive | null;
  isLoading: boolean;
  error: Error | null;
  dbReady: boolean;
}

const defaultPGliteState: PGliteState = {
  db: null,
  isLoading: true,
  error: null,
  dbReady: false,
};

export const usePGliteDB = () => {
  const [state, setState] = useState<PGliteState>(
    () => window.powerhouse?.pglite ?? defaultPGliteState,
  );

  useEffect(() => {
    const handlePgliteUpdate = () =>
      setState(window.powerhouse?.pglite ?? defaultPGliteState);

    window.addEventListener(PGLITE_UPDATE_EVENT, handlePgliteUpdate);

    return () =>
      window.removeEventListener(PGLITE_UPDATE_EVENT, handlePgliteUpdate);
  }, []);

  return state;
};

export const useSetPGliteDB = () => {
  const setPGliteState = (pglite: Partial<PGliteState>) => {
    const currentPowerhouse = window.powerhouse ?? {};
    const currentPGliteState = window.powerhouse?.pglite ?? defaultPGliteState;

    window.powerhouse = {
      ...currentPowerhouse,
      pglite: {
        ...currentPGliteState,
        ...pglite,
      },
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

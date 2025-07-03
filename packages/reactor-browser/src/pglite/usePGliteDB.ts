import { useContext } from "react";
import { PGliteAsyncContext } from "./provider.js";

export function usePGliteDB() {
  const context = useContext(PGliteAsyncContext);

  return {
    db: context.db,
    isLoading: context.isLoading,
    error: context.error,
  };
}

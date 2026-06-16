import { useCallback, useEffect, useState } from "react";

/**
 * Prototype progress tracking for the Learn section.
 *
 * Stores completed lesson ids in localStorage — no backend. SSR-safe: starts
 * empty on the server and hydrates from localStorage after mount to avoid a
 * hydration mismatch.
 */
const STORAGE_KEY = "ph-academy-learn-progress";

export function useProgress() {
  const [completed, setCompleted] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Hydrate from localStorage on the client after first render.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setCompleted(parsed);
      }
    } catch {
      // ignore malformed/unavailable storage
    }
    setLoaded(true);
  }, []);

  // Persist after every change (once hydrated, so we never clobber on mount).
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(completed));
    } catch {
      // ignore storage write failures
    }
  }, [completed, loaded]);

  const isComplete = useCallback(
    (id: string) => completed.includes(id),
    [completed],
  );

  const markComplete = useCallback((id: string) => {
    setCompleted((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const toggle = useCallback((id: string) => {
    setCompleted((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const reset = useCallback(() => setCompleted([]), []);

  return { completed, loaded, isComplete, markComplete, toggle, reset };
}

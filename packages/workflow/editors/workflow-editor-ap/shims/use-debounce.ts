// Shim for the use-debounce package (only the hooks the builder uses).
import { useEffect, useMemo, useRef, useState } from "react";

export function useDebounce<T>(value: T, delay: number): [T] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return [debounced];
}

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return useMemo(
    () =>
      (...args: A) => {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(
          () => callbackRef.current(...args),
          delay,
        );
      },
    [delay],
  );
}

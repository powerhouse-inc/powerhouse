// Shim for react-use (only the hooks the builder uses).
import { useEffect, useRef, useState } from "react";

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

export function useLocation(): { pathname?: string } {
  const [pathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  return { pathname };
}

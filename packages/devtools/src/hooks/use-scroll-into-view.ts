import { useEffect, useRef } from "react";

/** Brings the element into view each time `when` turns true: the part of a
 * page a link names. */
export function useScrollIntoView<T extends HTMLElement>(when: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (when) ref.current?.scrollIntoView({ block: "nearest" });
  }, [when]);
  return ref;
}

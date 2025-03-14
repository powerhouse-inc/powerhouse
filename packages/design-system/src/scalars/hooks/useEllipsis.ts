import { useEffect, useState } from "react";

/**
 * Custom hook to detect if an element's text is truncated with ellipsis
 * @param ref - The ref of the element to detect ellipsis on
 * @returns Whether the element's text is truncated with ellipsis
 */
export const useEllipsis = <T extends HTMLElement>(
  ref: React.RefObject<T>,
): boolean => {
  const [hasEllipsis, setHasEllipsis] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(() => {
      setHasEllipsis(element.offsetWidth < element.scrollWidth);
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return hasEllipsis;
};

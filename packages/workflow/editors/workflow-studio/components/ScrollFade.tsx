// Scrolls its content sideways and fades whichever edge has more to show,
// so a wide workflow reads as cut off rather than as ending there.
import { useEffect, useRef, useState, type ReactNode } from "react";

const FADE = 40;

function fadeMask(start: boolean, end: boolean): string | undefined {
  if (!start && !end) return undefined;
  const from = start ? `transparent, black ${FADE}px` : "black";
  const to = end ? `black calc(100% - ${FADE}px), transparent` : "black";
  return `linear-gradient(to right, ${from}, ${to})`;
}

export function ScrollFade(props: {
  className?: string;
  // Clips instead of scrolling, for content inside something clickable.
  clip?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const start = element.scrollLeft > 1;
      const end =
        element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
      setEdges((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    if (element.firstElementChild) resize.observe(element.firstElementChild);
    element.addEventListener("scroll", measure, { passive: true });
    return () => {
      resize.disconnect();
      element.removeEventListener("scroll", measure);
    };
  }, []);

  const mask = fadeMask(edges.start, edges.end);
  return (
    <span
      ref={ref}
      className={`block ${props.clip ? "overflow-hidden" : "overflow-x-auto"} ${props.className ?? ""}`}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      {props.children}
    </span>
  );
}

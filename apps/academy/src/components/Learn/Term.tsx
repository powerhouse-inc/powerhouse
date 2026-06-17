import React, { useEffect, useId, useRef, useState } from "react";
import type { JSX, ReactNode } from "react";
import styles from "./mdx.module.css";
import { lookupDefinition } from "./glossary";

type TermProps = {
  children: ReactNode;
  /** Canonical term name, if it differs from the displayed text. */
  term?: string;
  /** Inline definition override. Falls back to the glossary lookup. */
  definition?: string;
};

/**
 * Marks a piece of jargon inline (dotted underline) and shows its definition in
 * a small popover. The popover opens on hover and on focus, and a click/tap
 * pins it open (useful on touch devices). Definitions come from the glossary
 * map keyed by the canonical term, or from an explicit `definition` prop.
 */
export default function Term({
  children,
  term,
  definition,
}: TermProps): JSX.Element {
  const label = term ?? (typeof children === "string" ? children : undefined);
  const text = definition ?? lookupDefinition(label);

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  // Close the pinned popover on outside click or Escape.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setPinned(false);
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  // No definition available: render plain marked text, no popover.
  if (!text) {
    return (
      <span className={styles.term} title={label}>
        {children}
      </span>
    );
  }

  return (
    <span className={styles.termWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.term}
        aria-expanded={open || pinned}
        aria-describedby={open || pinned ? popoverId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setPinned((p) => !p)}
      >
        {children}
      </button>
      {(open || pinned) && (
        <span role="tooltip" id={popoverId} className={styles.termPopover}>
          {label && (
            <strong className={styles.termPopoverTitle}>{label}</strong>
          )}
          {text}
        </span>
      )}
    </span>
  );
}

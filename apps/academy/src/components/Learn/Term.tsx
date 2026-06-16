import React from "react";
import type { JSX, ReactNode } from "react";
import styles from "./mdx.module.css";

type TermProps = {
  children: ReactNode;
  /** Canonical term name, if it differs from the displayed text. */
  term?: string;
};

/**
 * Marks a piece of jargon inline (dotted underline + tooltip). A lightweight
 * stand-in for the Fumadocs glossary tooltip — the native title shows the
 * canonical term so readers know it's defined vocabulary.
 */
export default function Term({ children, term }: TermProps): JSX.Element {
  const label = term ?? (typeof children === "string" ? children : undefined);
  return (
    <span className={styles.term} title={label}>
      {children}
    </span>
  );
}

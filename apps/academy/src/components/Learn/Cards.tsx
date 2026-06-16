import React from "react";
import type { JSX, ReactNode } from "react";
import Link from "@docusaurus/Link";
import styles from "./mdx.module.css";

export function Cards({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.cards}>{children}</div>;
}

type CardProps = {
  title: string;
  href?: string;
  description?: ReactNode;
  children?: ReactNode;
};

export function Card({ title, href, description, children }: CardProps): JSX.Element {
  const body = (
    <>
      <span className={styles.cardTitle}>{title}</span>
      {(description || children) && (
        <span className={styles.cardDesc}>{description ?? children}</span>
      )}
    </>
  );
  if (href) {
    return (
      <Link className={styles.card} to={href}>
        {body}
      </Link>
    );
  }
  return <div className={styles.card}>{body}</div>;
}

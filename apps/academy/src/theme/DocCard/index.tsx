import React from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import {
  useDocById,
  findFirstSidebarItemLink,
} from "@docusaurus/plugin-content-docs/client";
import isInternalUrl from "@docusaurus/isInternalUrl";
import Heading from "@theme/Heading";
import type { Props } from "@theme/DocCard";
import styles from "./styles.module.css";

/* Inline Lucide icons (lucide.dev), currentColor stroke. */
const FOLDER =
  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>';
const FILE =
  '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>';
const EXTERNAL =
  '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>';
const ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';

function Icon({
  paths,
  className,
  size = 20,
}: {
  paths: string;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

function CardLayout({
  href,
  iconPaths,
  title,
  description,
}: {
  href: string;
  iconPaths: string;
  title: string;
  description?: string;
}): JSX.Element {
  return (
    <Link href={href} className={styles.card}>
      <span className={styles.cardIcon}>
        <Icon paths={iconPaths} />
      </span>
      <Heading as="h2" className={styles.cardTitle} title={title}>
        {title}
      </Heading>
      {description && (
        <p className={styles.cardDesc} title={description}>
          {description}
        </p>
      )}
      <span className={styles.cardArrow}>
        <Icon paths={ARROW} size={18} />
      </span>
    </Link>
  );
}

function CardCategory({
  item,
}: {
  item: Props["item"] & { type: "category" };
}): JSX.Element | null {
  const href = findFirstSidebarItemLink(item);
  if (!href) return null;
  const count = item.items.length;
  return (
    <CardLayout
      href={href}
      iconPaths={FOLDER}
      title={item.label}
      description={
        item.description ?? `${count} ${count === 1 ? "page" : "pages"}`
      }
    />
  );
}

function CardLink({
  item,
}: {
  item: Props["item"] & { type: "link" };
}): JSX.Element {
  const internal = isInternalUrl(item.href);
  const doc = useDocById(item.docId ?? undefined);
  return (
    <CardLayout
      href={item.href}
      iconPaths={internal ? FILE : EXTERNAL}
      title={item.label}
      description={item.description ?? doc?.description}
    />
  );
}

export default function DocCard({ item }: Props): JSX.Element | null {
  switch (item.type) {
    case "link":
      return <CardLink item={item} />;
    case "category":
      return <CardCategory item={item} />;
    default:
      return null;
  }
}

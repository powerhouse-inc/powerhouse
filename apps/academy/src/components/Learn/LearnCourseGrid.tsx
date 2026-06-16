import React from "react";
import type { JSX } from "react";
import Link from "@docusaurus/Link";
import styles from "./mdx.module.css";

/* Canonical Lucide icon inner-SVG (lucide.dev), rendered with currentColor. */
const ICONS: Record<string, string> = {
  compass:
    '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
  network:
    '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  "file-code":
    '<path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m5 16-3 3 3 3"/><path d="m9 22 3-3-3-3"/>',
  "pencil-ruler":
    '<path d="M13 7 8.7 2.7a2.41 2.41 0 0 0-3.4 0L2.7 5.3a2.41 2.41 0 0 0 0 3.4L7 13"/><path d="m8 6 2-2"/><path d="m18 16 2-2"/><path d="m17 11 4.3 4.3c.94.94.94 2.46 0 3.4l-2.6 2.6c-.94.94-2.46.94-3.4 0L11 17"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  box:
    '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  server:
    '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  "git-branch":
    '<path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>',
  cpu:
    '<path d="M12 20v2"/><path d="M12 2v2"/><path d="M17 20v2"/><path d="M17 2v2"/><path d="M2 12h2"/><path d="M2 17h2"/><path d="M2 7h2"/><path d="M20 12h2"/><path d="M20 17h2"/><path d="M20 7h2"/><path d="M7 20v2"/><path d="M7 2v2"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};

function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

type Chapter = {
  icon: string;
  chapter: string;
  title: string;
  description: string;
  href: string;
  lessons: string;
};

const chapters: Chapter[] = [
  {
    icon: "compass",
    chapter: "Chapter 01",
    title: "Foundations",
    description:
      "The mental model — documents, actions, and operations, and why Powerhouse is built around them.",
    href: "/academy/Learn/foundations/what-is-powerhouse",
    lessons: "2 lessons",
  },
  {
    icon: "network",
    chapter: "Chapter 02",
    title: "Architecture",
    description:
      "How the Reactor, Connect, and Switchboard fit together — and where your code lives.",
    href: "/academy/Learn/architecture/the-big-picture",
    lessons: "2 lessons",
  },
  {
    icon: "file-code",
    chapter: "Chapter 03",
    title: "Document models",
    description:
      "The typed core: documents, drives, state scopes, actions, and reducers.",
    href: "/academy/Learn/document-models/documents-and-drives",
    lessons: "4 lessons",
  },
  {
    icon: "pencil-ruler",
    chapter: "Chapter 04",
    title: "Editors",
    description:
      "React UIs that dispatch actions and render state — hooks, structure, and patterns.",
    href: "/academy/Learn/editors/what-is-an-editor",
    lessons: "3 lessons",
  },
  {
    icon: "box",
    chapter: "Chapter 05",
    title: "Connect",
    description:
      "The host application — how it loads document models, drives, and editors at runtime.",
    href: "/academy/Learn/connect/what-is-connect",
    lessons: "2 lessons",
  },
  {
    icon: "server",
    chapter: "Chapter 06",
    title: "Switchboard",
    description:
      "The server side — subgraphs that expose APIs and processors that build read models.",
    href: "/academy/Learn/switchboard/what-is-switchboard",
    lessons: "3 lessons",
  },
  {
    icon: "git-branch",
    chapter: "Chapter 07",
    title: "Sync & collaboration",
    description:
      "Replay, merge, and why conflict-free just works once your state lives in a log.",
    href: "/academy/Learn/sync/sync-and-collaborate",
    lessons: "1 lesson",
  },
  {
    icon: "cpu",
    chapter: "Chapter 08",
    title: "Going further",
    description:
      "Reducer patterns under the hood, plus identity and signing on the operation log.",
    href: "/academy/Learn/deep-dives/reducers-in-depth",
    lessons: "2 lessons",
  },
];

export default function LearnCourseGrid(): JSX.Element {
  return (
    <div className={styles.courseGrid}>
      {chapters.map((c) => (
        <Link key={c.title} to={c.href} className={styles.courseCard}>
          <div className={styles.courseCardTop}>
            <span className={styles.courseIcon}>
              <Icon name={c.icon} />
            </span>
            <span className={styles.courseChapter}>{c.chapter}</span>
          </div>
          <div className={styles.courseTitle}>{c.title}</div>
          <p className={styles.courseDesc}>{c.description}</p>
          <div className={styles.courseCardBottom}>
            <span className={styles.courseLessons}>{c.lessons}</span>
            <Icon name="arrow-right" className={styles.courseArrow} />
          </div>
        </Link>
      ))}
    </div>
  );
}

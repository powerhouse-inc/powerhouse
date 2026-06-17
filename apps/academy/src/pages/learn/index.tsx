import React from "react";
import type { JSX } from "react";
import Layout from "@theme/Layout";
import Link from "@docusaurus/Link";
import Heading from "@theme/Heading";
import {
  modules,
  totalLessons,
  lessonHref,
  type Lesson,
} from "@site/src/components/Learn/courseData";
import { useProgress } from "@site/src/components/Learn/useProgress";
import styles from "@site/src/components/Learn/styles.module.css";

function firstUnfinished(
  lessons: Lesson[],
  isComplete: (id: string) => boolean,
) {
  return lessons.find((l) => !isComplete(l.id)) ?? lessons[0];
}

export default function LearnPage(): JSX.Element {
  const { isComplete, completed, reset, loaded } = useProgress();
  const doneCount = completed.length;
  const pct = totalLessons ? Math.round((doneCount / totalLessons) * 100) : 0;

  return (
    <Layout
      title="Learn"
      description="A guided learning track for building with Powerhouse."
    >
      <main className="container">
        <header className={styles.learnHeader}>
          <Heading as="h1">Learn Powerhouse</Heading>
          <p>
            A guided track through the Mastery curriculum — from setting up your
            builder environment to launching a published package.
          </p>
          {loaded && (
            <div className={styles.overallProgress}>
              <strong>
                {doneCount} / {totalLessons}
              </strong>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span>{pct}%</span>
              {doneCount > 0 && (
                <button
                  type="button"
                  className={styles.resetButton}
                  onClick={reset}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </header>

        <div className={styles.moduleGrid}>
          {modules.map((mod, i) => {
            const modDone = mod.lessons.filter((l) => isComplete(l.id)).length;
            const start = firstUnfinished(mod.lessons, isComplete);
            return (
              <section key={mod.key} className={styles.moduleCard}>
                <span className={styles.moduleNumber}>Module {i + 1}</span>
                <Heading as="h2">{mod.title}</Heading>
                <p className={styles.moduleDescription}>{mod.description}</p>

                <ul className={styles.lessonList}>
                  {mod.lessons.map((lesson) => {
                    const done = isComplete(lesson.id);
                    return (
                      <li key={lesson.id} className={styles.lessonItem}>
                        <span className={styles.lessonDot} data-done={done}>
                          {done ? "✓" : ""}
                        </span>
                        <Link to={lessonHref(lesson)}>{lesson.title}</Link>
                      </li>
                    );
                  })}
                </ul>

                <div className={styles.moduleFooter}>
                  <span className={styles.moduleCount}>
                    {modDone} / {mod.lessons.length} complete
                  </span>
                  <Link className={styles.startLink} to={lessonHref(start)}>
                    {modDone === 0
                      ? "Start →"
                      : modDone === mod.lessons.length
                        ? "Review →"
                        : "Continue →"}
                  </Link>
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </Layout>
  );
}

import React from "react";
import type { JSX } from "react";
import { useHistory } from "@docusaurus/router";
import Link from "@docusaurus/Link";
import { lessonHref, nextLesson } from "./courseData";
import { useProgress } from "./useProgress";
import styles from "./styles.module.css";

/**
 * Injected above the default doc footer on Learn-track lessons. Lets the reader
 * mark the lesson complete and jump to the next one in the course sequence.
 */
export default function LessonFooter({ docId }: { docId: string }): JSX.Element {
  const { isComplete, markComplete, toggle, loaded } = useProgress();
  const history = useHistory();
  const next = nextLesson(docId);
  const done = isComplete(docId);

  function handleCompleteAndContinue() {
    markComplete(docId);
    if (next) history.push(lessonHref(next));
  }

  return (
    <div className={styles.lessonFooter}>
      <button
        type="button"
        className={styles.checkToggle}
        onClick={() => toggle(docId)}
        aria-pressed={done}
        disabled={!loaded}
      >
        <span className={styles.checkbox} data-done={done}>
          {done ? "✓" : ""}
        </span>
        {done ? "Completed" : "Mark as complete"}
      </button>

      {next ? (
        <button
          type="button"
          className={styles.continueButton}
          onClick={handleCompleteAndContinue}
          disabled={!loaded}
        >
          {done ? "Next lesson" : "Complete & continue"}: {next.title} →
        </button>
      ) : (
        <Link className={styles.continueButton} to="/learn">
          Finish — back to course overview ↩
        </Link>
      )}
    </div>
  );
}

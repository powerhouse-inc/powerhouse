import React, { useState } from "react";
import type { JSX } from "react";
import styles from "./mdx.module.css";

type Choice = {
  label: string;
  correct?: boolean;
  explanation?: string;
};

type QuizProps = {
  question: string;
  choices: Choice[];
  /** Allow multiple correct answers (checkbox mode). */
  multi?: boolean;
  /** Overall explanation shown after answering. */
  explanation?: string;
};

/**
 * Interactive knowledge-check used throughout the Learn section. Single-answer
 * by default (reveals on click); set `multi` for multiple-correct (reveals on
 * "Check answer"). Ported from the Powerhouse Academy Fumadocs Quiz.
 */
export default function Quiz({
  question,
  choices,
  multi = false,
  explanation,
}: QuizProps): JSX.Element {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);

  function toggle(i: number) {
    if (submitted && !multi) return;
    setSelected((prev) => {
      const next = new Set(multi ? prev : []);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    if (!multi) setSubmitted(true);
  }

  function reset() {
    setSelected(new Set());
    setSubmitted(false);
  }

  return (
    <div className={styles.quiz}>
      <div className={styles.quizQuestion}>
        <span className={styles.quizBadge}>Quiz</span>
        {question}
      </div>

      <ul className={styles.quizChoices}>
        {choices.map((c, i) => {
          const isSelected = selected.has(i);
          const reveal = submitted;
          const state = reveal
            ? c.correct
              ? "correct"
              : isSelected
                ? "wrong"
                : "idle"
            : isSelected
              ? "selected"
              : "idle";
          return (
            <li key={i}>
              <button
                type="button"
                className={styles.quizChoice}
                data-state={state}
                aria-pressed={isSelected}
                onClick={() => toggle(i)}
              >
                <span className={styles.quizMark} data-state={state}>
                  {reveal ? (c.correct ? "✓" : isSelected ? "✕" : "") : isSelected ? "•" : ""}
                </span>
                <span className={styles.quizChoiceBody}>
                  <span>{c.label}</span>
                  {reveal && (isSelected || c.correct) && c.explanation && (
                    <span className={styles.quizExplain}>{c.explanation}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.quizActions}>
        {multi && !submitted && (
          <button
            type="button"
            className={styles.quizButton}
            disabled={selected.size === 0}
            onClick={() => setSubmitted(true)}
          >
            Check answer
          </button>
        )}
        {submitted && (
          <button type="button" className={styles.quizReset} onClick={reset}>
            Try again
          </button>
        )}
      </div>

      {submitted && explanation && (
        <div className={styles.quizSummary}>{explanation}</div>
      )}
    </div>
  );
}

export type ProgressTone = "active" | "done" | "error";

export type ProgressBarProps = {
  readonly label: string;
  /** Within 0..1. */
  readonly fraction: number;
  readonly tone: ProgressTone;
  /** Shown beside the bar; a percentage when omitted. */
  readonly value?: string;
  /** Read out instead of `value`, e.g. with the ordinals behind it. */
  readonly detail?: string;
  /** Leaves the label to the bar's accessible name, e.g. in a table row that names it. */
  readonly hideLabel?: boolean;
};

/** Rounds down, so a bar reads 100% only once it is done. */
export function percentOf(fraction: number): number {
  return Math.floor(Math.min(1, Math.max(0, fraction)) * 100);
}

/** One labelled bar, exposed as an ARIA progressbar. */
export function ProgressBar({
  label,
  fraction,
  tone,
  value,
  detail,
  hideLabel = false,
}: ProgressBarProps) {
  const percent = percentOf(fraction);
  const text = value ?? `${percent}%`;
  return (
    <div
      className={
        hideLabel ? "rm-progress-row rm-progress-row-bare" : "rm-progress-row"
      }
    >
      {hideLabel ? null : (
        <span className="rm-progress-label" title={label}>
          {label}
        </span>
      )}
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={detail ?? text}
        className={`rm-progress rm-progress-${tone}`}
        role="progressbar"
      >
        <div className="rm-progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="rm-progress-value" title={detail}>
        {text}
      </span>
    </div>
  );
}

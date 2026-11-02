import { useId } from "react";
import type { OptionStatus } from "../host-rules/index.js";

/** Options as the engine judged them; a disabled one says why under the row. */
export function OptionGroup({
  title,
  hint,
  options,
  onChoose,
  action = false,
  actions = [],
}: {
  readonly title: string;
  readonly hint?: string;
  readonly options: readonly OptionStatus[];
  readonly onChoose: (option: OptionStatus) => void;
  /** Buttons that do something once, not a choice between values. */
  readonly action?: boolean;
  /** One-off buttons after a choice, such as Remove. */
  readonly actions?: readonly OptionStatus[];
}) {
  const id = useId();
  if (options.length === 0 && actions.length === 0) return null;
  const disabled = [...options, ...actions].filter((option) => !option.enabled);
  return (
    <div aria-labelledby={id} className="hb-field" role="group">
      <div className="hb-flabel" id={id}>
        {title}
      </div>
      {hint ? <p className="hb-note">{hint}</p> : null}
      <div className="hb-opts">
        {options.map((option) => (
          <button
            aria-pressed={action ? undefined : option.selected}
            className="hb-opt"
            disabled={!option.enabled}
            key={option.id}
            onClick={() => onChoose(option)}
            type="button"
          >
            {option.label}
          </button>
        ))}
        {actions.map((option) => (
          <button
            className="hb-opt"
            disabled={!option.enabled}
            key={option.id}
            onClick={() => onChoose(option)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
      {disabled.map((option) => (
        <p className="hb-why" key={option.id}>
          <b>{option.label}:</b> {option.reason}
        </p>
      ))}
    </div>
  );
}

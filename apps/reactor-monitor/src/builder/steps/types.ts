import type { OptionStatus, Setter } from "../../host-rules/index.js";
import type { BuilderDraft, StepId } from "../draft.js";
import type { BuilderEngine } from "../engine.js";

export type StepProps = {
  readonly draft: BuilderDraft;
  readonly engine: BuilderEngine;
  readonly onChoose: (option: OptionStatus) => void;
  /** One edit of free-field setters; the caller checks nothing more. */
  readonly onEdit: (setters: Setter[]) => void;
  readonly onDraft: (draft: BuilderDraft) => void;
  readonly onStep: (step: StepId) => void;
};

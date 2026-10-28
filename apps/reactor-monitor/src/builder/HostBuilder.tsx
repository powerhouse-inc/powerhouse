import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../controller/client.js";
import type {
  HostRulesContext,
  OptionStatus,
  Setter,
} from "../host-rules/index.js";
import type { BuilderClient } from "./client.js";
import { issueCount, STEP_LABELS } from "./copy.js";
import {
  addEdit,
  browserStorage,
  changedCount,
  loadDraft,
  saveDraft,
  STEPS,
  undoEdit,
  withStep,
  type BuilderDraft,
  type DraftStorage,
  type StepId,
} from "./draft.js";
import { stepOf, useBuilderEngine } from "./engine.js";
import { BasicsStep } from "./steps/BasicsStep.js";
import { EnvironmentStep } from "./steps/EnvironmentStep.js";
import { MembersStep } from "./steps/MembersStep.js";
import { ReactorStep } from "./steps/ReactorStep.js";
import { ReviewStep } from "./steps/ReviewStep.js";
import { StartStep } from "./steps/StartStep.js";
import type { StepProps } from "./steps/types.js";
import { UseStep } from "./steps/UseStep.js";
import { SummaryPanel } from "./SummaryPanel.js";

const NO_CONTROLLER: HostRulesContext = { controller: false, postgres: false };

type Answer = {
  client: BuilderClient;
  context: HostRulesContext;
  error?: string;
};

/** What the controller can offer; undefined while it is being asked. */
function useCapabilities(client: BuilderClient | undefined): {
  context: HostRulesContext | undefined;
  error?: string;
} {
  const [answer, setAnswer] = useState<Answer | undefined>();
  useEffect(() => {
    if (!client) return;
    const abort = new AbortController();
    const aborted = () => abort.signal.aborted;
    void (async () => {
      try {
        const context = await client.capabilities();
        if (!aborted()) setAnswer({ client, context });
      } catch (error) {
        if (!aborted()) {
          setAnswer({
            client,
            context: NO_CONTROLLER,
            error: errorMessage(error),
          });
        }
      }
    })();
    return () => abort.abort();
  }, [client]);
  if (!client) return { context: NO_CONTROLLER };
  return answer?.client === client ? answer : { context: undefined };
}

export type HostBuilderProps = {
  readonly client?: BuilderClient;
  /** Where the draft is kept across reloads; defaults to localStorage. */
  readonly storage?: DraftStorage;
  readonly onStart?: (draft: BuilderDraft) => void;
  readonly onSaveSet?: (setName: string, draft: BuilderDraft) => void;
};

export function HostBuilder({
  client,
  storage: injected,
  onStart,
  onSaveSet,
}: HostBuilderProps) {
  const [storage] = useState(() => injected ?? browserStorage());
  const [draft, setDraftState] = useState(() => loadDraft(storage));
  const [saveProblem, setSaveProblem] = useState("");
  const [others, setOthers] = useState<number | undefined>();
  const [sheet, setSheet] = useState(false);
  const { context, error: capabilityError } = useCapabilities(client);
  const engine = useBuilderEngine(
    context ? draft : undefined,
    context ?? NO_CONTROLLER,
  );

  const setDraft = (next: BuilderDraft | undefined) => {
    setDraftState(next);
    const saved = saveDraft(storage, next);
    setSaveProblem(saved.ok || !next ? "" : saved.reason);
  };

  const step: StepId = draft?.step ?? "start";
  const nav = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    nav.current
      ?.querySelector('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [step]);
  const index = STEPS.indexOf(step);
  const goTo = (target: StepId) => {
    if (draft) setDraft(withStep(draft, target));
    setSheet(false);
    setOthers(undefined);
  };
  const bad = new Set(engine?.issues.map((issue) => stepOf(issue.path)));

  const choose = (option: OptionStatus) => {
    if (!draft || !engine || option.selected || !option.enabled) return;
    const changed = changedCount(engine.envelope, option.setters);
    setDraft(addEdit(draft, option.setters));
    setOthers(changed > 1 ? changed - 1 : undefined);
  };
  const edit = (setters: Setter[]) => {
    if (!draft) return;
    setDraft(addEdit(draft, setters));
    setOthers(undefined);
  };
  const undo = () => {
    if (draft) setDraft(undoEdit(draft));
    setOthers(undefined);
  };
  const loaded = (next: BuilderDraft | undefined) => {
    setDraft(next);
    setOthers(undefined);
  };

  const props: StepProps | undefined =
    draft && engine
      ? {
          draft,
          engine,
          onChoose: choose,
          onEdit: edit,
          onDraft: setDraft,
          onStep: goTo,
        }
      : undefined;
  const next = STEPS[index + 1] as StepId | undefined;
  const back = STEPS[index - 1] as StepId | undefined;

  return (
    <div className="hb" data-builder="">
      <nav aria-label="Steps" className="hb-steps hb-hscroll" ref={nav}>
        {STEPS.map((id, at) => (
          <button
            aria-current={id === step ? "step" : undefined}
            className="hb-stp"
            data-state={bad.has(id) ? "bad" : undefined}
            disabled={!draft && id !== "start"}
            key={id}
            onClick={() => goTo(id)}
            type="button"
          >
            <span className="hb-num">{at + 1}</span>
            {STEP_LABELS[id]}
          </button>
        ))}
      </nav>
      <div className="hb-body">
        <div className="hb-scroll" data-scroll="" ref={scroller}>
          {others ? (
            <div className="hb-banner" role="status">
              <span>
                Your edit changed {others} other{" "}
                {others === 1 ? "setting" : "settings"}.
              </span>
              <button className="hb-link" onClick={undo} type="button">
                Undo
              </button>
              <button
                className="hb-link"
                onClick={() => setOthers(undefined)}
                type="button"
              >
                Dismiss
              </button>
            </div>
          ) : null}
          {capabilityError ? (
            <p className="hb-error">
              Couldn't ask the controller what it offers: {capabilityError}
            </p>
          ) : null}
          {saveProblem ? <p className="hb-note">{saveProblem}</p> : null}
          {step !== "start" && draft && !props ? (
            <p className="hb-note">Asking the controller what it offers…</p>
          ) : step === "start" || !props ? (
            <StartStep
              client={client}
              draft={draft}
              onDiscard={() => loaded(undefined)}
              onDraft={loaded}
            />
          ) : step === "basics" ? (
            <BasicsStep {...props} />
          ) : step === "members" ? (
            <MembersStep {...props} />
          ) : step === "reactor" ? (
            <ReactorStep {...props} />
          ) : step === "environment" ? (
            <EnvironmentStep {...props} />
          ) : step === "review" ? (
            <ReviewStep {...props} client={client} />
          ) : (
            <UseStep
              {...props}
              client={client}
              onSaveSet={onSaveSet}
              onStart={onStart}
            />
          )}
        </div>
        <SummaryPanel
          draft={draft}
          engine={engine}
          onClose={() => setSheet(false)}
          onStep={goTo}
          onUndo={undo}
          open={sheet}
        />
      </div>
      <footer className="hb-foot">
        <button
          className="hb-btn"
          disabled={!back || !draft}
          onClick={() => back && goTo(back)}
          type="button"
        >
          ← Back
        </button>
        <span className="hb-grow" />
        {engine ? (
          <span
            className="hb-pill hb-hide-sm"
            data-state={engine.issues.length === 0 ? "ok" : "bad"}
          >
            {issueCount(engine.issues.length)}
          </span>
        ) : null}
        <button
          aria-expanded={sheet}
          className="hb-btn hb-sum-btn"
          onClick={() => setSheet((open) => !open)}
          type="button"
        >
          Summary
        </button>
        {next ? (
          <button
            className="hb-btn hb-btn-primary"
            disabled={!draft}
            onClick={() => goTo(next)}
            type="button"
          >
            Next: {STEP_LABELS[next]}
          </button>
        ) : null}
      </footer>
    </div>
  );
}

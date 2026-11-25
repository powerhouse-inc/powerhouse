import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions } from "document-models/problem-sheet";
import type {
  Constraint,
  JobMapStep,
  JobStatement,
  JobStep,
  Motivation,
  Outcome,
  OutcomeDirection,
  OutcomeScope,
  ProblemSheetAction,
  ProblemSheetState,
  Role,
  RoleKind,
  Severity,
} from "document-models/problem-sheet";
import { useState } from "react";
import {
  AddButton,
  Card,
  ClearButton,
  EditableText,
  EmptyHint,
  LinkButton,
  RemoveButton,
  Section,
  Select,
} from "../../shared/fields.js";

type Dispatch = DocumentDispatch<ProblemSheetAction>;

const MOTIVATIONS: Motivation[] = [
  "WANT_TO",
  "NEED_TO",
  "HAVE_TO",
  "LOVE_TO",
  "HATE_TO",
  "CANNOT",
];
const JOB_MAP_STEPS: JobMapStep[] = [
  "DEFINE",
  "LOCATE",
  "PREPARE",
  "CONFIRM",
  "EXECUTE",
  "MONITOR",
  "MODIFY",
  "CONCLUDE",
];
const DIRECTIONS: OutcomeDirection[] = [
  "INCREASE",
  "DECREASE",
  "AVOID",
  "SATISFY",
];
const OUTCOME_SCOPES: OutcomeScope[] = ["CORE", "SPECIALIZED", "OPERATIONAL"];
const ROLE_KINDS: RoleKind[] = ["PRIMARY", "SUPPORT"];
const SEVERITIES: Severity[] = ["HIGH", "MEDIUM", "LOW"];

/** Context — the situational framing of the problem. */
export function ContextSection({
  state,
  dispatch,
}: {
  state: ProblemSheetState;
  dispatch: Dispatch;
}) {
  return (
    <Section title="Context">
      <EditableText
        value={state.context}
        placeholder="Where and when does this problem arise?"
        multiline
        onCommit={(context) => dispatch(actions.setContext({ context }))}
        className="text-sm/relaxed text-foreground"
      />
    </Section>
  );
}

/** Core job — the ODI job statement (motivation + verb + object + clarifier). */
export function CoreJobSection({
  state,
  productName,
  dispatch,
}: {
  state: ProblemSheetState;
  productName: string;
  dispatch: Dispatch;
}) {
  const job = state.coreJob;
  return (
    <Section
      title="Core Job"
      action={
        job ? (
          <ClearButton onClick={() => dispatch(actions.clearCoreJob({}))}>
            Clear
          </ClearButton>
        ) : undefined
      }
    >
      <p className="mb-2 text-sm text-muted-foreground">
        {productName ? (
          <>
            The{" "}
            <span className="font-medium text-foreground">{productName}</span>{" "}
            product is for users who…
          </>
        ) : (
          "The product is for users who…"
        )}
      </p>
      {job ? (
        <DefinedJob job={job} dispatch={dispatch} />
      ) : (
        <DraftJob dispatch={dispatch} />
      )}
    </Section>
  );
}

function DefinedJob({
  job,
  dispatch,
}: {
  job: JobStatement;
  dispatch: Dispatch;
}) {
  return (
    <div className="relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-accent p-4">
      <div className="via-vetra-primary pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent opacity-60" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Select
          value={job.motivation}
          options={MOTIVATIONS}
          onChange={(motivation) =>
            dispatch(actions.updateCoreJob({ motivation }))
          }
        />
        <EditableText
          value={job.verb}
          placeholder="verb"
          required
          width="w-32"
          onCommit={(verb) => dispatch(actions.updateCoreJob({ verb }))}
          className="font-medium text-foreground"
        />
        <EditableText
          value={job.object}
          placeholder="object"
          required
          width="w-72"
          onCommit={(object) => dispatch(actions.updateCoreJob({ object }))}
          className="font-medium text-foreground"
        />
      </div>
      <EditableText
        value={job.clarifier}
        placeholder="Clarifier — for whom, or under what conditions (optional)"
        multiline
        onCommit={(clarifier) => dispatch(actions.updateCoreJob({ clarifier }))}
        className="text-sm text-muted-foreground"
      />
    </div>
  );
}

function DraftJob({ dispatch }: { dispatch: Dispatch }) {
  const [motivation, setMotivation] = useState<Motivation>("NEED_TO");
  const [verb, setVerb] = useState("");
  const [object, setObject] = useState("");
  const [clarifier, setClarifier] = useState("");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm">
      <Select
        value={motivation}
        options={MOTIVATIONS}
        onChange={setMotivation}
      />
      <input
        value={verb}
        placeholder="verb"
        onChange={(e) => setVerb(e.target.value)}
        className="w-32 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={object}
        placeholder="object"
        onChange={(e) => setObject(e.target.value)}
        className="w-48 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={clarifier}
        placeholder="clarifier (optional)"
        onChange={(e) => setClarifier(e.target.value)}
        className="flex-1 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <LinkButton
        disabled={!verb.trim() || !object.trim()}
        onClick={() =>
          dispatch(
            actions.setCoreJob({
              motivation,
              verb: verb.trim(),
              object: object.trim(),
              clarifier: clarifier.trim() || undefined,
            }),
          )
        }
      >
        Set core job
      </LinkButton>
    </div>
  );
}

/** Job steps — the universal job map decomposition. */
export function JobStepsSection({
  state,
  dispatch,
}: {
  state: ProblemSheetState;
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(
      actions.addJobStep({ id: generateId(), category: "EXECUTE", name: "" }),
    );
  return (
    <Section
      title="Job Steps"
      action={<AddButton onClick={add}>Add step</AddButton>}
    >
      {state.coreJobSteps.length === 0 ? (
        <EmptyHint>No job steps yet.</EmptyHint>
      ) : (
        <ol className="flex flex-col gap-2">
          {state.coreJobSteps.map((step) => (
            <JobStepRow key={step.id} step={step} dispatch={dispatch} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function JobStepRow({ step, dispatch }: { step: JobStep; dispatch: Dispatch }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Select
        value={step.category}
        options={JOB_MAP_STEPS}
        onChange={(category) =>
          dispatch(actions.updateJobStep({ id: step.id, category }))
        }
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <EditableText
          value={step.name}
          placeholder="Step name"
          required
          onCommit={(name) =>
            dispatch(actions.updateJobStep({ id: step.id, name }))
          }
          className="text-sm font-medium text-foreground"
        />
        <EditableText
          value={step.description}
          placeholder="Description (optional)"
          onCommit={(description) =>
            dispatch(actions.updateJobStep({ id: step.id, description }))
          }
          className="text-sm text-muted-foreground"
        />
      </div>
      <RemoveButton
        onClick={() => dispatch(actions.removeJobStep({ id: step.id }))}
      />
    </li>
  );
}

/** Roles — who executes or supports the job. */
export function RolesSection({
  state,
  dispatch,
}: {
  state: ProblemSheetState;
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(actions.addRole({ id: generateId(), kind: "PRIMARY", name: "" }));
  return (
    <Section
      title="Roles"
      action={<AddButton onClick={add}>Add role</AddButton>}
    >
      {state.roles.length === 0 ? (
        <EmptyHint>No roles yet.</EmptyHint>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {state.roles.map((role) => (
            <RoleCard key={role.id} role={role} dispatch={dispatch} />
          ))}
        </div>
      )}
    </Section>
  );
}

function RoleCard({ role, dispatch }: { role: Role; dispatch: Dispatch }) {
  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <Select
          value={role.kind}
          options={ROLE_KINDS}
          onChange={(kind) =>
            dispatch(actions.updateRole({ id: role.id, kind }))
          }
        />
        <RemoveButton
          onClick={() => dispatch(actions.removeRole({ id: role.id }))}
        />
      </div>
      <div className="flex flex-col gap-1">
        <EditableText
          value={role.name}
          placeholder="Role name"
          required
          onCommit={(name) =>
            dispatch(actions.updateRole({ id: role.id, name }))
          }
          className="text-sm font-medium text-foreground"
        />
        <EditableText
          value={role.description}
          placeholder="Description (optional)"
          multiline
          onCommit={(description) =>
            dispatch(actions.updateRole({ id: role.id, description }))
          }
          className="text-sm text-muted-foreground"
        />
        <EditableText
          value={role.context}
          placeholder="Context (optional)"
          onCommit={(context) =>
            dispatch(actions.updateRole({ id: role.id, context }))
          }
          className="text-sm text-muted-foreground"
        />
      </div>
    </Card>
  );
}

/** Outcomes — the measurable definitions of success. */
export function OutcomesSection({
  state,
  dispatch,
}: {
  state: ProblemSheetState;
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(
      actions.addOutcome({
        id: generateId(),
        direction: "INCREASE",
        object: "",
        scope: "CORE",
      }),
    );
  return (
    <Section
      title="Outcomes"
      action={<AddButton onClick={add}>Add outcome</AddButton>}
    >
      {state.outcomes.length === 0 ? (
        <EmptyHint>No outcomes yet.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-3">
          {state.outcomes.map((outcome) => (
            <OutcomeCard
              key={outcome.id}
              outcome={outcome}
              roles={state.roles}
              steps={state.coreJobSteps}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function OutcomeCard({
  outcome,
  roles,
  steps,
  dispatch,
}: {
  outcome: Outcome;
  roles: Role[];
  steps: JobStep[];
  dispatch: Dispatch;
}) {
  const showMetric =
    outcome.direction === "INCREASE" || outcome.direction === "DECREASE";
  return (
    <Card className="relative">
      <div className="absolute top-3 right-3">
        <RemoveButton
          label="Remove outcome"
          onClick={() => dispatch(actions.removeOutcome({ id: outcome.id }))}
        />
      </div>
      <div className="flex flex-col gap-3 pr-5">
        {/* direction + the measured statement */}
        <div className="flex items-start gap-3">
          <Select
            value={outcome.direction}
            options={DIRECTIONS}
            className="w-32 flex-none"
            onChange={(direction) =>
              dispatch(actions.updateOutcome({ id: outcome.id, direction }))
            }
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {showMetric ? (
              <EditableText
                value={outcome.metric}
                placeholder="the metric, e.g. the time it takes"
                onCommit={(metric) =>
                  dispatch(actions.updateOutcome({ id: outcome.id, metric }))
                }
                className="text-sm text-foreground"
              />
            ) : null}
            <EditableText
              value={outcome.object}
              placeholder="what is measured"
              required
              onCommit={(object) =>
                dispatch(actions.updateOutcome({ id: outcome.id, object }))
              }
              className="text-sm font-medium text-foreground"
            />
            <EditableText
              value={outcome.clarifier}
              placeholder="clarifier — for whom, or under what conditions"
              onCommit={(clarifier) =>
                dispatch(actions.updateOutcome({ id: outcome.id, clarifier }))
              }
              className="text-sm text-muted-foreground"
            />
          </div>
        </div>

        {/* scope + role + job step */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={outcome.scope}
            options={OUTCOME_SCOPES}
            className="w-32 flex-none"
            onChange={(scope) =>
              dispatch(actions.updateOutcome({ id: outcome.id, scope }))
            }
          />
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            Role
            <OptionalRefSelect
              value={outcome.role}
              options={roles.map((r) => ({ id: r.id, label: r.name }))}
              onChange={(role) => {
                if (role)
                  dispatch(actions.updateOutcome({ id: outcome.id, role }));
                else dispatch(actions.clearOutcomeRole({ id: outcome.id }));
              }}
            />
          </label>
          <label className="flex items-center gap-1 text-sm text-muted-foreground">
            Step
            <OptionalRefSelect
              value={outcome.relatedStep}
              options={steps.map((s) => ({ id: s.id, label: s.name }))}
              onChange={(relatedStep) => {
                if (relatedStep)
                  dispatch(
                    actions.updateOutcome({ id: outcome.id, relatedStep }),
                  );
                else dispatch(actions.clearOutcomeStep({ id: outcome.id }));
              }}
            />
          </label>
        </div>
      </div>
      <div className="mt-3">
        <EditableText
          value={outcome.notes}
          placeholder="Notes (optional)"
          multiline
          onCommit={(notes) =>
            dispatch(actions.updateOutcome({ id: outcome.id, notes }))
          }
          className="text-sm text-muted-foreground"
        />
      </div>
    </Card>
  );
}

/** Native select for an optional in-document OID reference, with a "none" row. */
function OptionalRefSelect({
  value,
  options,
  onChange,
}: {
  value: string | null | undefined;
  options: { id: string; label: string }[];
  onChange: (next: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full rounded-sm border border-border bg-card px-1.5 py-0.5 text-sm outline-none focus:border-muted-foreground"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label || "(unnamed)"}
        </option>
      ))}
    </select>
  );
}

/** Constraints — limits on how the job can be executed. */
export function ConstraintsSection({
  state,
  dispatch,
}: {
  state: ProblemSheetState;
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(
      actions.addConstraint({
        id: generateId(),
        description: "",
        severity: "MEDIUM",
      }),
    );
  return (
    <Section
      title="Constraints"
      action={<AddButton onClick={add}>Add constraint</AddButton>}
    >
      {state.constraints.length === 0 ? (
        <EmptyHint>No constraints yet.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-2">
          {state.constraints.map((constraint) => (
            <ConstraintRow
              key={constraint.id}
              constraint={constraint}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function ConstraintRow({
  constraint,
  dispatch,
}: {
  constraint: Constraint;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
      <Select
        value={constraint.severity}
        options={SEVERITIES}
        onChange={(severity) =>
          dispatch(actions.updateConstraint({ id: constraint.id, severity }))
        }
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <EditableText
          value={constraint.description}
          placeholder="Constraint"
          required
          multiline
          onCommit={(description) =>
            dispatch(
              actions.updateConstraint({ id: constraint.id, description }),
            )
          }
          className="text-sm text-foreground"
        />
        <EditableText
          value={constraint.notes}
          placeholder="Notes (optional)"
          multiline
          onCommit={(notes) =>
            dispatch(actions.updateConstraint({ id: constraint.id, notes }))
          }
          className="text-sm text-muted-foreground"
        />
      </div>
      <RemoveButton
        onClick={() =>
          dispatch(actions.removeConstraint({ id: constraint.id }))
        }
      />
    </div>
  );
}

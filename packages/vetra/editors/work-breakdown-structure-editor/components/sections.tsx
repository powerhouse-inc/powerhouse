import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions } from "document-models/work-breakdown-structure";
import type {
  Task,
  TaskKind,
  TaskStatus,
  WbsStatus,
  WorkBreakdownStructureAction,
  WorkBreakdownStructureState,
  WorkPackage,
} from "document-models/work-breakdown-structure";
import { useState } from "react";
import {
  ClearButton,
  EditableText,
  EmptyHint,
  EnumChips,
  Field,
  LinkButton,
  Pill,
  RemoveButton,
  Section,
} from "../../shared/fields.js";

type Dispatch = DocumentDispatch<WorkBreakdownStructureAction>;

const TASK_KINDS: TaskKind[] = [
  "IMPLEMENTATION",
  "TESTING",
  "REVIEW",
  "INTEGRATION",
  "DOCUMENTATION",
  "SPEC_CHANGE",
  "MAINTENANCE",
];

const STATUS_TONE: Record<TaskStatus, "neutral" | "info" | "prefer" | "avoid"> =
  {
    TODO: "neutral",
    IN_PROGRESS: "info",
    REVIEW: "info",
    DONE: "prefer",
    BLOCKED: "avoid",
    DROPPED: "neutral",
  };

const UNSCOPED = "__unscoped__";

/** Header: name, description, status with transitions, and feature link. */
export function WbsHeader({
  state,
  dispatch,
}: {
  state: WorkBreakdownStructureState;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent p-5">
      <Pill tone={state.status === "COMPLETE" ? "prefer" : "info"}>
        {state.status}
      </Pill>
      <EditableText
        value={state.name}
        placeholder="Work breakdown structure name"
        variant="plain"
        onCommit={(name) => dispatch(actions.setWbsName({ name }))}
        className="text-2xl font-semibold text-foreground"
      />
      <EditableText
        value={state.description}
        placeholder="What does this plan deliver?"
        multiline
        variant="plain"
        onCommit={(description) =>
          dispatch(actions.setWbsDescription({ description }))
        }
        className="text-sm text-muted-foreground"
      />
      <WbsStatusControls status={state.status} dispatch={dispatch} />
      <FeatureLink state={state} dispatch={dispatch} />
    </div>
  );
}

function WbsStatusControls({
  status,
  dispatch,
}: {
  status: WbsStatus;
  dispatch: Dispatch;
}) {
  const btn = (label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="rounded-sm border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );
  const transitions: React.ReactNode[] = [];
  if (status === "DRAFT")
    transitions.push(btn("Activate", () => dispatch(actions.activateWbs({}))));
  if (status === "ACTIVE")
    transitions.push(btn("Complete", () => dispatch(actions.completeWbs({}))));
  if (status === "COMPLETE" || status === "ARCHIVED")
    transitions.push(btn("Reopen", () => dispatch(actions.reopenWbs({}))));
  if (status !== "ARCHIVED")
    transitions.push(btn("Archive", () => dispatch(actions.archiveWbs({}))));
  return <div className="flex flex-wrap gap-1.5">{transitions}</div>;
}

function FeatureLink({
  state,
  dispatch,
}: {
  state: WorkBreakdownStructureState;
  dispatch: Dispatch;
}) {
  const [docId, setDocId] = useState("");
  if (state.feature) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Feature
        </span>
        <span className="text-foreground">
          {state.feature.name || state.feature.documentId}
        </span>
        <ClearButton onClick={() => dispatch(actions.clearFeature({}))}>
          Unlink
        </ClearButton>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="font-medium tracking-wide text-muted-foreground uppercase">
        Feature
      </span>
      <input
        value={docId}
        placeholder="feature document id"
        onChange={(e) => setDocId(e.target.value)}
        className="w-48 rounded-sm border border-border px-1.5 py-0.5 font-mono outline-none focus:border-muted-foreground"
      />
      <LinkButton
        disabled={!docId.trim()}
        onClick={() => {
          dispatch(actions.setFeature({ documentId: docId.trim() }));
          setDocId("");
        }}
      >
        Link
      </LinkButton>
    </div>
  );
}

/** Packages and the tasks grouped under them (plus unscoped tasks). */
export function WorkSection({
  state,
  dispatch,
}: {
  state: WorkBreakdownStructureState;
  dispatch: Dispatch;
}) {
  const addPackage = () =>
    dispatch(actions.addPackage({ id: generateId(), name: "New package" }));

  const packageOptions = [
    ...state.packages.map((p) => ({ id: p.id, label: p.name })),
    { id: UNSCOPED, label: "Unscoped" },
  ];

  const unscoped = state.tasks.filter((t) => !t.packageId);

  return (
    <Section
      title="Work Breakdown"
      action={<LinkButton onClick={addPackage}>Add package</LinkButton>}
    >
      <div className="flex flex-col gap-5">
        {state.packages.map((pkg) => (
          <PackageGroup
            key={pkg.id}
            pkg={pkg}
            tasks={state.tasks.filter((t) => t.packageId === pkg.id)}
            packageOptions={packageOptions}
            dispatch={dispatch}
          />
        ))}

        <TaskGroup
          title="Unscoped"
          tasks={unscoped}
          addTo={null}
          packageOptions={packageOptions}
          dispatch={dispatch}
        />
      </div>
    </Section>
  );
}

function PackageGroup({
  pkg,
  tasks,
  packageOptions,
  dispatch,
}: {
  pkg: WorkPackage;
  tasks: Task[];
  packageOptions: { id: string; label: string }[];
  dispatch: Dispatch;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-start justify-between gap-3 border-b border-border/40 bg-accent p-3">
        <div className="min-w-0 flex-1">
          <EditableText
            value={pkg.name}
            placeholder="Package name"
            required
            onCommit={(name) =>
              dispatch(actions.updatePackage({ id: pkg.id, name }))
            }
            className="font-semibold text-foreground"
          />
          <EditableText
            value={pkg.description}
            placeholder="Description (optional)"
            onCommit={(description) =>
              dispatch(actions.updatePackage({ id: pkg.id, description }))
            }
            className="text-sm text-muted-foreground"
          />
        </div>
        <RemoveButton
          label="Remove package"
          onClick={() => dispatch(actions.removePackage({ id: pkg.id }))}
        />
      </div>
      <div className="p-3">
        <TaskGroup
          title={null}
          tasks={tasks}
          addTo={pkg.id}
          packageOptions={packageOptions}
          dispatch={dispatch}
        />
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  tasks,
  addTo,
  packageOptions,
  dispatch,
}: {
  title: string | null;
  tasks: Task[];
  addTo: string | null;
  packageOptions: { id: string; label: string }[];
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(
      actions.addTask({
        id: generateId(),
        name: "New task",
        taskKind: ["IMPLEMENTATION"],
        packageId: addTo ?? undefined,
      }),
    );
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        {title ? (
          <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h5>
        ) : (
          <span />
        )}
        <LinkButton onClick={add}>Add task</LinkButton>
      </div>
      {tasks.length === 0 ? (
        <EmptyHint>No tasks.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              packageOptions={packageOptions}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  packageOptions,
  dispatch,
}: {
  task: Task;
  packageOptions: { id: string; label: string }[];
  dispatch: Dispatch;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <Pill tone={STATUS_TONE[task.status]}>
          {task.status.replace("_", " ")}
        </Pill>
        <EditableText
          value={task.name}
          placeholder="Task name"
          required
          onCommit={(name) =>
            dispatch(actions.updateTask({ id: task.id, name }))
          }
          className="min-w-40 flex-1 font-medium text-foreground"
        />
        <select
          value={task.packageId ?? UNSCOPED}
          onChange={(e) =>
            dispatch(
              actions.moveTask({
                id: task.id,
                packageId:
                  e.target.value === UNSCOPED ? undefined : e.target.value,
              }),
            )
          }
          className="rounded-sm border border-border bg-card px-1.5 py-0.5 text-xs outline-none focus:border-muted-foreground"
        >
          {packageOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <RemoveButton
          onClick={() => dispatch(actions.removeTask({ id: task.id }))}
        />
      </div>

      <div className="mb-2">
        <EnumChips
          options={TASK_KINDS}
          selected={task.taskKind}
          onChange={(taskKind) =>
            dispatch(actions.updateTask({ id: task.id, taskKind }))
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        <Field label="Owner">
          <EditableText
            value={task.owner}
            placeholder="Owner (optional)"
            onCommit={(owner) =>
              dispatch(actions.updateTask({ id: task.id, owner }))
            }
            className="text-sm text-foreground"
          />
        </Field>
        <Field label="Acceptance criteria">
          <EditableText
            value={task.acceptanceCriteria}
            placeholder="Done when…"
            onCommit={(acceptanceCriteria) =>
              dispatch(actions.updateTask({ id: task.id, acceptanceCriteria }))
            }
            className="text-sm text-foreground"
          />
        </Field>
      </div>
      <div className="mt-1">
        <Field label="Description">
          <EditableText
            value={task.description}
            placeholder="Description (optional)"
            multiline
            onCommit={(description) =>
              dispatch(actions.updateTask({ id: task.id, description }))
            }
            className="text-sm text-muted-foreground"
          />
        </Field>
      </div>

      <TaskStatusControls task={task} dispatch={dispatch} />
    </div>
  );
}

function TaskStatusControls({
  task,
  dispatch,
}: {
  task: Task;
  dispatch: Dispatch;
}) {
  const btn = (label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="rounded-sm border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );
  const id = task.id;
  const t: React.ReactNode[] = [];
  if (task.status === "IN_PROGRESS")
    t.push(
      btn("Submit for review", () =>
        dispatch(actions.submitTaskForReview({ taskId: id })),
      ),
    );
  if (task.status === "REVIEW") {
    t.push(
      btn("Accept", () =>
        dispatch(
          actions.acceptTask({
            taskId: id,
            completedAt: new Date().toISOString(),
          }),
        ),
      ),
    );
    t.push(btn("Reject", () => dispatch(actions.rejectTask({ taskId: id }))));
  }
  if (task.status === "BLOCKED")
    t.push(btn("Unblock", () => dispatch(actions.unblockTask({ taskId: id }))));
  else if (task.status !== "DONE" && task.status !== "DROPPED")
    t.push(btn("Block", () => dispatch(actions.blockTask({ taskId: id }))));
  if (task.status !== "DROPPED" && task.status !== "DONE")
    t.push(btn("Drop", () => dispatch(actions.dropTask({ taskId: id }))));

  if (t.length === 0) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{t}</div>;
}

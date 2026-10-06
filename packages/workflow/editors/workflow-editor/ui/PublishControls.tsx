// Publishing, the Activepieces way: a draft that is always editable, a
// Publish that snapshots it, and an on/off switch for the published flow.
import { useState } from "react";
import { Button, Toggle, Tooltip } from "../../shared/controls.js";
import {
  hasDraftChanges,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
  type WorkflowStatusValue,
} from "./model.js";
import type { WorkflowReadiness } from "./validation.js";

// Under enforcement a publish must be signed, or its runs reach no documents.
export interface PublishSignIn {
  required: boolean;
  pending: boolean;
  login: () => void;
}

function blockedReason(readiness: WorkflowReadiness): string {
  if (!readiness.hasTrigger) return "Add a trigger first";
  if (readiness.firstIncomplete) return "You have incomplete steps";
  return "Checking the steps…";
}

export function usePublish(callbacks: WorkflowEditorCallbacks) {
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publish = () => {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    callbacks
      .publish()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setPublishing(false));
  };
  return { publishing, error, publish };
}

export function PublishButton(props: {
  model: WorkflowModel;
  readiness: WorkflowReadiness;
  publishing: boolean;
  onPublish: () => void;
  onSelect: (id: string) => void;
  size?: "sm" | "md";
  signIn?: PublishSignIn;
}) {
  const { model, readiness } = props;
  if (props.signIn?.required) {
    return (
      <Tooltip content="This Switchboard enforces document permissions, so a publish must be signed">
        <Button
          size={props.size ?? "sm"}
          variant="primary"
          disabled={props.signIn.pending}
          onClick={props.signIn.login}
        >
          Sign in to publish
        </Button>
      </Tooltip>
    );
  }
  const incomplete = !readiness.ready;
  const changes = hasDraftChanges(model);
  const target = readiness.firstIncomplete;
  const select = () => {
    if (target) props.onSelect(target);
  };
  return (
    <Tooltip
      enabled={incomplete}
      content={
        <button
          type="button"
          className="font-medium text-wf-warn hover:underline"
          onClick={select}
        >
          {blockedReason(readiness)}
        </button>
      }
    >
      {/* The disabled button passes clicks through to this wrapper. */}
      <span className="inline-flex" onClick={incomplete ? select : undefined}>
        <Button
          size={props.size ?? "sm"}
          variant="primary"
          disabled={incomplete || !changes || props.publishing}
          title={!changes && !incomplete ? "No unpublished changes" : undefined}
          onClick={props.onPublish}
        >
          {props.publishing ? "Publishing…" : "Publish"}
        </Button>
      </span>
    </Tooltip>
  );
}

// A dot and a word: Draft until first published, then Published, or
// Unpublished changes once the draft moves on.
export function PublishState(props: {
  model: Pick<WorkflowModel, "version" | "published">;
}) {
  const draft = hasDraftChanges(props.model);
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title={
        props.model.published
          ? `Published ${new Date(props.model.published.publishedAt).toLocaleString()}`
          : "Never published"
      }
    >
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full ${draft ? "bg-wf-warn" : "bg-wf-ok"}`}
      />
      <span>
        {!props.model.published
          ? "Draft"
          : draft
            ? "Unpublished changes"
            : "Published"}
      </span>
      {props.model.published && draft ? (
        <span className="text-muted-foreground/80">
          · v{props.model.published.version} live
        </span>
      ) : null}
    </span>
  );
}

export function StatusToggle(props: {
  published: boolean;
  status: WorkflowStatusValue;
  onChange: (status: WorkflowStatusValue) => void;
  tooltipSide?: "below" | "left";
}) {
  // Nothing runs until the first publish.
  const allowed = props.published;
  const on = props.status === "ENABLED";
  return (
    <Tooltip
      enabled={!allowed}
      content="Publish the workflow first"
      align="end"
      side={props.tooltipSide}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Toggle
          checked={on}
          disabled={!allowed}
          label={on ? "Turn the workflow off" : "Turn the workflow on"}
          onChange={(checked) =>
            props.onChange(checked ? "ENABLED" : "DISABLED")
          }
        />
        <span className="w-6">{on ? "On" : "Off"}</span>
      </span>
    </Tooltip>
  );
}

// The live snapshot's blocks that need a reactor connection and bind none.
export function PublishedMissingNote(props: { missing: readonly string[] }) {
  if (props.missing.length === 0) return null;
  return (
    <span
      role="alert"
      aria-label="Published version incomplete"
      className="shrink-0 whitespace-nowrap rounded-full bg-wf-warn/12 px-2 py-0.5 text-xs text-wf-warn"
      title={`The published version is missing a reactor connection on: ${props.missing.join(", ")}`}
    >
      Live version incomplete
    </span>
  );
}

// Why the runtime won't give the published workflow reactor access.
export function ReactorDenialNote(props: { denial: string | null }) {
  if (!props.denial) return null;
  return (
    <span
      role="alert"
      aria-label="Reactor access denied"
      className="max-w-80 truncate rounded-full bg-wf-warn/12 px-2 py-0.5 text-xs text-wf-warn"
      title={props.denial}
    >
      No reactor access: {props.denial}
    </span>
  );
}

export function DraftBanner(props: {
  model: WorkflowModel;
  readiness: WorkflowReadiness;
  publishing: boolean;
  error: string | null;
  onPublish: () => void;
  onDiscard: () => void;
  onSelect: (id: string) => void;
  signIn?: PublishSignIn;
}) {
  if (!hasDraftChanges(props.model)) return null;
  const { readiness } = props;
  const target = readiness.firstIncomplete;
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-lg border border-solid border-foreground/10 bg-card py-1.5 pl-3 pr-1.5 text-[13px] shadow-sm"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-wf-warn" aria-hidden />
      <span className="text-foreground">You have unpublished changes</span>
      {props.error ? (
        <span className="text-xs text-wf-fail">{props.error}</span>
      ) : null}
      {!readiness.hasTrigger || target ? (
        <span className="flex items-center gap-1.5 text-xs text-wf-warn">
          <span>{target ? "Incomplete steps" : "No trigger yet"}</span>
          {target ? (
            <button
              type="button"
              className="font-medium underline underline-offset-2 hover:no-underline"
              onClick={() => props.onSelect(target)}
            >
              Show
            </button>
          ) : null}
        </span>
      ) : null}
      <span className="flex items-center gap-1">
        {props.model.published ? (
          <Button size="sm" variant="ghost" onClick={props.onDiscard}>
            Discard changes
          </Button>
        ) : null}
        <PublishButton
          model={props.model}
          readiness={readiness}
          publishing={props.publishing}
          onPublish={props.onPublish}
          onSelect={props.onSelect}
          signIn={props.signIn}
        />
      </span>
    </div>
  );
}

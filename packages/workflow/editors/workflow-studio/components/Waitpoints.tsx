// Where a WAITING run paused: approval cards for approval waitpoints, what
// other waits wait for, and the drive's list of runs waiting on someone.
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  RunRecord,
  WaitpointRecord,
} from "../../workflow-editor/runtime-client.js";
import {
  useRuntimeActions,
  useWaitingRunsQuery,
} from "../../workflow-editor/runtime-context.js";
import { textAreaClass } from "../../shared/controls.js";
import {
  CALL_FLOW_BLOCK,
  SUBFLOWS_PIECE,
} from "../../workflow-editor/ui/blocks.js";
import { formatAbsolute, formatUntil, formatWhen } from "./run-format.js";
import { Button, Icon } from "./ui.js";

// react-markdown builds elements from the AST and never runs raw HTML.
const PieceMarkdown = lazy(
  () => import("../../workflow-editor/ui/PieceMarkdown.js"),
);

const WAITING_POLL_MS = 30_000;
// The runtime serves at most this many waiting runs per call.
export const WAITING_LIMIT = 100;

// Callback waits (kind "webhook") resume through their URL, not a decision.
export function isOpenApproval(waitpoint: WaitpointRecord): boolean {
  return waitpoint.status === "PENDING" && waitpoint.kind === "approval";
}

// What a pending non-approval waitpoint waits for, by step name.
export function waitDescription(
  waitpoint: WaitpointRecord,
  stepName: string,
  step?: { pieceName: string; blockName: string },
): string {
  if (waitpoint.kind === "delay") {
    return waitpoint.resumeAt
      ? `${stepName} is waiting until ${formatAbsolute(waitpoint.resumeAt)}`
      : `${stepName} is waiting for its delay`;
  }
  const expiry = waitpoint.expiresAt
    ? `, until ${formatAbsolute(waitpoint.expiresAt)}`
    : "";
  if (
    step?.pieceName === SUBFLOWS_PIECE &&
    step.blockName === CALL_FLOW_BLOCK.name
  ) {
    return `${stepName} is waiting for the called workflow to respond${expiry}`;
  }
  return `${stepName} is waiting for a webhook callback${expiry}`;
}

// A cancelled run carries its reason in error; anything else failed.
export function cancelFailure(
  result: { status: string; error: string | null } | null,
): string | null {
  if (!result) return "The run was not found";
  if (result.status === "CANCELLED") return null;
  return result.error ?? `The run is ${result.status}`;
}

export interface PendingApprovals {
  total: number;
  byWorkflow: Map<string, number>;
  // The response hit the limit, so counts are lower bounds.
  capped: boolean;
}

export function countPendingApprovals(
  runs: readonly RunRecord[] | undefined,
  limit: number,
): PendingApprovals {
  const byWorkflow = new Map<string, number>();
  let total = 0;
  for (const run of runs ?? []) {
    const open = (run.waitpoints ?? []).filter(isOpenApproval).length;
    if (open === 0) continue;
    total += open;
    byWorkflow.set(
      run.workflowId,
      (byWorkflow.get(run.workflowId) ?? 0) + open,
    );
  }
  return { total, byWorkflow, capped: (runs?.length ?? 0) >= limit };
}

export function approvalCountText(count: number, capped: boolean): string {
  return capped ? `${count}+` : String(count);
}

export function approvalCountLabel(count: number, capped: boolean): string {
  const noun = count === 1 && !capped ? "approval" : "approvals";
  return `${approvalCountText(count, capped)} ${noun} waiting`;
}

// The drive's open approvals from one polled query, counted per workflow.
export function usePendingApprovals(driveId: string): PendingApprovals {
  const query = useWaitingRunsQuery(
    { driveId, first: WAITING_LIMIT },
    { pollMs: WAITING_POLL_MS },
  );
  return countPendingApprovals(query.data, WAITING_LIMIT);
}

// A count of open approvals; nothing at zero. A button when it navigates.
export function ApprovalBadge(props: {
  count: number;
  capped: boolean;
  onClick?: () => void;
  className?: string;
}) {
  if (props.count === 0) return null;
  const label = approvalCountLabel(props.count, props.capped);
  const className = `inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-wf-warn/12 px-1.5 text-[11px] font-medium tabular-nums text-wf-warn ${props.className ?? ""}`;
  const content = (
    <>
      <Icon name="clock" className="h-3 w-3" />
      {approvalCountText(props.count, props.capped)}
    </>
  );
  return props.onClick ? (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${className} hover:bg-wf-warn/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
      onClick={(event) => {
        event.stopPropagation();
        props.onClick!();
      }}
    >
      {content}
    </button>
  ) : (
    <span role="img" title={label} aria-label={label} className={className}>
      {content}
    </span>
  );
}

// Whether a decision needs a reason under the approval's policy.
export function reasonRequired(
  waitpoint: WaitpointRecord,
  approved: boolean,
): boolean {
  const policy = waitpoint.approval?.reasonRequiredOn ?? "none";
  return policy === "both" || (policy === "reject" && !approved);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ApprovalCard(props: {
  waitpoint: WaitpointRecord;
  stepName?: string;
  // Facts about the run, shown under the title.
  meta?: ReactNode;
  onResolved?: () => void;
}) {
  const { waitpoint } = props;
  const { resolveWaitpoint } = useRuntimeActions();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const approval = waitpoint.approval;
  const stepName = props.stepName ?? waitpoint.stepKey;
  const policy = approval?.reasonRequiredOn ?? "none";
  const expiresIn = waitpoint.expiresAt
    ? formatUntil(waitpoint.expiresAt)
    : null;

  const decide = (approved: boolean) => {
    const trimmed = reason.trim();
    if (reasonRequired(waitpoint, approved) && !trimmed) {
      setError(
        `Give a reason to ${approved ? "approve" : "disapprove"} this request.`,
      );
      return;
    }
    setBusy(approved);
    setError(null);
    resolveWaitpoint(waitpoint, approved, trimmed || undefined)
      .then(() => props.onResolved?.())
      .catch((resolveError: unknown) => setError(errorText(resolveError)))
      .finally(() => setBusy(null));
  };

  return (
    <section
      aria-label={`Approval for ${stepName}`}
      className="overflow-hidden rounded-xl border border-solid border-foreground/10 bg-card"
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wf-warn/12 text-wf-warn"
        >
          <Icon name="clock" className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 grow space-y-3">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              {approval?.title || `Waiting at ${stepName}`}
            </h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {props.meta}
              <span title={formatAbsolute(waitpoint.createdAt)}>
                Asked {formatWhen(waitpoint.createdAt)}
              </span>
              {waitpoint.expiresAt ? (
                <span
                  title={formatAbsolute(waitpoint.expiresAt)}
                  className={expiresIn ? undefined : "text-wf-warn"}
                >
                  {expiresIn ? `Expires ${expiresIn}` : "Expired"}
                </span>
              ) : null}
            </p>
          </div>
          {approval?.body ? (
            <Suspense
              fallback={
                <p className="whitespace-pre-wrap text-[13px] text-foreground">
                  {approval.body}
                </p>
              }
            >
              <PieceMarkdown
                text={approval.body}
                className="max-w-prose text-[13px] text-foreground"
              />
            </Suspense>
          ) : null}
          {approval && approval.approvers.length > 0 ? (
            <p
              className="text-xs text-muted-foreground"
              title={approval.approvers.join("\n")}
            >
              Only {approval.approvers.length} listed{" "}
              {approval.approvers.length === 1 ? "approver" : "approvers"} can
              decide.
            </p>
          ) : null}
        </div>
      </div>
      <div className="border-t border-solid border-border bg-muted/40 px-4 py-3">
        <label
          htmlFor={reasonId}
          className="mb-1.5 flex items-baseline gap-1.5 text-[13px] font-medium text-foreground"
        >
          Reason
          <span className="text-xs font-normal text-muted-foreground">
            {policy === "none"
              ? "Optional"
              : policy === "reject"
                ? "Required to disapprove"
                : "Required"}
          </span>
        </label>
        <textarea
          id={reasonId}
          className={`${textAreaClass} min-h-16 resize-y`}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {error ? (
            <span role="alert" className="mr-auto text-xs text-wf-fail">
              {error}
            </span>
          ) : null}
          <Button
            variant="destructive"
            disabled={busy !== null}
            onClick={() => decide(false)}
          >
            <Icon name="close" className="h-3.5 w-3.5" />
            {busy === false
              ? "Disapproving…"
              : approval?.rejectLabel || "Disapprove"}
          </Button>
          <Button
            variant="primary"
            disabled={busy !== null}
            onClick={() => decide(true)}
          >
            <Icon name="check" className="h-3.5 w-3.5" />
            {busy === true ? "Approving…" : approval?.approveLabel || "Approve"}
          </Button>
        </div>
      </div>
    </section>
  );
}

// The run detail's waitpoints: open approvals to decide, other waits shown.
export function RunWaitpoints(props: {
  waitpoints: WaitpointRecord[];
  names: Map<string, string>;
  steps?: { stepKey: string; pieceName: string; blockName: string }[];
  onChanged: () => void;
}) {
  const open = props.waitpoints.filter(
    (waitpoint) => waitpoint.status === "PENDING",
  );
  if (open.length === 0) return null;
  return (
    <div className="space-y-2">
      {open.map((waitpoint) =>
        waitpoint.kind === "approval" ? (
          <ApprovalCard
            key={waitpoint.id}
            waitpoint={waitpoint}
            stepName={props.names.get(waitpoint.stepKey)}
            onResolved={props.onChanged}
          />
        ) : (
          <p
            key={waitpoint.id}
            className="flex items-center gap-2 rounded-md bg-wf-warn/10 px-3 py-2 text-[13px] text-wf-warn"
          >
            <Icon name="clock" className="h-3.5 w-3.5" />
            {waitDescription(
              waitpoint,
              props.names.get(waitpoint.stepKey) ?? waitpoint.stepKey,
              props.steps?.find((step) => step.stepKey === waitpoint.stepKey),
            )}
          </p>
        ),
      )}
    </div>
  );
}

export function CancelRunButton(props: {
  run: RunRecord;
  onChanged: () => void;
}) {
  const { cancelRun } = useRuntimeActions();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="danger"
        disabled={cancelling}
        onClick={() => {
          setCancelling(true);
          setError(null);
          cancelRun(props.run.id)
            .then((result) => setError(cancelFailure(result)))
            .catch((cancelError: unknown) => setError(errorText(cancelError)))
            .finally(() => {
              setCancelling(false);
              props.onChanged();
            });
        }}
      >
        <Icon name="close" className="h-3.5 w-3.5" />
        {cancelling ? "Cancelling…" : "Cancel run"}
      </Button>
      {error ? <span className="text-wf-fail">{error}</span> : null}
    </>
  );
}

// Runs in scope paused on an approval, each with its cards inline.
export function WaitingApprovals(props: {
  driveId?: string;
  workflowId?: string;
  showWorkflow: boolean;
  stepNames: Map<string, Map<string, string>>;
  onChanged: () => void;
  // Scrolls the list into view each time this changes.
  focusRequest?: number;
}) {
  const query = useWaitingRunsQuery(
    {
      driveId: props.driveId,
      workflowId: props.workflowId,
      first: WAITING_LIMIT,
    },
    { pollMs: WAITING_POLL_MS },
  );
  const entries = (query.data ?? []).flatMap((run) =>
    (run.waitpoints ?? [])
      .filter(isOpenApproval)
      .map((waitpoint) => ({ run, waitpoint })),
  );
  const capped = (query.data?.length ?? 0) >= WAITING_LIMIT;
  const sectionRef = useRef<HTMLElement>(null);
  const handled = useRef(0);
  const shown = entries.length > 0;
  // Waits for the rows, which may load after the navigation.
  useEffect(() => {
    const request = props.focusRequest ?? 0;
    if (!shown || request === handled.current) return;
    handled.current = request;
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    sectionRef.current?.focus({ preventScroll: true });
  }, [props.focusRequest, shown]);
  // Silent when unreachable: the runs view below already says so.
  if (!shown) return null;
  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label="Waiting for approval"
      className="mb-8 scroll-mt-4 focus:outline-none"
    >
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-foreground">
        Waiting for approval
        <ApprovalBadge count={entries.length} capped={capped} />
      </h2>
      <div className="space-y-3">
        {entries.map(({ run, waitpoint }) => {
          const names = props.stepNames.get(run.workflowId);
          return (
            <ApprovalCard
              key={waitpoint.id}
              waitpoint={waitpoint}
              stepName={names?.get(waitpoint.stepKey)}
              onResolved={props.onChanged}
              meta={
                <>
                  {props.showWorkflow ? (
                    <span className="font-medium text-foreground">
                      {run.workflowName}
                    </span>
                  ) : null}
                  <span title={formatAbsolute(run.startedAt)}>
                    Run <span className="font-mono">{run.id.slice(0, 8)}</span>{" "}
                    started {formatWhen(run.startedAt)}
                  </span>
                </>
              }
            />
          );
        })}
      </div>
    </section>
  );
}

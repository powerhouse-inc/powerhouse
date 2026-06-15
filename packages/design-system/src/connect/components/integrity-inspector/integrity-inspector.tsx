import { Icon } from "#design-system";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";

import type {
  RebuildResult,
  ValidationResult,
} from "@powerhousedao/reactor-browser";

export type IntegrityInspectorProps = {
  readonly onValidate: (
    documentId: string,
    branch?: string,
  ) => Promise<ValidationResult>;
  readonly onRebuildKeyframes: (
    documentId: string,
    branch?: string,
  ) => Promise<RebuildResult>;
  readonly onRebuildSnapshots: (
    documentId: string,
    branch?: string,
  ) => Promise<RebuildResult>;
};

type ActionStatus = "idle" | "running" | "done" | "error";
type ConfirmAction = "keyframes" | "snapshots" | null;

export function IntegrityInspector({
  onValidate,
  onRebuildKeyframes,
  onRebuildSnapshots,
}: IntegrityInspectorProps) {
  const [documentId, setDocumentId] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<ActionStatus>("idle");
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [rebuildResult, setRebuildResult] = useState<RebuildResult | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const clearResults = useCallback(() => {
    setValidationResult(null);
    setRebuildResult(null);
    setError(null);
    setConfirmAction(null);
  }, []);

  const handleValidate = useCallback(async () => {
    if (!documentId.trim()) return;
    clearResults();
    setStatus("running");
    try {
      const result = await onValidate(
        documentId.trim(),
        branch.trim() || undefined,
      );
      setValidationResult(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [documentId, branch, onValidate, clearResults]);

  const handleRebuildKeyframes = useCallback(async () => {
    if (!documentId.trim()) return;
    clearResults();
    setStatus("running");
    try {
      const result = await onRebuildKeyframes(
        documentId.trim(),
        branch.trim() || undefined,
      );
      setRebuildResult(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [documentId, branch, onRebuildKeyframes, clearResults]);

  const handleRebuildSnapshots = useCallback(async () => {
    if (!documentId.trim()) return;
    clearResults();
    setStatus("running");
    try {
      const result = await onRebuildSnapshots(
        documentId.trim(),
        branch.trim() || undefined,
      );
      setRebuildResult(result);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [documentId, branch, onRebuildSnapshots, clearResults]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">
          Integrity Inspector
        </h2>
      </div>

      <div className="flex shrink-0 items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-foreground">
            Document ID
          </label>
          <input
            className="rounded-sm border border-border px-3 py-1.5 text-sm outline-none focus:border-info"
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Enter document ID"
            type="text"
            value={documentId}
          />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <label className="text-xs font-medium text-foreground">
            Branch (optional)
          </label>
          <input
            className="rounded-sm border border-border px-3 py-1.5 text-sm outline-none focus:border-info"
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            type="text"
            value={branch}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 rounded-sm border border-info bg-info/10 px-3 py-1.5 text-sm text-info hover:hover-effect disabled:disabled-effect"
            disabled={
              !documentId.trim() ||
              status === "running" ||
              confirmAction !== null
            }
            onClick={() => void handleValidate()}
            type="button"
          >
            <Icon name="Checkmark" size={14} />
            Validate
          </button>
          <button
            className="flex items-center gap-1 rounded-sm border border-warning bg-warning/10 px-3 py-1.5 text-sm text-warning hover:hover-effect disabled:disabled-effect"
            disabled={
              !documentId.trim() ||
              status === "running" ||
              confirmAction !== null
            }
            onClick={() => setConfirmAction("keyframes")}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Rebuild Keyframes
          </button>
          <button
            className="flex items-center gap-1 rounded-sm border border-warning bg-warning/10 px-3 py-1.5 text-sm text-warning hover:hover-effect disabled:disabled-effect"
            disabled={
              !documentId.trim() ||
              status === "running" ||
              confirmAction !== null
            }
            onClick={() => setConfirmAction("snapshots")}
            type="button"
          >
            <Icon name="Reload" size={14} />
            Rebuild Snapshots
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="flex shrink-0 items-center gap-3 rounded-sm border border-warning bg-warning/10 px-3 py-2">
          <span className="text-sm text-warning">
            {confirmAction === "keyframes"
              ? "This will delete all keyframes for this document. Continue?"
              : "This will invalidate all cached snapshots for this document. Continue?"}
          </span>
          <button
            className="rounded-sm bg-warning px-3 py-1 text-sm text-warning-foreground hover:hover-effect"
            onClick={() => {
              if (confirmAction === "keyframes") {
                void handleRebuildKeyframes();
              } else {
                void handleRebuildSnapshots();
              }
            }}
            type="button"
          >
            Confirm
          </button>
          <button
            className="rounded-sm border border-border bg-background px-3 py-1 text-sm text-foreground hover:hover-effect"
            onClick={() => setConfirmAction(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border p-4">
        {status === "idle" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Enter a document ID and run an action
          </div>
        )}

        {status === "running" && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Running...
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded-sm bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {status === "done" && validationResult && (
          <ValidationResultView result={validationResult} />
        )}

        {status === "done" && rebuildResult && (
          <RebuildResultView result={rebuildResult} />
        )}
      </div>
    </div>
  );
}

function ValidationResultView({ result }: { result: ValidationResult }) {
  const totalIssues =
    result.keyframeIssues.length + result.snapshotIssues.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={twMerge(
            "size-3 rounded-full",
            result.isConsistent ? "bg-success" : "bg-destructive",
          )}
        />
        <span className="text-sm font-medium">
          {result.isConsistent
            ? "Document is consistent"
            : `Found ${totalIssues} issue(s)`}
        </span>
      </div>

      <div className="text-xs text-muted-foreground">
        Document: {result.documentId}
      </div>

      {result.keyframeIssues.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">
            Keyframe Issues
          </h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="px-2 py-1 text-left font-medium text-foreground">
                  Scope
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Branch
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Revision
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Keyframe Hash
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Replayed Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {result.keyframeIssues.map((issue, i) => (
                <tr key={`kf-${i}`} className="odd:bg-card even:bg-background">
                  <td className="px-2 py-1">{issue.scope}</td>
                  <td className="border-l border-border px-2 py-1">
                    {issue.branch}
                  </td>
                  <td className="border-l border-border px-2 py-1">
                    {issue.revision}
                  </td>
                  <td className="border-l border-border px-2 py-1 font-mono">
                    {issue.keyframeHash}
                  </td>
                  <td className="border-l border-border px-2 py-1 font-mono">
                    {issue.replayedHash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result.snapshotIssues.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-foreground">
            Snapshot Issues
          </h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="px-2 py-1 text-left font-medium text-foreground">
                  Scope
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Branch
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Snapshot Hash
                </th>
                <th className="border-l border-border px-2 py-1 text-left font-medium text-foreground">
                  Replayed Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {result.snapshotIssues.map((issue, i) => (
                <tr
                  key={`snap-${i}`}
                  className="odd:bg-card even:bg-background"
                >
                  <td className="px-2 py-1">{issue.scope}</td>
                  <td className="border-l border-border px-2 py-1">
                    {issue.branch}
                  </td>
                  <td className="border-l border-border px-2 py-1 font-mono">
                    {issue.snapshotHash}
                  </td>
                  <td className="border-l border-border px-2 py-1 font-mono">
                    {issue.replayedHash}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RebuildResultView({ result }: { result: RebuildResult }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full bg-success" />
        <span className="text-sm font-medium">Rebuild complete</span>
      </div>
      <div className="text-xs text-muted-foreground">
        Document: {result.documentId}
      </div>
      {result.keyframesDeleted > 0 && (
        <div className="text-sm text-foreground">
          Keyframes deleted: {result.keyframesDeleted}
        </div>
      )}
      {result.scopesInvalidated > 0 && (
        <div className="text-sm text-foreground">
          Scopes invalidated: {result.scopesInvalidated}
        </div>
      )}
    </div>
  );
}

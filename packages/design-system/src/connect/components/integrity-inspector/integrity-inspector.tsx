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
        <h2 className="text-lg font-semibold text-gray-900">
          Integrity Inspector
        </h2>
      </div>

      <div className="flex shrink-0 items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">
            Document ID
          </label>
          <input
            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Enter document ID"
            type="text"
            value={documentId}
          />
        </div>
        <div className="flex w-40 flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">
            Branch (optional)
          </label>
          <input
            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            type="text"
            value={branch}
          />
        </div>
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 disabled:opacity-50"
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
            className="flex items-center gap-1 rounded border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-sm text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
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
            className="flex items-center gap-1 rounded border border-yellow-300 bg-yellow-50 px-3 py-1.5 text-sm text-yellow-700 hover:bg-yellow-100 disabled:opacity-50"
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
        <div className="flex shrink-0 items-center gap-3 rounded border border-yellow-400 bg-yellow-50 px-3 py-2">
          <span className="text-sm text-yellow-800">
            {confirmAction === "keyframes"
              ? "This will delete all keyframes for this document. Continue?"
              : "This will invalidate all cached snapshots for this document. Continue?"}
          </span>
          <button
            className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700"
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
            className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
            onClick={() => setConfirmAction(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-300 p-4">
        {status === "idle" && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Enter a document ID and run an action
          </div>
        )}

        {status === "running" && (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            Running...
          </div>
        )}

        {status === "error" && error && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">
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
            result.isConsistent ? "bg-green-500" : "bg-red-500",
          )}
        />
        <span className="text-sm font-medium">
          {result.isConsistent
            ? "Document is consistent"
            : `Found ${totalIssues} issue(s)`}
        </span>
      </div>

      <div className="text-xs text-gray-500">Document: {result.documentId}</div>

      {result.keyframeIssues.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-gray-700">Keyframe Issues</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left font-medium text-gray-600">
                  Scope
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Branch
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Revision
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Keyframe Hash
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Replayed Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {result.keyframeIssues.map((issue, i) => (
                <tr key={`kf-${i}`} className="odd:bg-white even:bg-gray-50">
                  <td className="px-2 py-1">{issue.scope}</td>
                  <td className="border-l border-gray-300 px-2 py-1">
                    {issue.branch}
                  </td>
                  <td className="border-l border-gray-300 px-2 py-1">
                    {issue.revision}
                  </td>
                  <td className="border-l border-gray-300 px-2 py-1 font-mono">
                    {issue.keyframeHash}
                  </td>
                  <td className="border-l border-gray-300 px-2 py-1 font-mono">
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
          <h3 className="text-sm font-medium text-gray-700">Snapshot Issues</h3>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-2 py-1 text-left font-medium text-gray-600">
                  Scope
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Branch
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Snapshot Hash
                </th>
                <th className="border-l border-gray-300 px-2 py-1 text-left font-medium text-gray-600">
                  Replayed Hash
                </th>
              </tr>
            </thead>
            <tbody>
              {result.snapshotIssues.map((issue, i) => (
                <tr key={`snap-${i}`} className="odd:bg-white even:bg-gray-50">
                  <td className="px-2 py-1">{issue.scope}</td>
                  <td className="border-l border-gray-300 px-2 py-1">
                    {issue.branch}
                  </td>
                  <td className="border-l border-gray-300 px-2 py-1 font-mono">
                    {issue.snapshotHash}
                  </td>
                  <td className="border-l border-gray-300 px-2 py-1 font-mono">
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
        <span className="size-3 rounded-full bg-green-500" />
        <span className="text-sm font-medium">Rebuild complete</span>
      </div>
      <div className="text-xs text-gray-500">Document: {result.documentId}</div>
      {result.keyframesDeleted > 0 && (
        <div className="text-sm text-gray-700">
          Keyframes deleted: {result.keyframesDeleted}
        </div>
      )}
      {result.scopesInvalidated > 0 && (
        <div className="text-sm text-gray-700">
          Scopes invalidated: {result.scopesInvalidated}
        </div>
      )}
    </div>
  );
}

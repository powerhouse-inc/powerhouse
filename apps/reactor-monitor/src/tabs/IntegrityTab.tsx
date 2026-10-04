/**
 * Ported from
 * packages/design-system/src/connect/components/integrity-inspector/integrity-inspector.tsx
 * for the same reason as QueueTab.tsx (see its header comment).
 */
import type {
  IInspector,
  RebuildResult,
  ValidationResult,
} from "@powerhousedao/reactor";
import { useCallback, useState } from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";

export type IntegrityTabProps = {
  readonly inspector: IInspector;
  /**
   * Whether the integrity ops are served for this reactor. Validation sits
   * behind the same gate as the rebuilds: it walks a document's whole
   * operation history, which is an operator-weight read, and the remote
   * surface serves the three together.
   */
  readonly admin?: AdminGate;
};

type Status = "idle" | "running" | "done" | "error";
type ConfirmAction = "keyframes" | "snapshots" | null;

function ValidationResultView({ result }: { result: ValidationResult }) {
  const totalIssues =
    result.keyframeIssues.length +
    result.snapshotIssues.length +
    result.streamOrderIssues.length;
  return (
    <div className="rm-result">
      <p>
        <span
          className={
            result.isConsistent ? "rm-dot rm-dot-ok" : "rm-dot rm-dot-error"
          }
        />{" "}
        {result.isConsistent
          ? "Document is consistent"
          : `Found ${totalIssues} issue(s)`}
      </p>
      <p className="rm-note">Document: {result.documentId}</p>
      {result.keyframeIssues.length > 0 ? (
        <>
          <h4>Keyframe issues</h4>
          <pre className="rm-json">
            {JSON.stringify(result.keyframeIssues, null, 2)}
          </pre>
        </>
      ) : null}
      {result.snapshotIssues.length > 0 ? (
        <>
          <h4>Snapshot issues</h4>
          <pre className="rm-json">
            {JSON.stringify(result.snapshotIssues, null, 2)}
          </pre>
        </>
      ) : null}
      {result.streamOrderIssues.length > 0 ? (
        <>
          <h4>Stream order issues</h4>
          <pre className="rm-json">
            {JSON.stringify(result.streamOrderIssues, null, 2)}
          </pre>
        </>
      ) : null}
    </div>
  );
}

function RebuildResultView({ result }: { result: RebuildResult }) {
  return (
    <div className="rm-result">
      <p>
        <span className="rm-dot rm-dot-ok" /> Rebuild complete
      </p>
      <p className="rm-note">Document: {result.documentId}</p>
      <p>Keyframes deleted: {result.keyframesDeleted}</p>
      <p>Scopes invalidated: {result.scopesInvalidated}</p>
    </div>
  );
}

export function IntegrityTab({
  inspector,
  admin = ADMIN_ALLOWED,
}: IntegrityTabProps) {
  const [documentId, setDocumentId] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<Status>("idle");
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

  const run = useCallback(
    async (
      action: () => Promise<ValidationResult | RebuildResult>,
      kind: "validate" | "rebuild",
    ) => {
      clearResults();
      setStatus("running");
      try {
        const result = await action();
        if (kind === "validate") {
          setValidationResult(result as ValidationResult);
        } else {
          setRebuildResult(result as RebuildResult);
        }
        setStatus("done");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [clearResults],
  );

  const trimmedId = documentId.trim();
  const trimmedBranch = branch.trim() || undefined;
  const disabled =
    !admin.enabled ||
    !trimmedId ||
    status === "running" ||
    confirmAction !== null;

  return (
    <div className="rm-tab">
      <h2>Integrity</h2>
      <AdminGateNote gate={admin} />
      <div className="rm-form rm-form-inline">
        <label>
          Document ID
          <input
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Enter document ID"
            type="text"
            value={documentId}
          />
        </label>
        <label>
          Branch (optional)
          <input
            onChange={(e) => setBranch(e.target.value)}
            placeholder="main"
            type="text"
            value={branch}
          />
        </label>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={disabled}
            onClick={() =>
              void run(
                () => inspector.validateDocument(trimmedId, trimmedBranch),
                "validate",
              )
            }
            type="button"
          >
            Validate
          </button>
          <button
            className="rm-btn rm-btn-warn"
            disabled={disabled}
            onClick={() => setConfirmAction("keyframes")}
            type="button"
          >
            Rebuild Keyframes
          </button>
          <button
            className="rm-btn rm-btn-warn"
            disabled={disabled}
            onClick={() => setConfirmAction("snapshots")}
            type="button"
          >
            Rebuild Snapshots
          </button>
        </div>
      </div>

      {confirmAction ? (
        <div className="rm-confirm">
          <span>
            {confirmAction === "keyframes"
              ? "This will delete all keyframes for this document. Continue?"
              : "This will invalidate all cached snapshots for this document. Continue?"}
          </span>
          <button
            className="rm-btn rm-btn-warn"
            onClick={() =>
              void run(
                () =>
                  confirmAction === "keyframes"
                    ? inspector.rebuildKeyframes(trimmedId, trimmedBranch)
                    : inspector.rebuildSnapshots(trimmedId, trimmedBranch),
                "rebuild",
              )
            }
            type="button"
          >
            Confirm
          </button>
          <button
            className="rm-btn"
            onClick={() => setConfirmAction(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div className="rm-panel-box">
        {status === "idle" ? (
          <p className="rm-placeholder">
            Enter a document ID and run an action
          </p>
        ) : null}
        {status === "running" ? (
          <p className="rm-placeholder">Running...</p>
        ) : null}
        {status === "error" && error ? (
          <p className="rm-error">{error}</p>
        ) : null}
        {status === "done" && validationResult ? (
          <ValidationResultView result={validationResult} />
        ) : null}
        {status === "done" && rebuildResult ? (
          <RebuildResultView result={rebuildResult} />
        ) : null}
      </div>
    </div>
  );
}

export default IntegrityTab;

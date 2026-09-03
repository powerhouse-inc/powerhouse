import { Check, X } from "lucide-react";
import type { PendingApproval } from "../types.js";

function formatArgs(args: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
  return json.length > 400 ? `${json.slice(0, 400)}\n…` : json;
}

/**
 * In-chat approval card for a write tool call. Approving or rejecting
 * resolves the pending approval inside the agent loop.
 */
export function ApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: PendingApproval;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Approval required — {approval.name}
      </p>
      <pre className="mb-3 max-h-40 overflow-auto rounded bg-background p-2 text-xs text-foreground">
        {formatArgs(approval.args)}
      </pre>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApprove(approval.toolCallId)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Check size={14} />
          Approve
        </button>
        <button
          type="button"
          onClick={() => onReject(approval.toolCallId)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
        >
          <X size={14} />
          Reject
        </button>
      </div>
    </div>
  );
}

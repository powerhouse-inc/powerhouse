// The workflows that depend on this connection, and through which steps, so
// nobody revokes or deletes it blind.
import { setSelectedNode } from "@powerhousedao/reactor-browser";
import { useWorkflowDocumentsInSelectedDrive } from "document-models/workflow";
import { BlockLogo } from "../workflow-editor/ui/BlockSelector.js";
import {
  connectionUsage,
  type ConnectionUsage,
  type UsageWorkflow,
} from "./connection-usage.js";

export function useConnectionUsage(connectionId: string) {
  const workflows = useWorkflowDocumentsInSelectedDrive() ?? [];
  return connectionUsage(
    connectionId,
    workflows.map((workflow): UsageWorkflow => ({
      id: workflow.header.id,
      name: workflow.state.global.name || workflow.header.name || "Untitled",
      status: workflow.state.global.status,
      trigger: workflow.state.global.trigger,
      steps: workflow.state.global.steps,
    })),
  );
}

export function UsedBy(props: { usage: ConnectionUsage[] }) {
  const { usage } = props;
  return (
    <section className="mt-8 border-t border-solid border-foreground/10 pt-5">
      <h3 className="text-[13px] font-semibold text-foreground">Used by</h3>
      {usage.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No workflow uses this connection yet. Pick it on a step in a
          workflow's editor.
        </p>
      ) : (
        <ul className="-mx-2 mt-2 flex flex-col">
          {usage.map((entry) => (
            <li key={entry.workflow.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[13px] hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSelectedNode(entry.workflow.id)}
              >
                <span className="shrink-0 font-medium text-foreground">
                  {entry.workflow.name}
                </span>
                {entry.workflow.status !== "ENABLED" ? (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    {entry.workflow.status.charAt(0) +
                      entry.workflow.status.slice(1).toLowerCase()}
                  </span>
                ) : null}
                <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                  {entry.steps.map((step) => (
                    <span
                      key={step.id}
                      className="inline-flex items-center gap-1"
                    >
                      <BlockLogo blockType={step.blockType} size={14} bare />
                      {step.name || step.key}
                    </span>
                  ))}
                  {entry.trigger ? <span>Trigger</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

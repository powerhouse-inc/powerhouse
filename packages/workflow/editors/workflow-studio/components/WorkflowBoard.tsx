// The drive's workflows at a glance: when each starts, its chain coloured by
// the latest run, and its recent runs. The studio's landing view.
import { useWorkflowDocumentsInSelectedDrive } from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { usePieceLogos } from "../../workflow-editor/ui/block-meta.js";
import { describeTrigger } from "../../workflow-editor/ui/trigger-text.js";
import { MiniChain, RunStrip, type ChainLink } from "./chain.js";
import {
  formatAbsolute,
  formatWhen,
  RUN_TONE,
  statusLabel,
  toneOf,
  workflowHealth,
} from "./run-format.js";
import { stepOutline } from "./step-outline.js";
import { Button, Icon, StatusDot } from "./ui.js";

interface BoardRow {
  id: string;
  name: string;
  status: string;
  trigger: string;
  links: ChainLink[];
  runs: RunRecord[];
}

function summary(rows: BoardRow[]): string {
  const count = `${rows.length} ${rows.length === 1 ? "workflow" : "workflows"}`;
  const failing = rows.filter((row) => row.runs[0]?.status === "FAILED").length;
  const enabled = rows.filter((row) => row.status === "ENABLED").length;
  const parts = [count, `${enabled} enabled`];
  if (failing > 0) parts.push(`${failing} failed on the last run`);
  return parts.join(", ");
}

export function WorkflowBoard(props: {
  runs: RunRecord[] | null;
  creating: boolean;
  onOpen: (workflowId: string) => void;
  onCreate: () => void;
}) {
  usePieceLogos();
  const documents = useWorkflowDocumentsInSelectedDrive() ?? [];
  const runs = props.runs ?? [];

  const rows: BoardRow[] = documents
    .map((document) => {
      const state = document.state.global;
      const workflowRuns = runs.filter(
        (run) => run.workflowId === document.header.id,
      );
      const latest = workflowRuns.at(0);
      const statusByKey = new Map(
        (latest?.steps ?? []).map((step) => [step.stepKey, step.status]),
      );
      const outline = stepOutline({
        triggerId: state.trigger?.id,
        steps: state.steps,
        edges: state.edges,
      });
      const links: ChainLink[] = [
        ...(state.trigger
          ? [
              {
                id: state.trigger.id,
                blockType: state.trigger.blockType,
                label: "Trigger",
                status: latest ? "SUCCEEDED" : undefined,
              },
            ]
          : []),
        ...outline.rows.map((row) => ({
          id: row.step.id,
          blockType: row.step.blockType,
          label: row.step.name || row.step.key,
          status: statusByKey.get(row.step.key),
        })),
      ];
      return {
        id: document.header.id,
        name: state.name || document.header.name || "Untitled workflow",
        status: state.status,
        trigger: describeTrigger(state.trigger),
        links,
        runs: workflowRuns,
      };
    })
    // Most recently run first, then by name, so the board doesn't reshuffle.
    .sort((a, b) => {
      const at = a.runs[0]?.startedAt ?? "";
      const bt = b.runs[0]?.startedAt ?? "";
      if (at !== bt) return bt.localeCompare(at);
      return a.name.localeCompare(b.name);
    });

  return (
    <section className="mb-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Workflows
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {rows.length === 0 ? "Automations in this drive" : summary(rows)}
          </p>
        </div>
        <Button
          variant="primary"
          disabled={props.creating}
          onClick={props.onCreate}
        >
          <Icon name="plus" className="h-3.5 w-3.5" />
          New workflow
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-foreground/15 px-6 py-12 text-center">
          <p className="text-[15px] font-medium text-foreground">
            No workflows yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
            A workflow starts on a trigger, like a schedule or a webhook, and
            runs a chain of steps across your services.
          </p>
        </div>
      ) : (
        <ul
          aria-label="Workflows"
          className="overflow-hidden rounded-xl border border-solid border-foreground/10 bg-card"
        >
          {rows.map((row) => {
            const latest = row.runs.at(0);
            const latestTone = toneOf(RUN_TONE, latest?.status);
            const health = workflowHealth(row.status, latest?.status);
            return (
              <li
                key={row.id}
                className="border-b border-solid border-foreground/10 last:border-b-0"
              >
                <button
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-3 px-5 py-4 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]"
                  onClick={() => props.onOpen(row.id)}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span title={health.label} className="flex">
                        <StatusDot tone={health.tone} />
                      </span>
                      <span className="truncate text-[15px] font-semibold text-foreground">
                        {row.name}
                      </span>
                      {row.status !== "ENABLED" ? (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {statusLabel(row.status)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate pl-4 text-[13px] text-muted-foreground">
                      {row.trigger}
                    </span>
                  </span>
                  <span className="hidden md:block">
                    <MiniChain links={row.links} />
                  </span>
                  <span
                    className="hidden text-[13px] md:block"
                    title={
                      latest ? formatAbsolute(latest.startedAt) : undefined
                    }
                  >
                    {latest ? (
                      <>
                        <span
                          className={`font-medium ${latestTone === "fail" ? "text-wf-fail" : latestTone === "ok" ? "text-wf-ok" : "text-foreground"}`}
                        >
                          {statusLabel(latest.status)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {formatWhen(latest.startedAt)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not run yet</span>
                    )}
                  </span>
                  <RunStrip runs={row.runs} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

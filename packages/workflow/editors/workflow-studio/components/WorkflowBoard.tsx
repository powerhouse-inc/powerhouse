// The drive's workflows at a glance: each one's graph coloured by the latest
// run, and its recent runs. The studio's landing view.
import { useDispatch } from "@powerhousedao/reactor-browser";
import {
  actions as workflowActions,
  useWorkflowDocumentsInSelectedDrive,
  type WorkflowDocument,
} from "document-models/workflow";
import { StatusToggle } from "../../workflow-editor/ui/PublishControls.js";
import type { RunRecord } from "../../workflow-editor/runtime-client.js";
import { usePieceLogos } from "../../workflow-editor/ui/block-meta.js";
import { describeTrigger } from "../../workflow-editor/ui/trigger-text.js";
import { RunStrip } from "./chain.js";
import {
  formatAbsolute,
  formatWhen,
  RUN_TONE,
  statusLabel,
  toneOf,
  workflowHealth,
} from "./run-format.js";
import { Button, Icon, StatusDot } from "./ui.js";
import { WorkflowGraph } from "./WorkflowGraph.js";
import { WorkflowMenu } from "./WorkflowMenu.js";

// Its own component so each row holds its document's dispatch.
function RowToggle(props: { document: WorkflowDocument }) {
  const [, dispatch] = useDispatch(props.document);
  const state = props.document.state.global;
  return (
    <StatusToggle
      tooltipSide="left"
      published={Boolean(state.published)}
      status={state.status}
      onChange={(status) =>
        dispatch(workflowActions.setWorkflowStatus({ status }))
      }
    />
  );
}

interface BoardRow {
  document: WorkflowDocument;
  id: string;
  name: string;
  status: string;
  trigger: string;
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
  // Workflow ids in sidebar order.
  order: string[];
  creating: boolean;
  onOpen: (workflowId: string) => void;
  onCreate: () => void;
}) {
  usePieceLogos();
  const documents = useWorkflowDocumentsInSelectedDrive() ?? [];
  const runs = props.runs ?? [];
  const positions = new Map(props.order.map((id, i) => [id, i]));
  const position = (id: string) => positions.get(id) ?? positions.size;

  const rows: BoardRow[] = documents
    .map((document) => {
      const state = document.state.global;
      const workflowRuns = runs.filter(
        (run) => run.workflowId === document.header.id,
      );
      return {
        document,
        id: document.header.id,
        name: state.name || document.header.name || "Untitled workflow",
        status: state.status,
        trigger: describeTrigger(state.trigger),
        runs: workflowRuns,
      };
    })
    .sort((a, b) => position(a.id) - position(b.id));

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
          // Not overflow-hidden: the row menus open past the card's edge.
          className="rounded-xl border border-solid border-foreground/10 bg-card"
        >
          {rows.map((row) => {
            const latest = row.runs.at(0);
            const latestTone = toneOf(RUN_TONE, latest?.status);
            const health = workflowHealth(
              row.status,
              latest?.status,
              Boolean(row.document.state.global.published),
            );
            return (
              <li
                key={row.id}
                className="flex items-start border-b border-solid border-foreground/10 transition-colors first:rounded-t-xl last:rounded-b-xl last:border-b-0 hover:bg-accent/50 has-[>button:focus-visible]:bg-accent/50"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col gap-3 px-5 py-4 text-left focus-visible:outline-none"
                  onClick={() => props.onOpen(row.id)}
                >
                  {/* One 24px line, shared with the toggle and menu beside it. */}
                  <span className="grid h-6 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 md:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto]">
                    <span className="flex min-w-0 items-center gap-2">
                      <span title={health.label} className="flex">
                        <StatusDot tone={health.tone} hollow={health.hollow} />
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
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {formatWhen(latest.startedAt)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Not run yet
                        </span>
                      )}
                    </span>
                    <RunStrip centered runs={row.runs} />
                  </span>
                  {/* Scrolls rather than squeezing a wide workflow. */}
                  <span className="block max-w-full overflow-x-auto py-1 pl-4 pr-1">
                    <WorkflowGraph
                      state={row.document.state.global}
                      triggerText={row.trigger}
                      latest={latest}
                    />
                  </span>
                </button>
                <span className="mt-4 flex h-6 shrink-0 items-center gap-1 pr-3">
                  <RowToggle document={row.document} />
                  <WorkflowMenu document={row.document} />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

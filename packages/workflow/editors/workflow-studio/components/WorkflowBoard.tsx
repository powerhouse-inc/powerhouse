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
import { BlockLogo } from "../../workflow-editor/ui/BlockSelector.js";
import { triggerBlock } from "../../workflow-editor/ui/blocks.js";
import { describeTrigger } from "../../workflow-editor/ui/trigger-text.js";
import { MiniChain, RunStrip, workflowLinks } from "./chain.js";
import { ScrollFade } from "./ScrollFade.js";
import { useCollapsed } from "./use-collapsed.js";
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

// A folded row's workflow: the trigger as words, then its steps as logos.
function CollapsedChain(props: {
  state: WorkflowDocument["state"]["global"];
  triggerText: string;
  latest?: RunRecord;
}) {
  const trigger = props.state.trigger
    ? triggerBlock(props.state.trigger)
    : null;
  const links = workflowLinks(
    {
      triggerId: props.state.trigger?.id,
      steps: props.state.steps,
      edges: props.state.edges,
    },
    props.latest,
  );
  return (
    // A column of the title line; the trigger's words give way before the name.
    <span className="flex min-w-0 items-center">
      <span
        title={props.triggerText}
        className={`flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-card pl-0.5 pr-2.5 text-[12px] font-medium text-foreground ring-[1.5px] ${
          props.latest
            ? "ring-wf-ok"
            : "ring-foreground/15 dark:ring-foreground/30"
        }`}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full dark:bg-white">
          {trigger ? <BlockLogo bare block={trigger} size={12} /> : null}
        </span>
        <span className="truncate">{props.triggerText}</span>
      </span>
      {links.length > 0 ? (
        // The steps give way before the trigger's words, fading where cut.
        <span className="flex min-w-0 shrink-[100] items-center">
          <span
            aria-hidden
            className="h-0.5 w-3 shrink-0 bg-foreground/15 dark:bg-foreground/30"
          />
          {/* Room for the circles' rings, which a clip would otherwise shave. */}
          <ScrollFade clip className="-my-1 min-w-0 py-1 pl-0.5">
            <MiniChain links={links} />
          </ScrollFade>
        </span>
      ) : null}
    </span>
  );
}

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
  description?: string | null;
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
  const { isCollapsed, toggle } = useCollapsed();
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
        description: state.description,
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
            const collapsed = isCollapsed(row.id);
            return (
              <li
                key={row.id}
                className="group/row border-b border-solid border-foreground/10 first:rounded-t-xl last:rounded-b-xl last:border-b-0"
              >
                {/* Each part lights up on its own, so folding and opening read apart. */}
                <div
                  className={`flex items-start transition-colors group-first/row:rounded-t-xl has-[[data-row-header]:hover]:bg-accent/40 has-[[data-row-header]:focus-visible]:bg-accent/40 ${collapsed ? "group-last/row:rounded-b-xl" : ""}`}
                >
                  {/* The header folds the row; the content below opens the workflow. */}
                  <button
                    type="button"
                    data-row-header
                    aria-expanded={!collapsed}
                    aria-label={`${collapsed ? "Expand" : "Collapse"} ${row.name}`}
                    className="group/header @container flex min-w-0 flex-1 cursor-pointer items-start gap-1 py-4 pl-2 pr-5 text-left focus-visible:outline-none"
                    onClick={() => toggle(row.id)}
                  >
                    <span
                      aria-hidden
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors group-hover/header:bg-accent group-hover/header:text-foreground group-focus-visible/header:bg-accent group-focus-visible/header:text-foreground"
                    >
                      <Icon
                        name="chevron"
                        className={`h-3.5 w-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`}
                      />
                    </span>
                    {/* A 24px line, shared with the toggle and menu beside it. */}
                    <span
                      className={`grid w-full grid-rows-[1.5rem] items-center gap-x-6 ${
                        collapsed
                          ? // Short of room, the last run goes first, then the run strip.
                            "grid-cols-[minmax(10rem,2fr)_minmax(0,3fr)] @[44rem]:grid-cols-[minmax(10rem,2fr)_minmax(0,3fr)_auto] @[60rem]:grid-cols-[minmax(10rem,2fr)_minmax(0,3fr)_minmax(0,10rem)_auto]"
                          : "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_minmax(0,10rem)_auto]"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span title={health.label} className="flex">
                          <StatusDot
                            tone={health.tone}
                            hollow={health.hollow}
                          />
                        </span>
                        <span className="min-w-0 truncate text-[15px] font-semibold text-foreground">
                          {row.name}
                        </span>
                        {row.status !== "ENABLED" ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {statusLabel(row.status)}
                          </span>
                        ) : null}
                      </span>
                      {collapsed ? (
                        <CollapsedChain
                          state={row.document.state.global}
                          triggerText={row.trigger}
                          latest={latest}
                        />
                      ) : null}
                      <span
                        className={`hidden text-[13px] ${collapsed ? "@[60rem]:block" : "md:block"}`}
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
                      {collapsed ? (
                        <span className="hidden @[44rem]:block">
                          <RunStrip centered runs={row.runs} />
                        </span>
                      ) : (
                        <RunStrip centered runs={row.runs} />
                      )}
                    </span>
                  </button>
                  <span className="mt-4 flex h-6 shrink-0 items-center gap-1 pr-3">
                    <RowToggle document={row.document} />
                    <WorkflowMenu document={row.document} />
                  </span>
                </div>
                {collapsed ? null : (
                  <button
                    type="button"
                    aria-label={`Open ${row.name}`}
                    className="group/content relative flex w-full cursor-pointer flex-col gap-3 pb-4 pl-9 pr-5 pt-1 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none group-last/row:rounded-b-xl"
                    onClick={() => props.onOpen(row.id)}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute right-5 top-1 flex items-center gap-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover/content:opacity-100 group-focus-visible/content:opacity-100"
                    >
                      Open workflow
                      <Icon name="arrowRight" className="h-3.5 w-3.5" />
                    </span>
                    {/* A paragraph's width: the row's on a narrow screen, never a whole wide row. */}
                    {row.description ? (
                      <span className="max-w-prose pl-4 text-[13px] leading-5 text-muted-foreground">
                        {row.description}
                      </span>
                    ) : null}
                    {/* Fits the row; scrolls only past the narrowest columns. */}
                    <ScrollFade className="max-w-full py-1 pl-4 pr-1">
                      <WorkflowGraph
                        fit
                        state={row.document.state.global}
                        triggerText={row.trigger}
                        latest={latest}
                      />
                    </ScrollFade>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

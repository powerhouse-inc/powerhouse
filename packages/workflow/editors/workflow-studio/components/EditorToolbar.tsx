// The bar above an open document editor: the way back to the journal, plus
// the run facts an author wants while editing.
import { useDocumentSafe } from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import {
  formatAbsolute,
  formatDuration,
  formatWhen,
  RUN_TONE,
  runStats,
  toneOf,
  TONE_TEXT,
} from "./run-format.js";
import { Button, Icon, StatusDot } from "./ui.js";

const WORKFLOW_TYPE = "powerhouse/workflow";

function Fact(props: { label: string; value: string; title?: string }) {
  return (
    <span className="flex items-baseline gap-1.5" title={props.title}>
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="text-[13px] tabular-nums text-foreground">
        {props.value}
      </span>
    </span>
  );
}

export function EditorToolbar(props: {
  node?: FileNode;
  runs: RunRecord[] | null;
  onBack: () => void;
}) {
  const { data: document } = useDocumentSafe(props.node?.id ?? null);
  const isWorkflow = document?.header.documentType === WORKFLOW_TYPE;
  const stats = runStats(props.runs ?? []);
  const lastRun = isWorkflow ? stats.lastRun : undefined;
  const lastTone = toneOf(RUN_TONE, lastRun?.status);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-solid border-border bg-background px-3 py-2">
      <Button variant="ghost" className="-ml-1" onClick={props.onBack}>
        <Icon name="back" />
        {isWorkflow ? "Runs" : "Overview"}
      </Button>
      {isWorkflow ? (
        <span className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-1">
          {lastRun ? (
            <span
              className="flex items-baseline gap-1.5"
              title={formatAbsolute(lastRun.startedAt)}
            >
              <span className="text-xs text-muted-foreground">Last run</span>
              <span
                className={`flex items-center gap-1.5 text-[13px] ${TONE_TEXT[lastTone]}`}
              >
                <StatusDot tone={lastTone} />
                {formatWhen(lastRun.startedAt)}
                <span className="tabular-nums text-muted-foreground">
                  {formatDuration(lastRun.startedAt, lastRun.endedAt)}
                </span>
              </span>
            </span>
          ) : (
            <Fact label="Last run" value="Never" />
          )}
          {stats.successRate !== null ? (
            <Fact
              label="Success"
              value={`${stats.successRate}%`}
              title={`${stats.succeeded} of ${stats.succeeded + stats.failed} finished runs succeeded`}
            />
          ) : null}
          <Fact label="Runs" value={String(stats.total)} />
        </span>
      ) : null}
    </div>
  );
}

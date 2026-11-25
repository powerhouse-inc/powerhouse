import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectSnapshot, ProjectSubgraph } from "../../api.js";
import { Callout } from "../../components/callout.js";
import { Code } from "../../components/code.js";
import { DescriptionList } from "../../components/description-list.js";
import { PageHeader } from "../../components/page-header.js";
import { Subsection } from "../../components/section.js";
import { Tag } from "../../components/status.js";
import { TabCount, Tabs, type TabItem } from "../../components/tabs.js";
import { EmptyText, Mono, Prose, TextButton } from "../../components/text.js";
import { cn } from "../../lib/cn.js";
import { plural } from "../../lib/plural.js";
import {
  checkRows,
  Checks,
  isProblem,
  loadedRow,
  type CheckRow,
} from "../../project/checks.js";
import { FileLink } from "../../project/open-in-editor.js";
import { useShell } from "../../shell/state.js";
import { moduleFacts } from "./module-facts.js";
import { FilesTab, useModuleFiles } from "./module-files.js";
import { belowFolder, type PageModule } from "./page-module.js";

export type ModuleTab = "overview" | "schema" | "files" | "checks";

function CheckSummary({
  rows,
  onSeeAll,
}: {
  rows: readonly CheckRow[];
  onSeeAll: () => void;
}) {
  const problems = rows.filter(isProblem);
  const passing = rows.filter((row) => row.tone === "ok").length;
  if (problems.length === 0) {
    if (passing === 0) return null;
    return (
      <button
        type="button"
        data-testid="ph-checks-pass"
        onClick={onSeeAll}
        className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Tag tone="ok" className="gap-1">
          <Check aria-hidden className="size-3" />
          {passing === 1 ? "The check passes" : `All ${passing} checks pass`}
        </Tag>
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {problems.map((row) => (
        <Callout
          key={row.id}
          tone={row.tone === "error" ? "error" : "warn"}
          title={row.label}
          data-testid="ph-module-problem"
          data-check={row.id}
          data-tone={row.tone}
        >
          {row.detail && <Prose text={row.detail} />}
        </Callout>
      ))}
      <p
        data-testid="ph-checks-more"
        className="text-[12px] text-muted-foreground"
      >
        {passing > 0 &&
          `${passing} more ${passing === 1 ? "check passes" : "checks pass"} · `}
        <TextButton onClick={onSeeAll}>See all</TextButton>
      </p>
    </div>
  );
}

function Overview({
  entry,
  snapshot,
  checks,
  onTab,
}: {
  entry: PageModule;
  snapshot: ProjectSnapshot;
  checks: readonly CheckRow[];
  onTab: (tab: ModuleTab) => void;
}) {
  return (
    <>
      <CheckSummary rows={checks} onSeeAll={() => onTab("checks")} />
      <div data-testid="ph-module-facts" className="mt-4">
        <DescriptionList rows={moduleFacts(entry, snapshot)} />
      </div>
    </>
  );
}

function Schema({ subgraph }: { subgraph: ProjectSubgraph }) {
  const { schema, queries, mutations, folder } = subgraph;
  if (!schema) {
    return (
      <EmptyText data-testid="ph-subgraph-schema">
        Its schema is built when the module runs.
      </EmptyText>
    );
  }
  const operations = [
    ...queries.map((signature) => ({ type: "query", signature }) as const),
    ...mutations.map((signature) => ({ type: "mutation", signature }) as const),
  ];
  return (
    <div data-testid="ph-subgraph-schema">
      {operations.length === 0 ? (
        <EmptyText>No queries or mutations.</EmptyText>
      ) : (
        <ul data-testid="ph-subgraph-operations" className="space-y-1">
          {operations.map(({ type, signature }) => (
            <li
              key={`${type}:${signature}`}
              data-testid="ph-operation"
              data-type={type}
              className="flex min-w-0 items-baseline gap-2"
            >
              <span
                title={type === "query" ? "Query" : "Mutation"}
                className={cn(
                  "inline-grid size-4 flex-none place-items-center rounded font-mono text-[9.5px] font-semibold",
                  type === "query"
                    ? "bg-info/12 text-info"
                    : "bg-chart-5/12 text-chart-5",
                )}
              >
                {type === "query" ? "Q" : "M"}
              </span>
              <Mono className="min-w-0 break-words">{signature}</Mono>
            </li>
          ))}
        </ul>
      )}
      <Subsection
        title="SDL"
        as="h3"
        className="mt-4"
        actions={
          <FileLink file={schema.file} className="text-muted-foreground">
            {belowFolder(schema.file, folder)}
          </FileLink>
        }
      >
        <Code lang="graphql">{schema.source}</Code>
      </Subsection>
    </div>
  );
}

export function ModuleDetail({
  entry,
  snapshot,
  tab,
  onTab,
  title,
  actions,
}: {
  entry: PageModule;
  snapshot: ProjectSnapshot;
  tab: ModuleTab;
  onTab: (tab: ModuleTab) => void;
  title: ReactNode;
  actions?: ReactNode;
}) {
  const { loadedModules } = useShell().host.app;
  const { files } = useModuleFiles(entry.module.folder);
  const { module } = entry;
  const checks = checkRows(module.checks);
  if (loadedModules && (entry.kind === "editor" || entry.kind === "app")) {
    const loaded =
      entry.kind === "editor" ? loadedModules.editors : loadedModules.apps;
    checks.push(loadedRow(loaded.includes(entry.id)));
  }
  const problems = checks.filter(isProblem);
  const items: TabItem<ModuleTab>[] = [
    { id: "overview", label: "Overview" },
    ...(entry.kind === "subgraph"
      ? [{ id: "schema", label: "Schema" } as const]
      : []),
    {
      id: "files",
      label: "Files",
      ...(files && {
        aside: <TabCount>{files.length}</TabCount>,
        ariaLabel: `Files, ${files.length}`,
      }),
    },
    {
      id: "checks",
      label: "Checks",
      aside:
        problems.length > 0 ? (
          <TabCount
            tone={
              problems.some((row) => row.tone === "error") ? "error" : "warn"
            }
          >
            {problems.length}
          </TabCount>
        ) : (
          <TabCount>✓</TabCount>
        ),
      ariaLabel:
        problems.length > 0
          ? `Checks, ${plural(problems.length, "problem")}`
          : "Checks, no problems",
    },
  ];
  const tabs = items.map((item) => ({
    ...item,
    data: { "data-testid": "ph-module-tab" },
  }));
  const shown = tabs.some(({ id }) => id === tab) ? tab : "overview";
  return (
    <section
      aria-label={entry.name}
      data-testid="ph-module-detail"
      data-kind={entry.kind}
      data-module-id={entry.id}
      data-tab={shown}
      className="flex min-w-0 flex-1 flex-col pb-2 @3xl:min-h-0"
    >
      <PageHeader title={title} actions={actions} className="pb-2.5" />
      <Tabs
        label={`${entry.name}: what to show`}
        tabs={tabs}
        selected={shown}
        onSelect={onTab}
        panelClassName="flex flex-1 flex-col @3xl:min-h-0"
      >
        {shown === "overview" && (
          <Overview
            entry={entry}
            snapshot={snapshot}
            checks={checks}
            onTab={onTab}
          />
        )}
        {shown === "schema" && entry.kind === "subgraph" && (
          <Schema subgraph={entry.module} />
        )}
        {shown === "files" && <FilesTab folder={module.folder} />}
        {shown === "checks" && <Checks rows={checks} />}
      </Tabs>
    </section>
  );
}

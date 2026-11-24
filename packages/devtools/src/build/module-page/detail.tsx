import { Check } from "lucide-react";
import type { ReactNode } from "react";
import type {
  ProjectApp,
  ProjectSnapshot,
  ProjectSubgraph,
} from "../../api.js";
import { Code, Mono, StatusDot, Tag } from "../../kit.js";
import { cn } from "../../lib/cn.js";
import { useShell } from "../../shell/state.js";
import { Button } from "../../ui/button.js";
import { moduleTarget } from "../project/focus.js";
import { FileLink } from "../project/open-in-editor.js";
import {
  belowFolder,
  checkRows,
  Checks,
  type CheckRow,
  CopyButton,
  DocumentTypes,
  loadedRow,
  Prose,
} from "../project/parts.js";
import { plural } from "../../lib/plural.js";
import {
  DetailHeader,
  Facts,
  MARK_TEXT,
  SubHead,
  Tabs,
  TextButton,
  type TabItem,
} from "../ui.js";
import { FilesTab, useModuleFiles } from "./files.js";
import { APP, endpointOf, PROCESSOR_TYPE, type PageModule } from "./text.js";

export type ModuleTab = "overview" | "schema" | "files" | "checks";

type Fact = [ReactNode, ReactNode];

const isProblem = (row: CheckRow) =>
  row.tone === "warn" || row.tone === "error";

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** The project's drive apps that can hold a document of one of the types:
 * those that allow it, and those that allow every type. */
const appsHolding = (types: readonly string[], snapshot: ProjectSnapshot) =>
  snapshot.apps.ok
    ? snapshot.apps.items.filter(
        ({ allowedDocumentTypes: allowed }) =>
          allowed !== null &&
          (allowed.length === 0 ||
            allowed.some((type) => types.includes(type))),
      )
    : [];

function AppLinks({ apps }: { apps: readonly ProjectApp[] }) {
  const { navigate } = useShell();
  return (
    <span className="flex flex-col items-start gap-0.5">
      {apps.map((app) => (
        <button
          key={app.folder}
          type="button"
          data-testid="ph-module-link"
          data-module-id={app.id}
          title={`Show ${app.name} in Drive Apps`}
          onClick={() => navigate(moduleTarget("app", app.id))}
          className="cursor-pointer text-left underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground"
        >
          {app.name}
        </button>
      ))}
    </span>
  );
}

function kindFacts(entry: PageModule, snapshot: ProjectSnapshot): Fact[] {
  const types = (list: readonly string[], none?: string) => (
    <DocumentTypes types={list} snapshot={snapshot} none={none} />
  );
  switch (entry.kind) {
    case "editor": {
      const { documentTypes } = entry.module;
      const apps = appsHolding(documentTypes, snapshot);
      return [
        ["Document types", types(documentTypes)],
        ...(apps.length > 0
          ? [["Drive apps", <AppLinks key="apps" apps={apps} />] as Fact]
          : []),
      ];
    }
    case "app": {
      const { documentTypes, allowedDocumentTypes, dragAndDrop } = entry.module;
      return [
        ["Opens", types(documentTypes)],
        [
          "Allowed types",
          allowedDocumentTypes === null ? (
            <Muted>not read from config.ts</Muted>
          ) : (
            types(allowedDocumentTypes, "every type")
          ),
        ],
        [
          "Drag and drop",
          dragAndDrop === null ? (
            <Muted>not read from config.ts</Muted>
          ) : dragAndDrop ? (
            "on"
          ) : (
            "off"
          ),
        ],
      ];
    }
    case "subgraph": {
      const { name, schema, queries, mutations } = entry.module;
      const count = (list: readonly string[]) =>
        schema ? (
          <span className="tabular-nums">{list.length}</span>
        ) : (
          <Muted>known when the module runs</Muted>
        );
      return [
        ["Endpoint", <Mono key="endpoint">{endpointOf(name)}</Mono>],
        ["Queries", count(queries)],
        ["Mutations", count(mutations)],
      ];
    }
    case "processor": {
      const { type, apps, documentTypes } = entry.module;
      return [
        [
          "Type",
          <span key="type" data-testid="ph-processor-type">
            {type ? PROCESSOR_TYPE[type] : <Muted>not stated in code</Muted>}
          </span>,
        ],
        [
          "Runs in",
          apps.length === 0 ? (
            <Muted>nowhere</Muted>
          ) : (
            apps.map((app) => APP[app]).join(" · ")
          ),
        ],
        ["Document types", types(documentTypes)],
      ];
    }
  }
}

function facts(entry: PageModule, snapshot: ProjectSnapshot): Fact[] {
  return [
    ...(entry.id !== entry.name
      ? [
          [
            "ID",
            <span key="id" className="flex items-center gap-1">
              <Mono className="min-w-0 break-all">{entry.id}</Mono>
              <CopyButton text={entry.id} />
            </span>,
          ] as Fact,
        ]
      : []),
    ...kindFacts(entry, snapshot),
    ["Folder", <Mono key="folder">{entry.module.folder}/</Mono>],
  ];
}

function Problem({ row }: { row: CheckRow }) {
  return (
    <div
      data-testid="ph-module-problem"
      data-check={row.id}
      data-tone={row.tone}
      className={cn(
        "rounded-md border px-3 py-2 text-[13px]",
        row.tone === "error"
          ? "border-destructive/30 bg-destructive/[0.06]"
          : "border-warning/30 bg-warning/[0.08]",
      )}
    >
      <p className="flex items-center gap-2 font-medium">
        <StatusDot tone={row.tone} className="size-1.5" />
        <span className="min-w-0 break-words">{row.label}</span>
      </p>
      {row.detail && (
        <p className="mt-0.5 pl-3.5 text-[12px] break-words text-muted-foreground">
          <Prose text={row.detail} />
        </p>
      )}
    </div>
  );
}

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
        <Problem key={row.id} row={row} />
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
      <div data-testid="ph-module-facts" className="mt-3">
        <Facts rows={facts(entry, snapshot)} />
      </div>
    </>
  );
}

function Schema({ subgraph }: { subgraph: ProjectSubgraph }) {
  const { schema, queries, mutations, folder } = subgraph;
  if (!schema) {
    return (
      <p
        data-testid="ph-subgraph-schema"
        className="text-[13px] text-muted-foreground"
      >
        Its schema is built when the module runs.
      </p>
    );
  }
  const operations = [
    ...queries.map((signature) => ({ type: "query", signature }) as const),
    ...mutations.map((signature) => ({ type: "mutation", signature }) as const),
  ];
  return (
    <div data-testid="ph-subgraph-schema">
      {operations.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          No queries or mutations.
        </p>
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
      <SubHead
        actions={
          <FileLink file={schema.file} className="text-muted-foreground">
            {belowFolder(schema.file, folder)}
          </FileLink>
        }
      >
        SDL
      </SubHead>
      <Code lang="graphql">{schema.source}</Code>
    </div>
  );
}

function CountMark({ children, tone }: { children: ReactNode; tone?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "text-[11px] tabular-nums",
        tone ?? "text-muted-foreground",
      )}
    >
      {children}
    </span>
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

  const tabs: TabItem<ModuleTab>[] = [
    { id: "overview", label: "Overview" },
    ...(entry.kind === "subgraph"
      ? [{ id: "schema", label: "Schema" } as const]
      : []),
    {
      id: "files",
      label: "Files",
      ...(files && {
        aside: <CountMark>{files.length}</CountMark>,
        ariaLabel: `Files, ${files.length}`,
      }),
    },
    {
      id: "checks",
      label: "Checks",
      aside:
        problems.length > 0 ? (
          <CountMark
            tone={
              MARK_TEXT[
                problems.some((row) => row.tone === "error") ? "error" : "warn"
              ]
            }
          >
            {problems.length}
          </CountMark>
        ) : (
          <CountMark>✓</CountMark>
        ),
      ariaLabel:
        problems.length > 0
          ? `Checks, ${plural(problems.length, "problem")}`
          : "Checks, no problems",
    },
  ];
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
      <DetailHeader title={title} actions={actions} />
      <Tabs
        label={`${entry.name}: what to show`}
        tabs={tabs}
        selected={shown}
        onSelect={onTab}
        tabTestId="ph-module-tab"
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

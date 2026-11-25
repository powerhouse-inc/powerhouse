import type { ProjectApp, ProjectSnapshot } from "../../api.js";
import { CopyButton } from "../../components/copy-button.js";
import type { Description } from "../../components/description-list.js";
import { LINK_CLASS, Mono, Muted } from "../../components/text.js";
import { cn } from "../../lib/cn.js";
import { moduleTarget } from "../../project/focus.js";
import { findDocumentModel } from "../../project/kinds.js";
import { useShell } from "../../shell/state.js";
import {
  APP,
  endpointOf,
  PROCESSOR_TYPE,
  type PageModule,
} from "./page-module.js";

/** Document types, each linked to the project's model when it has one. */
function DocumentTypes({
  types,
  snapshot,
  none = "none",
}: {
  types: readonly string[];
  snapshot: ProjectSnapshot;
  none?: string;
}) {
  const { navigate } = useShell();
  if (types.length === 0) return <Muted>{none}</Muted>;
  return (
    <span className="flex flex-col gap-0.5">
      {types.map((type) => {
        const model = findDocumentModel(snapshot, type);
        if (!model) return <Mono key={type}>{type}</Mono>;
        return (
          <button
            key={type}
            type="button"
            data-testid="ph-document-type-link"
            data-document-type={type}
            title={`Show ${model.name} in Document models`}
            onClick={() => navigate(moduleTarget("document-model", type))}
            className="group/type inline-flex min-w-0 cursor-pointer flex-wrap items-baseline gap-x-1.5 text-left"
          >
            <Mono className="underline decoration-foreground/25 underline-offset-[3px] group-hover/type:decoration-foreground">
              {type}
            </Mono>
            <span className="text-[12px] text-muted-foreground">
              → {model.name}
            </span>
          </button>
        );
      })}
    </span>
  );
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
          className={cn(LINK_CLASS, "text-left")}
        >
          {app.name}
        </button>
      ))}
    </span>
  );
}

function kindFacts(
  entry: PageModule,
  snapshot: ProjectSnapshot,
): Description[] {
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
          ? [["Drive apps", <AppLinks key="apps" apps={apps} />] as const]
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

/** What a module's code says about it, as rows of a description list. */
export function moduleFacts(
  entry: PageModule,
  snapshot: ProjectSnapshot,
): Description[] {
  return [
    ...(entry.id !== entry.name
      ? [
          [
            "ID",
            <span key="id" className="flex items-center gap-1">
              <Mono className="min-w-0 break-all">{entry.id}</Mono>
              <CopyButton text={entry.id} />
            </span>,
          ] as const,
        ]
      : []),
    ...kindFacts(entry, snapshot),
    ["Folder", <Mono key="folder">{entry.module.folder}/</Mono>],
  ];
}

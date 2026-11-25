import { Laptop } from "lucide-react";
import { useId, useState } from "react";
import type {
  ProjectDocumentModelDetail,
  ProjectDocumentModelVersion,
} from "../../api.js";
import { Code } from "../../components/code.js";
import { EmptyState } from "../../components/empty-state.js";
import { Section, Subsection } from "../../components/section.js";
import { Segmented } from "../../components/segmented.js";
import { tabPanelProps } from "../../components/tabs.js";
import { EmptyText } from "../../components/text.js";
import { useScrollIntoView } from "../../hooks/use-scroll-into-view.js";
import { cn } from "../../lib/cn.js";
import { formatJson } from "../../lib/format-json.js";
import {
  SchemaDiagramView,
  SchemaViewSwitch,
  useSchemaView,
} from "./schema/schema-view.js";

type Scope = "global" | "local";

/** The part of a model's page a link names for a state scope. It goes in
 * the URL. */
const stateItem = (scope: Scope) => `state:${scope}`;

const SCOPES = [
  {
    id: "global",
    label: "Global",
    data: { "data-testid": "ph-state-tab", "data-scope": "global" },
  },
  {
    id: "local",
    label: "Local",
    data: { "data-testid": "ph-state-tab", "data-scope": "local" },
  },
] as const;

/** A version's state: global or local, each with its schema and the value a
 * new document starts from. */
export function StateSection({
  model,
  version,
  item,
  onSelect,
}: {
  model: ProjectDocumentModelDetail;
  version: ProjectDocumentModelVersion;
  item: string | undefined;
  onSelect: (item: string) => void;
}) {
  const [view, setView] = useSchemaView();
  const linked: Scope | undefined =
    item === stateItem("local")
      ? "local"
      : item === stateItem("global")
        ? "global"
        : undefined;
  const [scope, setScope] = useState<Scope>(linked ?? "global");
  const [followed, setFollowed] = useState(linked);
  if (followed !== linked) {
    setFollowed(linked);
    if (linked) setScope(linked);
  }
  const section = useScrollIntoView<HTMLElement>(linked !== undefined);
  const { global, local } = version.state;
  const state = scope === "local" ? local : global;
  const choose = (next: Scope) => {
    setScope(next);
    onSelect(stateItem(next));
  };
  const diagram = view === "diagram" && Boolean(state?.schema);
  const panelId = useId();
  const panel = tabPanelProps(panelId, scope);
  return (
    <Section
      ref={section}
      data-testid="ph-model-state"
      data-scope={scope}
      title="State"
      actions={
        state?.schema ? (
          <SchemaViewSwitch value={view} onChange={setView} />
        ) : undefined
      }
      tabs={
        <Segmented
          mode={{ kind: "tabs", panelId }}
          label="State scope"
          items={SCOPES}
          value={scope}
          onChange={choose}
        />
      }
    >
      {state ? (
        <div
          {...panel}
          className={cn(
            "grid gap-x-6 gap-y-4",
            !diagram && "@3xl/main:grid-cols-2",
          )}
        >
          <Subsection title="Schema">
            {diagram ? (
              <SchemaDiagramView
                schema={state.schema}
                label={`${model.name} ${scope} state`}
                onShowSdl={() => setView("sdl")}
              />
            ) : (
              <div data-testid="ph-state-schema">
                {state.schema ? (
                  <Code lang="graphql">{state.schema}</Code>
                ) : (
                  <EmptyText>No schema.</EmptyText>
                )}
              </div>
            )}
          </Subsection>
          <Subsection title="Initial state">
            <div data-testid="ph-state-initial">
              {state.initialValue ? (
                <Code lang="json">{formatJson(state.initialValue)}</Code>
              ) : (
                <EmptyText>None.</EmptyText>
              )}
            </div>
          </Subsection>
        </div>
      ) : (
        <div {...panel}>
          <EmptyState
            data-testid="ph-state-none"
            icon={Laptop}
            compact
            className="max-w-none rounded-lg border border-dashed"
            title="No local state"
          >
            Add a local state schema to the specification and it will be
            displayed here.
          </EmptyState>
        </div>
      )}
    </Section>
  );
}

import { Braces, Network } from "lucide-react";
import { Component, lazy, Suspense, type ReactNode } from "react";
import { Segmented } from "../../../components/segmented.js";
import { stored, useStored } from "../../../lib/stored.js";
import { DiagramUnavailable } from "./schema-diagram-unavailable.js";

export type SchemaView = "sdl" | "diagram";

const VIEW = stored<SchemaView>({
  key: "schema-view",
  scope: "preference",
  fallback: "sdl",
  parse: (json) => (json === "sdl" || json === "diagram" ? json : undefined),
});

export const useSchemaView = () => useStored(VIEW);

const VIEWS = [
  {
    id: "sdl",
    label: "SDL",
    icon: Braces,
    tooltip: "Show SDL",
    data: { "data-view": "sdl" },
  },
  {
    id: "diagram",
    label: "Diagram",
    icon: Network,
    tooltip: "Show Diagram",
    data: { "data-view": "diagram" },
  },
] as const;

export function SchemaViewSwitch({
  value,
  onChange,
}: {
  value: SchemaView;
  onChange: (view: SchemaView) => void;
}) {
  return (
    <Segmented
      mode={{ kind: "toggle" }}
      label="Schema view"
      data-testid="ph-schema-view"
      items={VIEWS}
      value={value}
      onChange={onChange}
    />
  );
}

const SchemaDiagram = lazy(() =>
  import("./schema-diagram.js").then(({ SchemaDiagram }) => ({
    default: SchemaDiagram,
  })),
);

/** Keeps a failure of the diagram to the diagram: its code not loading, or
 * its layout throwing, leaves the rest of DevTools and the SDL view. */
class DiagramBoundary extends Component<
  { onShowSdl: () => void; children: ReactNode },
  { error: string | null }
> {
  override state = { error: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  override componentDidCatch(error: unknown) {
    console.error(
      "[devtools] The schema diagram stopped after an error.",
      error,
    );
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    return (
      <DiagramUnavailable
        title="Diagram unavailable"
        detail="The diagram stopped after an error. The SDL view still shows the schema."
        reason={this.state.error}
        onShowSdl={this.props.onShowSdl}
      />
    );
  }
}

export function SchemaDiagramView(props: {
  schema: string;
  label: string;
  onShowSdl: () => void;
}) {
  return (
    <DiagramBoundary key={props.schema} onShowSdl={props.onShowSdl}>
      <Suspense
        fallback={
          <div
            role="status"
            aria-label="Preparing the diagram"
            className="h-[28rem] animate-pulse rounded-md border bg-foreground/[0.035]"
          />
        }
      >
        <SchemaDiagram {...props} />
      </Suspense>
    </DiagramBoundary>
  );
}

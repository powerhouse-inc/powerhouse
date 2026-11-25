import { Braces, Network } from "lucide-react";
import { Component, lazy, Suspense, type ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import { stored, useStored } from "../../lib/stored.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.js";
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
  { id: "sdl", label: "SDL", Icon: Braces },
  { id: "diagram", label: "Diagram", Icon: Network },
] as const;

export function SchemaViewSwitch({
  value,
  onChange,
}: {
  value: SchemaView;
  onChange: (view: SchemaView) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Schema view"
      data-testid="ph-schema-view"
      className="flex rounded-md bg-foreground/[0.06] p-0.5"
    >
      {VIEWS.map(({ id, label, Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Show ${label}`}
                aria-pressed={value === id}
                data-view={id}
                onClick={() => onChange(id)}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1 rounded-[5px] px-2 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                  value === id && "bg-background text-foreground shadow-xs",
                )}
              />
            }
          >
            <Icon aria-hidden className="size-3" />
            <span className="hidden @[25rem]/main:inline">{label}</span>
          </TooltipTrigger>
          <TooltipContent side="top">Show {label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
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

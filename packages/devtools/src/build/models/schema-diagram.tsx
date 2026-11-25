import {
  Background,
  BackgroundVariant,
  getNodesBounds,
  getViewportForBounds,
  Handle,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { cn } from "../../lib/cn.js";
import { plural } from "../../lib/plural.js";
import { DevtoolsPortalProvider, useDevtoolsPortal } from "../../ui/portal.js";
import { DiagramUnavailable } from "./schema-diagram-unavailable.js";
import { Controls, Finder } from "./schema-diagram-controls.js";
import {
  SCHEMA_GRAPH_LIMITS,
  schemaGraph,
  type SchemaGraph,
} from "./schema-graph.js";
import {
  FIT,
  HEAD,
  KIND_LABEL,
  laidOut,
  ROW,
  styled,
  WIDTH,
  type DeclarationNode,
} from "./schema-layout.js";

const MIN_READABLE_ZOOM = 0.72;
const FINDER_CLEARANCE = 60;
const CONTROLS_CLEARANCE = 48;

type Interaction = {
  lit: ReadonlySet<string> | null;
  selected: string | null;
  goTo: (name: string) => void;
  toggleExpanded: (name: string) => void;
};

const InteractionContext = createContext<Interaction>({
  lit: null,
  selected: null,
  goTo: () => undefined,
  toggleExpanded: () => undefined,
});

const handleClass = "size-2 border-card bg-primary";

function FieldType({
  label,
  type,
  declaration,
}: {
  label: string;
  type: string;
  declaration: string | null;
}) {
  const { goTo } = useContext(InteractionContext);
  if (!declaration) {
    return (
      <span
        title={type}
        className="max-w-[52%] shrink-0 truncate text-muted-foreground"
      >
        {type}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="ph-diagram-ref"
      aria-label={`${label}: ${type}, go to ${declaration}`}
      title={`Go to ${declaration}`}
      onClick={(event) => {
        event.stopPropagation();
        goTo(declaration);
      }}
      className="nodrag nopan max-w-[52%] shrink-0 cursor-pointer truncate text-chart-2 underline decoration-chart-2/35 underline-offset-2 outline-none hover:decoration-current focus-visible:ring-2 focus-visible:ring-ring"
    >
      {type}
    </button>
  );
}

function DeclarationCard({ id, data }: NodeProps<DeclarationNode>) {
  const { lit, selected, toggleExpanded } = useContext(InteractionContext);
  const { declaration, rows, hidden, expandable, expanded } = data;
  return (
    <div
      data-testid="ph-diagram-node"
      data-declaration={declaration.name}
      className={cn(
        "w-[17rem] rounded-lg border bg-card text-card-foreground shadow-xs group-focus-visible/node:ring-2 group-focus-visible/node:ring-ring",
        lit && !lit.has(id) && selected !== id && "opacity-30",
        selected === id && "ring-2 ring-primary",
      )}
    >
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        style={{ top: HEAD / 2 }}
        className={handleClass}
      />
      <div className="flex h-[2.625rem] min-w-0 items-center gap-2 rounded-t-lg border-b bg-muted/45 px-3">
        <span
          title={declaration.name}
          className="min-w-0 flex-1 truncate font-mono text-[12px] font-semibold"
        >
          {declaration.name}
        </span>
        <span className="shrink-0 rounded-sm border bg-background/70 px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {KIND_LABEL[declaration.kind]}
        </span>
        {data.hasHeadHandle && (
          <Handle
            type="source"
            id="head"
            position={Position.Right}
            style={{ top: HEAD / 2 }}
            className={handleClass}
          />
        )}
      </div>
      {rows.length === 0 ? (
        <div className="flex h-[2.125rem] items-center px-3 text-[11px] text-muted-foreground">
          {declaration.kind === "scalar" ? "Custom scalar" : "No members"}
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {rows.map(({ member, index, linked }) => (
            <div
              key={index}
              className="relative flex h-[1.6875rem] min-w-0 items-center gap-3 px-3 font-mono text-[11px]"
            >
              <span title={member.label} className="min-w-0 flex-1 truncate">
                {member.label}
              </span>
              {member.kind === "field" && (
                <FieldType
                  label={member.label}
                  type={member.type}
                  declaration={member.typeDeclaration}
                />
              )}
              {linked && (
                <Handle
                  type="source"
                  id={`m${index}`}
                  position={Position.Right}
                  className="size-[7px] border-card bg-primary"
                />
              )}
            </div>
          ))}
          {expandable && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={
                expanded
                  ? `Show fewer members of ${declaration.name}`
                  : `Show ${hidden} more members of ${declaration.name}`
              }
              onClick={(event) => {
                event.stopPropagation();
                toggleExpanded(declaration.name);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              className="nodrag nopan relative flex h-[1.8125rem] w-full cursor-pointer items-center justify-between rounded-b-lg bg-muted/25 px-3 text-[11px] text-muted-foreground outline-none hover:bg-muted/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span>{expanded ? "Show less" : `+${hidden} more`}</span>
              {expanded ? (
                <ChevronUp aria-hidden className="size-3" />
              ) : (
                <ChevronDown aria-hidden className="size-3" />
              )}
              {data.hasMoreHandle && (
                <Handle
                  type="source"
                  id="more"
                  position={Position.Right}
                  className="size-[7px] border-card bg-primary"
                />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const NODE_TYPES = { declaration: DeclarationCard };

const FLOW_THEME = {
  "--xy-background-color": "transparent",
  "--xy-background-pattern-color":
    "color-mix(in oklab, var(--foreground) 16%, transparent)",
  "--xy-edge-stroke": "var(--muted-foreground)",
} as CSSProperties;

/** Whether `ref`'s element is the one the browser shows full screen. In a
 * shadow root, `document.fullscreenElement` names the host, so this asks the
 * element's own root. */
function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const owner = element.getRootNode() as Document | ShadowRoot;
    const update = () => setFull(owner.fullscreenElement === element);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);
  return full;
}

function Canvas({ graph, label }: { graph: SchemaGraph; label: string }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<DeclarationNode, Edge>();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const full = useFullscreen(regionRef);
  const before = useRef<Viewport | null>(null);
  const pagePortal = useDevtoolsPortal();
  const [fullPortal, setFullPortal] = useState<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    if (full) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    before.current = flow.getViewport();
    void regionRef.current?.requestFullscreen().catch(() => {
      before.current = null;
    });
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (full) void flow.fitView({ ...FIT, duration: 200 });
      else if (before.current) void flow.setViewport(before.current);
      if (!full) before.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [flow, full]);

  const laid = useMemo(() => laidOut(graph, expanded), [graph, expanded]);
  const focus = exporting ? null : (hovered ?? selected);
  const edges = useMemo(() => styled(laid.edges, focus), [laid.edges, focus]);

  const toggleExpanded = useCallback((name: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }, []);

  const [target, setTarget] = useState<{
    name: string;
    member: number | undefined;
  } | null>(null);
  const goTo = useCallback((name: string, member?: number) => {
    setHovered(null);
    setSelected(name);
    if (member !== undefined && member >= SCHEMA_GRAPH_LIMITS.membersShown) {
      setExpanded((current) => new Set(current).add(name));
    }
    setTarget({ name, member });
  }, []);
  // After the layout a pick may have changed: an opened declaration moves.
  useEffect(() => {
    if (!target) return;
    setTarget(null);
    const node = laid.nodes.find((candidate) => candidate.id === target.name);
    const root = rootRef.current;
    if (!node || !root) return;
    const zoom = Math.max(flow.getZoom(), MIN_READABLE_ZOOM);
    const y =
      target.member === undefined
        ? node.position.y +
          Math.min(node.height ?? HEAD, root.clientHeight / zoom - 48) / 2
        : node.position.y + HEAD + target.member * ROW + ROW / 2;
    void flow.setCenter(node.position.x + WIDTH / 2, y, {
      zoom,
      duration: 250,
    });
  }, [flow, laid.nodes, target]);

  const start = useCallback(
    (instance: ReactFlowInstance<DeclarationNode, Edge>) => {
      const root = rootRef.current;
      if (!root) return;
      const width = root.clientWidth;
      const height = root.clientHeight;
      const bounds = getNodesBounds(laid.nodes);
      const fit = getViewportForBounds(
        bounds,
        width,
        height,
        0.08,
        FIT.maxZoom,
        FIT.padding,
      );
      if (fit.zoom >= MIN_READABLE_ZOOM) {
        void instance.setViewport(fit);
        return;
      }
      const node = laid.root;
      const zoom = MIN_READABLE_ZOOM;
      const room = height - FINDER_CLEARANCE - CONTROLS_CLEARANCE;
      const tall = (node.height ?? HEAD) * zoom;
      const top = FINDER_CLEARANCE + Math.max(0, (room - tall) / 2);
      void instance.setViewport({
        x: 40 - node.position.x * zoom,
        y: top - node.position.y * zoom,
        zoom,
      });
    },
    [laid],
  );

  const interaction = useMemo<Interaction>(
    () => ({
      lit: focus ? (laid.neighbourhood.get(focus) ?? null) : null,
      selected: exporting ? null : selected,
      goTo,
      toggleExpanded,
    }),
    [exporting, focus, goTo, laid.neighbourhood, selected, toggleExpanded],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (event.key === "Escape" && selected && !target.closest("input")) {
      setSelected(null);
      return;
    }
    const node = target.classList.contains("react-flow__node")
      ? target.dataset.id
      : undefined;
    if (node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      setSelected((current) => (current === node ? null : node));
    }
  };

  const types =
    graph.omittedDeclarations > 0
      ? `${laid.nodes.length} of ${plural(laid.nodes.length + graph.omittedDeclarations, "type")}`
      : plural(laid.nodes.length, "type");

  return (
    <InteractionContext.Provider value={interaction}>
      <DevtoolsPortalProvider container={full ? fullPortal : pagePortal}>
        <div
          ref={regionRef}
          data-testid="ph-schema-diagram"
          data-fullscreen={full}
          role="region"
          aria-label={`${label} diagram`}
          className={cn(
            "@container min-w-0 overflow-hidden",
            full ? "bg-background" : "rounded-md border",
          )}
          onKeyDown={onKeyDown}
        >
          <div
            ref={rootRef}
            className={cn(
              "w-full bg-[color-mix(in_oklab,var(--foreground)_2.5%,var(--background))]",
              full ? "h-full" : "h-[28rem]",
            )}
          >
            <ReactFlow<DeclarationNode, Edge>
              nodes={laid.nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              onInit={start}
              minZoom={0.08}
              maxZoom={2}
              nodesConnectable={false}
              nodesDraggable={false}
              edgesReconnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              zoomOnDoubleClick={false}
              panOnScroll={false}
              preventScrolling={false}
              onlyRenderVisibleElements={!exporting}
              onNodeClick={(_, node) =>
                setSelected((current) => (current === node.id ? null : node.id))
              }
              onNodeDoubleClick={(_, node) => {
                if (node.data.expandable) toggleExpanded(node.id);
              }}
              onNodeMouseEnter={(_, node) => setHovered(node.id)}
              onNodeMouseLeave={() => setHovered(null)}
              onPaneClick={() => setSelected(null)}
              proOptions={{ hideAttribution: true }}
              style={FLOW_THEME}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
              <Panel position="top-left" className="m-2!">
                <Finder graph={graph} onPick={goTo} />
              </Panel>
              <Panel position="top-right" className="m-2! hidden @md:block">
                <span
                  data-testid="ph-diagram-count"
                  className="pointer-events-none block rounded-md border bg-popover/90 px-2 py-1 font-mono text-[10.5px] text-muted-foreground shadow-xs"
                >
                  {types} · {plural(graph.linkedPairs, "relation")}
                  {graph.omittedLinks > 0 &&
                    ` · ${plural(graph.omittedLinks, "link")} left out`}
                </span>
              </Panel>
              <Controls
                rootRef={rootRef}
                nodes={laid.nodes}
                label={label}
                onExporting={setExporting}
                full={full}
                onFullscreen={
                  document.fullscreenEnabled ? toggleFullscreen : undefined
                }
              />
            </ReactFlow>
          </div>
          {full && (
            <div
              ref={setFullPortal}
              className="pointer-events-none fixed inset-0 z-60 *:pointer-events-auto"
            />
          )}
        </div>
      </DevtoolsPortalProvider>
    </InteractionContext.Provider>
  );
}

export function SchemaDiagram({
  schema,
  label,
  onShowSdl,
}: {
  schema: string;
  label: string;
  onShowSdl: () => void;
}) {
  const result = useMemo(() => schemaGraph(schema), [schema]);
  if (!result.ok) {
    return (
      <DiagramUnavailable
        title="Diagram unavailable"
        detail={
          result.reason === "invalid"
            ? "The schema does not parse. The SDL view shows it as written."
            : "The schema is too large to draw."
        }
        reason={result.message}
        onShowSdl={onShowSdl}
      />
    );
  }
  if (result.graph.declarations.length === 0) {
    return (
      <DiagramUnavailable
        title="Nothing to draw"
        detail="The schema declares no type, input, interface, enum, union or scalar."
        onShowSdl={onShowSdl}
      />
    );
  }
  return (
    <ReactFlowProvider>
      <Canvas graph={result.graph} label={label} />
    </ReactFlowProvider>
  );
}

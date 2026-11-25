import { Info, Laptop } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.js";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type {
  ProjectDocumentModelDetail,
  ProjectDocumentModelVersion,
  ProjectOperation,
} from "../../api.js";
import { Code, EmptyState, Mono, Section, Tag } from "../../kit.js";
import { cn } from "../../lib/cn.js";
import { plural } from "../../lib/plural.js";
import { Row, Rows } from "../ui.js";
import {
  SchemaDiagramView,
  SchemaViewSwitch,
  useSchemaView,
} from "./schema-view.js";

type Scope = "global" | "local";

/** The parts of a model's page a link can name. They go in the URL. */
export const stateItem = (scope: Scope) => `state:${scope}`;
export const operationItem = (name: string) => `op:${name}`;

/** The value a new document reads from JSON text, two spaces per level.
 * Text that is not JSON stays as written. */
function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function None({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-muted-foreground">{children}</p>;
}

function Label({
  children,
  aside,
}: {
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-1 flex min-h-5 items-center gap-2 text-[12px] text-muted-foreground">
      <span>{children}</span>
      {aside && <span className="ml-auto flex min-w-0">{aside}</span>}
    </div>
  );
}

/** Brings the part a link names into view, once per time it is named. */
function useShowWhenLinked<T extends HTMLElement>(linked: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (linked) ref.current?.scrollIntoView({ block: "nearest" });
  }, [linked]);
  return ref;
}

function StateTab({
  scope,
  selected,
  onSelect,
}: {
  scope: Scope;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      data-testid="ph-state-tab"
      data-scope={scope}
      onClick={onSelect}
      className={cn(
        "h-6 cursor-pointer rounded-[5px] px-2.5 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        selected && "bg-background text-foreground shadow-xs",
      )}
    >
      {scope === "global" ? "Global" : "Local"}
    </button>
  );
}

function StateSection({
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
  const section = useShowWhenLinked<HTMLDivElement>(linked !== undefined);

  const { global, local } = version.state;
  const state = scope === "local" ? local : global;
  const choose = (next: Scope) => {
    setScope(next);
    onSelect(stateItem(next));
  };
  const diagram = view === "diagram" && Boolean(state?.schema);
  return (
    <div ref={section}>
      <Section
        data-testid="ph-model-state"
        data-scope={scope}
        title="State"
        aside={
          state?.schema ? (
            <SchemaViewSwitch value={view} onChange={setView} />
          ) : undefined
        }
        tabs={
          <div
            role="tablist"
            aria-label="State scope"
            className="flex rounded-md bg-foreground/[0.06] p-0.5"
          >
            <StateTab
              scope="global"
              selected={scope === "global"}
              onSelect={() => choose("global")}
            />
            <StateTab
              scope="local"
              selected={scope === "local"}
              onSelect={() => choose("local")}
            />
          </div>
        }
      >
        {state ? (
          <div
            role="tabpanel"
            className={cn(
              "grid gap-x-6 gap-y-3",
              !diagram && "@3xl/main:grid-cols-2",
            )}
          >
            <div className="min-w-0">
              <Label>Schema</Label>
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
                    <None>No schema.</None>
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <Label>Initial state</Label>
              <div data-testid="ph-state-initial">
                {state.initialValue ? (
                  <Code lang="json">{formatJson(state.initialValue)}</Code>
                ) : (
                  <None>None.</None>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div role="tabpanel">
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
    </div>
  );
}

/** Below this width the modules stack every operation in full; at or above
 * it, a list of operations sits beside the one chosen. */
const LIST_MIN_WIDTH = 560;

/** The element's width, once it has been laid out. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number>();
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

type Module = ProjectDocumentModelVersion["modules"][number];

function Heading({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  );
}

/** Everything the specification says about one operation. */
function OperationDetail({
  operation,
  className,
}: {
  operation: ProjectOperation;
  className?: string;
}) {
  return (
    <article
      data-testid="ph-operation"
      data-operation={operation.name}
      className={cn("min-w-0", className)}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="min-w-0 font-mono text-[14px] font-semibold break-all">
          {operation.name}
        </h4>
        <Tag data-testid="ph-operation-scope">{operation.scope}</Tag>
      </header>
      {operation.description && (
        <p className="mt-1 text-[13px] text-pretty text-muted-foreground">
          {operation.description}
        </p>
      )}
      <div className="mt-4">
        <Heading>Input</Heading>
        <div data-testid="ph-operation-input">
          {operation.schema ? (
            <Code lang="graphql">{operation.schema}</Code>
          ) : (
            <None>Takes no input.</None>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <div className="min-w-0">
          <Heading>Errors · {operation.errors.length}</Heading>
          <div data-testid="ph-operation-errors">
            {operation.errors.length === 0 ? (
              <None>None declared.</None>
            ) : (
              <ul className="space-y-1.5 text-[13px]">
                {operation.errors.map((error) => (
                  <li key={error.name}>
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <Mono className="font-medium break-all">
                        {error.name}
                      </Mono>
                      <Mono className="break-all text-muted-foreground">
                        {error.code}
                      </Mono>
                    </span>
                    {error.description && (
                      <span className="block text-[12px] text-muted-foreground">
                        {error.description}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <Heading>Examples · {operation.examples.length}</Heading>
          <div data-testid="ph-operation-examples" className="space-y-2">
            {operation.examples.length === 0 ? (
              <None>None.</None>
            ) : (
              operation.examples.map((example, index) => (
                <Code key={index} lang="json">
                  {formatJson(example)}
                </Code>
              ))
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** The module's description, behind an icon beside its name. Nothing when
 * the module has none. */
function ModuleInfo({ module }: { module: Module }) {
  if (!module.description) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-testid="ph-module-info"
            aria-label={`${module.name}: ${module.description}`}
            className="inline-grid size-4 shrink-0 cursor-help place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <Info aria-hidden className="size-3" />
          </button>
        }
      />
      <TooltipContent side="right" className="max-w-64">
        {module.description}
      </TooltipContent>
    </Tooltip>
  );
}

function OperationLink({
  operation,
  selected,
  linked,
  onSelect,
}: {
  operation: ProjectOperation;
  selected: boolean;
  linked: boolean;
  onSelect: () => void;
}) {
  const row = useShowWhenLinked<HTMLDivElement>(linked);
  return (
    <Row
      rowRef={row}
      selected={selected}
      onSelect={onSelect}
      label={operation.name}
      data-testid="ph-operation-link"
      data-operation={operation.name}
      data-selected={String(selected)}
      className="flex min-h-7 gap-x-1.5"
    >
      <Mono
        title={operation.name}
        className="min-w-0 flex-1 truncate text-[11.5px]"
      >
        {operation.name}
      </Mono>
    </Row>
  );
}

/** Every operation listed by module, beside the one chosen. */
function ListLayout({
  modules,
  selected,
  linked,
  onSelect,
}: {
  modules: readonly Module[];
  selected: ProjectOperation;
  linked: boolean;
  onSelect: (name: string) => void;
}) {
  return (
    <div className="grid grid-cols-[12.5rem_minmax(0,1fr)] items-start gap-5">
      <Rows
        label="Operations"
        className="rounded-lg bg-foreground/[0.035] px-1 py-2"
      >
        {modules.map((module) => (
          <div
            key={module.id}
            data-testid="ph-model-module"
            data-module={module.name}
            className="mb-3 last:mb-0"
          >
            <div className="flex items-center gap-1 px-2 pb-1">
              <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {module.name}
              </span>
              <ModuleInfo module={module} />
            </div>
            {module.operations.length === 0 ? (
              <p className="px-2 text-[12px] text-muted-foreground">
                No operations.
              </p>
            ) : (
              module.operations.map((operation) => (
                <OperationLink
                  key={operation.id}
                  operation={operation}
                  selected={operation.id === selected.id}
                  linked={linked && operation.id === selected.id}
                  onSelect={() => onSelect(operation.name)}
                />
              ))
            )}
          </div>
        ))}
      </Rows>
      <OperationDetail operation={selected} />
    </div>
  );
}

function StackedOperation({
  operation,
  linked,
}: {
  operation: ProjectOperation;
  linked: boolean;
}) {
  const card = useShowWhenLinked<HTMLDivElement>(linked);
  return (
    <div ref={card} className="rounded-lg bg-foreground/[0.035] p-3">
      <OperationDetail operation={operation} />
    </div>
  );
}

/** Every operation in full, one after another, under its module. */
function StackLayout({
  modules,
  linkedName,
}: {
  modules: readonly Module[];
  linkedName: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-6">
      {modules.map((module) => (
        <section
          key={module.id}
          data-testid="ph-model-module"
          data-module={module.name}
          aria-label={`Module ${module.name}`}
        >
          <div className="flex items-center gap-2">
            <h4 className="text-[14px] font-semibold">{module.name}</h4>
            <ModuleInfo module={module} />
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {plural(module.operations.length, "operation")}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {module.operations.length === 0 ? (
              <None>No operations.</None>
            ) : (
              module.operations.map((operation) => (
                <StackedOperation
                  key={operation.id}
                  operation={operation}
                  linked={operation.name === linkedName}
                />
              ))
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The version's modules and their operations: a list beside the chosen
 * operation when there is room, every operation stacked when there is not. */
function ModulesSection({
  modules,
  item,
  onSelect,
}: {
  modules: readonly Module[];
  item: string | undefined;
  onSelect: (item: string) => void;
}) {
  const [section, width] = useWidth<HTMLElement>();
  const operations = modules.flatMap((module) => module.operations);
  const linked = operations.find(
    (operation) => item === operationItem(operation.name),
  );
  const selected = linked ?? operations[0];
  const stacked = width !== undefined && width < LIST_MIN_WIDTH;
  return (
    <section
      ref={section}
      data-testid="ph-model-modules"
      data-layout={stacked ? "stack" : "list"}
      aria-label="Modules"
      className="min-w-0"
    >
      <header className="mb-3">
        <h3 className="text-[13px] font-medium">Modules</h3>
      </header>
      {!selected ? (
        <None>This version&apos;s modules declare no operations.</None>
      ) : stacked ? (
        <StackLayout modules={modules} linkedName={linked?.name} />
      ) : (
        <ListLayout
          modules={modules}
          selected={selected}
          linked={linked !== undefined}
          onSelect={(name) => onSelect(operationItem(name))}
        />
      )}
    </section>
  );
}

/** One version of a model, top to bottom: its state, then each module with
 * its operations. */
export function ModelSections({
  model,
  version,
  item,
  onSelect,
}: {
  model: ProjectDocumentModelDetail;
  version: ProjectDocumentModelVersion;
  /** The part the location names, if it names one. */
  item: string | undefined;
  onSelect: (item: string) => void;
}) {
  return (
    <div
      data-testid="ph-model-sections"
      className="flex min-w-0 flex-col gap-6"
    >
      <StateSection
        model={model}
        version={version}
        item={item}
        onSelect={onSelect}
      />
      {version.modules.length === 0 ? (
        <Section data-testid="ph-model-no-modules" title="Modules">
          <None>This version declares no modules, so no operations.</None>
        </Section>
      ) : (
        <ModulesSection
          modules={version.modules}
          item={item}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}

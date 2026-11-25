import { Info } from "lucide-react";
import type {
  ProjectDocumentModelVersion,
  ProjectOperation,
} from "../../api.js";
import { Code } from "../../components/code.js";
import { Row, Rows } from "../../components/rows.js";
import { Section, SectionLabel, Subsection } from "../../components/section.js";
import { Tag } from "../../components/status.js";
import { EmptyText, Mono } from "../../components/text.js";
import { useScrollIntoView } from "../../hooks/use-scroll-into-view.js";
import { useWidth } from "../../hooks/use-width.js";
import { cn } from "../../lib/cn.js";
import { formatJson } from "../../lib/format-json.js";
import { plural } from "../../lib/plural.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.js";

/** The part of a model's page a link names for an operation. It goes in the
 * URL. */
const operationItem = (name: string) => `op:${name}`;

/** Below this width the modules stack every operation in full; at or above
 * it, a list of operations sits beside the one chosen. */
const LIST_MIN_WIDTH = 560;

type Module = ProjectDocumentModelVersion["modules"][number];

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
      <div className="mt-4 flex flex-col gap-4">
        <Subsection title="Input" as="h5">
          <div data-testid="ph-operation-input">
            {operation.schema ? (
              <Code lang="graphql">{operation.schema}</Code>
            ) : (
              <EmptyText>Takes no input.</EmptyText>
            )}
          </div>
        </Subsection>
        <Subsection title={`Errors · ${operation.errors.length}`} as="h5">
          <div data-testid="ph-operation-errors">
            {operation.errors.length === 0 ? (
              <EmptyText>None declared.</EmptyText>
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
        </Subsection>
        <Subsection title={`Examples · ${operation.examples.length}`} as="h5">
          <div data-testid="ph-operation-examples" className="space-y-2">
            {operation.examples.length === 0 ? (
              <EmptyText>None.</EmptyText>
            ) : (
              operation.examples.map((example, index) => (
                <Code key={index} lang="json">
                  {formatJson(example)}
                </Code>
              ))
            )}
          </div>
        </Subsection>
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
  const row = useScrollIntoView<HTMLDivElement>(linked);
  return (
    <Row
      ref={row}
      selected={selected}
      onSelect={onSelect}
      label={operation.name}
      data-testid="ph-operation-link"
      data-operation={operation.name}
      data-selected={String(selected)}
      className="flex min-h-7 gap-x-1.5"
    >
      <Mono title={operation.name} className="min-w-0 flex-1 truncate">
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
            <SectionLabel as="div" className="gap-1 px-2 pb-1">
              {module.name}
              <ModuleInfo module={module} />
            </SectionLabel>
            {module.operations.length === 0 ? (
              <EmptyText className="px-2 text-[12px]">No operations.</EmptyText>
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
  const card = useScrollIntoView<HTMLDivElement>(linked);
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
          <SectionLabel
            actions={
              <span className="tabular-nums">
                {plural(module.operations.length, "operation")}
              </span>
            }
          >
            {module.name}
            <ModuleInfo module={module} />
          </SectionLabel>
          <div className="mt-1.5 flex flex-col gap-2.5">
            {module.operations.length === 0 ? (
              <EmptyText>No operations.</EmptyText>
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
export function ModulesSection({
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
    <Section
      ref={section}
      title="Modules"
      data-testid="ph-model-modules"
      data-layout={stacked ? "stack" : "list"}
    >
      {!selected ? (
        <EmptyText>
          This version&apos;s modules declare no operations.
        </EmptyText>
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
    </Section>
  );
}

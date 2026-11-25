import {
  getNodesBounds,
  Panel,
  useReactFlow,
  useStoreApi,
} from "@xyflow/react";
import {
  Check,
  Copy,
  Download,
  Expand,
  LoaderCircle,
  Minus,
  Plus,
  Scan,
  Search,
  Shrink,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { Mono } from "../../kit.js";
import { plural } from "../../lib/plural.js";
import { Button } from "../../ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu.js";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../../ui/input-group.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip.js";
import {
  copyPng,
  downloadPng,
  pngFilename,
  renderPng,
} from "./schema-diagram-png.js";
import type {
  SchemaDeclaration,
  SchemaGraph,
  SchemaMember,
} from "./schema-graph.js";
import {
  FIT,
  KIND_LABEL,
  matches,
  type DeclarationNode,
  type Found,
} from "./schema-layout.js";

const MEMBER_KIND = { value: "Enum value", member: "Union member" } as const;

const countOf = (declaration: SchemaDeclaration) =>
  declaration.kind === "enum"
    ? plural(declaration.members.length, "value")
    : declaration.kind === "union"
      ? plural(declaration.members.length, "member")
      : plural(declaration.members.length, "field");

type Option = {
  id: string;
  group: "Types" | "Fields";
  declaration: SchemaDeclaration;
  member?: SchemaMember;
};

function optionsOf(found: Found): Option[] {
  return [
    ...found.declarations.map((declaration): Option => ({
      id: `type:${declaration.name}`,
      group: "Types",
      declaration,
    })),
    ...found.members.map(({ declaration, member }): Option => ({
      id: `member:${declaration.name}.${member.label}`,
      group: "Fields",
      declaration,
      member,
    })),
  ];
}

function OptionText({ option }: { option: Option }) {
  const { declaration, member } = option;
  if (!member) {
    return (
      <span className="flex min-w-0 flex-col">
        <Mono className="font-medium break-all">{declaration.name}</Mono>
        <span className="text-[11px] text-muted-foreground">
          {KIND_LABEL[declaration.kind]} · {countOf(declaration)}
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col">
      <Mono className="break-all">
        <span className="text-muted-foreground">{declaration.name}.</span>
        <span className="font-medium">{member.label}</span>
      </Mono>
      <Mono className="text-[11px] break-all text-muted-foreground">
        {member.kind === "field" ? member.type : MEMBER_KIND[member.kind]}
      </Mono>
    </span>
  );
}

/** One search field: focusing it lists every type, typing narrows the list
 * to the types and fields whose name holds the text. */
export function Finder({
  graph,
  onPick,
}: {
  graph: SchemaGraph;
  /** `member` is the index of the field picked, if one was. */
  onPick: (name: string, member?: number) => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = useMemo(
    () => optionsOf(matches(graph, query)),
    [graph, query],
  );
  const optionId = (index: number) => `${id}-option-${index}`;

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[id="${id}-option-${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, id, open, options]);

  const close = () => {
    setOpen(false);
    setActive(0);
  };
  const pick = (index: number) => {
    const option = options[index];
    if (!option) return;
    setQuery("");
    close();
    onPick(
      option.declaration.name,
      option.member && option.declaration.members.indexOf(option.member),
    );
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (options.length === 0) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((index) => (index + step + options.length) % options.length);
        return;
      }
      case "Enter":
        if (!open) return;
        event.preventDefault();
        pick(active);
        return;
      case "Escape":
        if (!open && !query) return;
        event.stopPropagation();
        if (open) close();
        else setQuery("");
    }
  };

  const groups = (["Types", "Fields"] as const)
    .map((group) => ({
      group,
      items: options
        .map((option, index) => ({ option, index }))
        .filter(({ option }) => option.group === group),
    }))
    .filter(({ items }) => items.length > 0);

  return (
    <div
      className="nodrag nopan relative w-64 max-w-[calc(100cqw-1rem)]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
    >
      <div className="rounded-lg bg-background shadow-xs">
        <InputGroup className="h-7">
          <InputGroupAddon>
            <Search aria-hidden className="size-3.5" />
          </InputGroupAddon>
          <InputGroupInput
            role="combobox"
            aria-label="Find a type or field"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              open && options.length > 0 ? optionId(active) : undefined
            }
            data-testid="ph-diagram-search"
            placeholder="Find a type or field"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-7 text-xs"
          />
        </InputGroup>
      </div>
      {open && (
        <div
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label="Types and fields"
          // Keeps focus in the field, so picking with the pointer does not
          // close the list before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-full left-0 z-10 mt-1 max-h-72 w-80 max-w-[calc(100cqw-1rem)] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {groups.length === 0 ? (
            <p className="py-4 text-center text-[12px] text-muted-foreground">
              No type or field matches.
            </p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} role="group" aria-labelledby={`${id}-${group}`}>
                <div
                  id={`${id}-${group}`}
                  className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  {group}
                </div>
                {items.map(({ option, index }) => (
                  <div
                    key={option.id}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    data-testid="ph-diagram-match"
                    onMouseMove={() => setActive(index)}
                    onClick={() => pick(index)}
                    className="flex cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-xs select-none aria-selected:bg-muted aria-selected:text-foreground"
                  >
                    <OptionText option={option} />
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={label}
            onClick={onClick}
            className="text-muted-foreground hover:text-foreground"
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** An edge draws only once both of its nodes' handles are measured: wait for
 * every node, at most a second, then a frame for the edges to follow. */
async function measured(store: ReturnType<typeof useStoreApi>) {
  for (let frame = 0; frame < 60; frame++) {
    await nextFrame();
    const nodes = [...store.getState().nodeLookup.values()];
    if (nodes.every((node) => node.internals.handleBounds)) break;
  }
  await nextFrame();
}

export function Controls({
  rootRef,
  nodes,
  label,
  onExporting,
  full,
  onFullscreen,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  nodes: DeclarationNode[];
  label: string;
  onExporting: (exporting: boolean) => void;
  full: boolean;
  /** Undefined where the browser does not allow full screen. */
  onFullscreen: (() => void) | undefined;
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const store = useStoreApi();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!copied && !problem) return;
    const id = window.setTimeout(() => {
      setCopied(false);
      setProblem(null);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [copied, problem]);

  const capture = useCallback(async () => {
    await measured(store);
    const root = rootRef.current;
    const viewport = root?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!root || !viewport) throw new Error("The diagram is not on the page.");
    return renderPng({
      viewport,
      bounds: getNodesBounds(nodes),
      background: getComputedStyle(root).backgroundColor,
    });
  }, [nodes, rootRef, store]);

  const run = (action: "download" | "copy") => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    onExporting(true);
    const done =
      action === "copy"
        ? copyPng(capture).then(() => setCopied(true))
        : downloadPng(capture(), pngFilename(label));
    done
      .catch((error: unknown) =>
        setProblem(
          `Could not ${action} the image: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => {
        setBusy(false);
        onExporting(false);
      });
  };

  const imageLabel = busy
    ? "Making the image"
    : copied
      ? "Image copied"
      : "Diagram image";
  return (
    <Panel
      position="bottom-left"
      className="m-2! flex max-w-[calc(100%-1rem)] items-end gap-2"
    >
      <div className="nodrag nopan flex items-center gap-0.5 rounded-lg border bg-popover/95 p-0.5 shadow-xs">
        <ControlButton
          label="Zoom out"
          onClick={() => void zoomOut({ duration: 150 })}
        >
          <Minus aria-hidden />
        </ControlButton>
        <ControlButton
          label="Zoom in"
          onClick={() => void zoomIn({ duration: 150 })}
        >
          <Plus aria-hidden />
        </ControlButton>
        <ControlButton
          label="Fit diagram"
          onClick={() => void fitView({ ...FIT, duration: 200 })}
        >
          <Scan aria-hidden />
        </ControlButton>
        {onFullscreen && (
          <ControlButton
            label={full ? "Exit full screen" : "Full screen"}
            onClick={onFullscreen}
          >
            {full ? <Shrink aria-hidden /> : <Expand aria-hidden />}
          </ControlButton>
        )}
        <span aria-hidden className="mx-0.5 h-3.5 w-px bg-border" />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={imageLabel}
                      data-testid="ph-diagram-image"
                      disabled={busy}
                      className="text-muted-foreground hover:text-foreground"
                    />
                  }
                />
              }
            >
              {busy ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : copied ? (
                <Check aria-hidden />
              ) : (
                <Download aria-hidden />
              )}
            </TooltipTrigger>
            <TooltipContent side="top">{imageLabel}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="top" align="start" className="w-36">
            <DropdownMenuItem
              className="text-xs"
              onClick={() => run("download")}
            >
              <Download />
              Download PNG
            </DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => run("copy")}>
              <Copy />
              Copy PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {problem && (
        <p
          role="alert"
          className="rounded-md border bg-popover/95 px-2 py-1 text-[11px] text-destructive shadow-xs"
        >
          {problem}
        </p>
      )}
    </Panel>
  );
}

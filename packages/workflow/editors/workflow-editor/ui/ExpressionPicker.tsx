// Docked expression picker: follows the focused config field and inserts
// {{path}} expressions from the run scope (trigger.payload / steps.* / variables.*).
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BlockLogo } from "./BlockSelector.js";
import { EMPTY_SCOPE, type ExpressionScope } from "./expression-scope.js";
import {
  describeExpression,
  splitExpressionTokens,
} from "./expression-tokens.js";

export interface ExpressionScopeSource {
  // Scope for the field being edited; stepId limits steps to its ancestors.
  load: (context: { stepId?: string }) => Promise<ExpressionScope>;
}

let scopeSource: ExpressionScopeSource | undefined;
const scopeListeners = new Set<() => void>();

export function registerExpressionScopeSource(next: ExpressionScopeSource) {
  scopeSource = next;
  for (const listener of scopeListeners) listener();
}

// The field the docked panel inserts into.
export interface ExpressionTarget {
  id: string;
  stepId?: string;
  label: string;
  insert: (expression: string) => void;
}

interface TargetContextValue {
  target: ExpressionTarget | null;
  setTarget: (target: ExpressionTarget | null) => void;
  // Step key → block type, so chips can show the referenced step's logo.
  stepBlockTypes: Record<string, string>;
}

const TargetContext = createContext<TargetContextValue | null>(null);

export function ExpressionTargetProvider(props: {
  stepBlockTypes: Record<string, string>;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<ExpressionTarget | null>(null);
  const value = useMemo(
    () => ({ target, setTarget, stepBlockTypes: props.stepBlockTypes }),
    [target, props.stepBlockTypes],
  );
  return (
    <TargetContext.Provider value={value}>
      {props.children}
    </TargetContext.Provider>
  );
}

export function useExpressionTarget(): TargetContextValue | null {
  return useContext(TargetContext);
}

// Registers a config field as an insertion target; call focus() when the
// user focuses it. `insert` is read through a ref so it never goes stale.
export function useExpressionField(options: {
  stepId?: string;
  label: string;
  insert: (expression: string) => void;
}): { active: boolean; focus: () => void } {
  const id = useId();
  const context = useExpressionTarget();
  const insertRef = useRef(options.insert);
  insertRef.current = options.insert;
  const { stepId, label } = options;
  return {
    active: context?.target?.id === id,
    focus: () => {
      context?.setTarget({
        id,
        stepId,
        label,
        insert: (expression) => insertRef.current(expression),
      });
    },
  };
}

function preview(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (Array.isArray(value)) return `[${value.length}]`;
  if (typeof value === "object") return "{…}";
  const text =
    typeof value === "string"
      ? value
      : ((JSON.stringify(value) as string | undefined) ?? "");
  return text.length > 28 ? `${text.slice(0, 28)}…` : text;
}

function isExpandable(value: unknown): boolean {
  return (
    value !== null && typeof value === "object" && Object.keys(value).length > 0
  );
}

function entriesOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item]);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>);
  }
  return [];
}

function Caption(props: { text?: string }) {
  if (!props.text) return null;
  return (
    <span className="ml-auto shrink-0 pl-2 text-[10px] italic text-slate-400">
      {props.text}
    </span>
  );
}

function ValueNode(props: {
  name: string;
  path: string;
  value: unknown;
  depth: number;
  captions: Record<string, string>;
  onPick: (path: string) => void;
}) {
  const [open, setOpen] = useState(props.depth < 2);
  const expandable = isExpandable(props.value);
  return (
    <div>
      <div
        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-slate-50"
        style={{ paddingLeft: props.depth * 12 + 4 }}
      >
        {expandable ? (
          <button
            type="button"
            className="w-3 shrink-0 text-[10px] text-slate-400"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <button
          type="button"
          className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
          title={`{{${props.path}}}`}
          onClick={() => props.onPick(props.path)}
        >
          <span className="shrink-0 font-mono text-[11px] text-slate-700">
            {props.name}
          </span>
          <span className="truncate text-[10px] text-slate-400">
            {preview(props.value)}
          </span>
        </button>
        <Caption text={props.captions[props.path]} />
      </div>
      {expandable && open
        ? entriesOf(props.value).map(([key, child]) => (
            <ValueNode
              key={key}
              name={key}
              path={`${props.path}.${key}`}
              value={child}
              depth={props.depth + 1}
              captions={props.captions}
              onPick={props.onPick}
            />
          ))
        : null}
    </div>
  );
}

interface FlatEntry {
  path: string;
  value: unknown;
}

const SEARCH_DEPTH = 6;
const SEARCH_LIMIT = 200;

function flatten(
  value: unknown,
  path: string,
  depth: number,
  out: FlatEntry[],
) {
  for (const [key, child] of entriesOf(value)) {
    const childPath = path ? `${path}.${key}` : key;
    out.push({ path: childPath, value: child });
    if (depth < SEARCH_DEPTH && isExpandable(child)) {
      flatten(child, childPath, depth + 1, out);
    }
  }
}

function SearchResults(props: {
  scope: ExpressionScope;
  query: string;
  onPick: (path: string) => void;
}) {
  const matches = useMemo(() => {
    const all: FlatEntry[] = [];
    flatten(props.scope.value, "", 0, all);
    const lowered = props.query.toLowerCase();
    return all
      .filter((entry) => entry.path.toLowerCase().includes(lowered))
      .slice(0, SEARCH_LIMIT);
  }, [props.scope, props.query]);
  if (matches.length === 0) {
    return <div className="px-2 py-1 text-xs text-slate-400">No matches</div>;
  }
  return (
    <>
      {matches.map((entry) => (
        <button
          key={entry.path}
          type="button"
          className="flex w-full items-baseline gap-2 rounded px-2 py-0.5 text-left hover:bg-slate-50"
          title={`{{${entry.path}}}`}
          onClick={() => props.onPick(entry.path)}
        >
          <span className="min-w-0 truncate font-mono text-[11px] text-slate-700">
            {entry.path}
          </span>
          <span className="truncate text-[10px] text-slate-400">
            {preview(entry.value)}
          </span>
        </button>
      ))}
    </>
  );
}

// Docked at the bottom of the side panel; renders whatever field is focused.
export function ExpressionPanel() {
  const context = useExpressionTarget();
  const target = context?.target ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; scope: ExpressionScope }
    | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [sourceVersion, setSourceVersion] = useState(0);

  useEffect(() => {
    const listener = () => setSourceVersion((value) => value + 1);
    scopeListeners.add(listener);
    return () => {
      scopeListeners.delete(listener);
    };
  }, []);

  const stepId = target?.stepId;
  const hasTarget = target !== null;
  useEffect(() => {
    if (!hasTarget || !scopeSource) return;
    let alive = true;
    setState({ kind: "loading" });
    scopeSource.load({ stepId }).then(
      (scope) => {
        if (alive) setState({ kind: "ready", scope });
      },
      (error: unknown) => {
        if (alive) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      alive = false;
    };
  }, [hasTarget, stepId, sourceVersion]);

  if (!context || !scopeSource) return null;

  const pick = (path: string) => target?.insert(`{{${path}}}`);
  const scope = state.kind === "ready" ? state.scope : EMPTY_SCOPE;
  const empty = entriesOf(scope.value).length === 0;

  return (
    <div className="flex max-h-[45%] shrink-0 flex-col border-t border-solid border-slate-200 bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono text-[11px] text-slate-500">{"{}"}</span>
        <span className="min-w-0 truncate text-[11px] text-slate-500">
          {target ? (
            <>
              Insert into{" "}
              <span className="font-semibold text-slate-700">
                {target.label}
              </span>
            </>
          ) : (
            "Focus a field to insert a value"
          )}
        </span>
        <button
          type="button"
          className="ml-auto text-[11px] text-slate-400 hover:text-slate-600"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {collapsed || !target ? null : (
        <>
          <div className="px-3 pb-1.5">
            <input
              className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
              placeholder="Search paths…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
            {state.kind === "error" ? (
              <div className="px-2 py-1 text-xs text-red-500">
                {state.message}
              </div>
            ) : state.kind === "loading" ? (
              <div className="px-2 py-1 text-xs text-slate-400">Loading…</div>
            ) : empty ? (
              <div className="px-2 py-1 text-xs text-slate-400">
                No values available for this field yet.
              </div>
            ) : query.trim() ? (
              <SearchResults scope={scope} query={query.trim()} onPick={pick} />
            ) : (
              entriesOf(scope.value).map(([key, value]) => (
                <ValueNode
                  key={key}
                  name={key}
                  path={key}
                  value={value}
                  depth={0}
                  captions={scope.captions}
                  onPick={pick}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Per-field "{}" affordance: focuses the docked panel on this field.
export function ExpressionPickerButton(props: {
  active: boolean;
  onFocusField: () => void;
}) {
  if (!scopeSource) return null;
  return (
    <button
      type="button"
      title="Insert value from trigger or previous steps"
      className={`shrink-0 rounded border px-1.5 py-1 font-mono text-[11px] ${
        props.active
          ? "border-blue-500 text-blue-600"
          : "border-slate-300 text-slate-500 hover:border-slate-400"
      }`}
      onClick={props.onFocusField}
    >
      {"{}"}
    </button>
  );
}

function Chip(props: {
  expression: string;
  stepBlockTypes: Record<string, string>;
}) {
  const ref = describeExpression(props.expression);
  const blockType = ref.stepKey ? props.stepBlockTypes[ref.stepKey] : undefined;
  const head =
    ref.root === "steps"
      ? ref.stepKey
      : ref.root === "trigger"
        ? "trigger"
        : ref.root === "variables"
          ? "var"
          : "";
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 rounded border border-solid border-blue-200 bg-blue-50 px-1 py-px font-mono text-[10px] text-blue-700"
      title={`{{${props.expression}}}`}
    >
      {blockType ? <BlockLogo blockType={blockType} size={12} /> : null}
      {head ? <span className="font-semibold">{head}</span> : null}
      <span className="truncate">
        {ref.root === "other" ? ref.rest : ref.rest || "*"}
      </span>
      {ref.hasFallback ? <span className="text-blue-400">||…</span> : null}
    </span>
  );
}

// Read-only line under a text field: literal runs plus a chip per {{token}}.
export function ExpressionTokenLine(props: { value: string }) {
  const context = useExpressionTarget();
  const tokens = splitExpressionTokens(props.value);
  if (!tokens.some((token) => token.kind === "expression")) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
      {tokens.map((token, index) =>
        token.kind === "text" ? (
          <span key={index} className="max-w-40 truncate whitespace-pre">
            {token.text}
          </span>
        ) : (
          <Chip
            key={index}
            expression={token.expression}
            stepBlockTypes={context?.stepBlockTypes ?? {}}
          />
        ),
      )}
    </div>
  );
}

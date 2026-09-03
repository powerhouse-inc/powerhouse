// "{}" button + popover exploring the run scope (trigger.payload / steps.*);
// picking a node inserts its {{path}} expression into the field.
import { useEffect, useRef, useState } from "react";

export interface ExpressionScopeSource {
  // Scope object { trigger: { payload }, steps: { key: { output } } } for the
  // field being edited; stepId limits steps to that step's ancestors.
  load: (context: { stepId?: string }) => Promise<unknown>;
}

let scopeSource: ExpressionScopeSource | undefined;

export function registerExpressionScopeSource(next: ExpressionScopeSource) {
  scopeSource = next;
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
    value !== null &&
    typeof value === "object" &&
    Object.keys(value).length > 0
  );
}

function entriesOf(value: unknown): [string, unknown][] {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item]);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>);
  }
  return [];
}

function ValueNode(props: {
  name: string;
  path: string;
  value: unknown;
  depth: number;
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
      </div>
      {expandable && open
        ? entriesOf(props.value).map(([key, child]) => (
            <ValueNode
              key={key}
              name={key}
              path={`${props.path}.${key}`}
              value={child}
              depth={props.depth + 1}
              onPick={props.onPick}
            />
          ))
        : null}
    </div>
  );
}

export function ExpressionPickerButton(props: {
  onPick: (expression: string) => void;
  // Step whose config field is being edited; omitted for trigger fields.
  stepId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    scopeSource
      ?.load({ stepId: props.stepId })
      .then((next) => {
        if (alive) setScope(next);
      })
      .catch((loadError: unknown) => {
        if (alive) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [open, props.stepId]);

  if (!scopeSource) return null;
  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        title="Insert value from trigger or previous steps"
        className={`rounded border px-1.5 py-1 font-mono text-[11px] ${
          open
            ? "border-blue-500 text-blue-600"
            : "border-slate-300 text-slate-500 hover:border-slate-400"
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        {"{}"}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-solid border-slate-200 bg-white py-1 shadow-lg">
          <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
            Insert value
          </div>
          {error ? (
            <div className="px-2 py-1 text-xs text-red-500">{error}</div>
          ) : scope === undefined ? (
            <div className="px-2 py-1 text-xs text-slate-400">Loading…</div>
          ) : (
            entriesOf(scope).map(([key, value]) => (
              <ValueNode
                key={key}
                name={key}
                path={key}
                value={value}
                depth={0}
                onPick={(path) => {
                  setOpen(false);
                  props.onPick(`{{${path}}}`);
                }}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

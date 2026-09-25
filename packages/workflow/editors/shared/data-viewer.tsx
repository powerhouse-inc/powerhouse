// A run's data (a step's input or output, a trigger payload) as a foldable
// tree, with a raw JSON view and, given a root, per-key {{references}}.
import { lazy, Suspense, useState } from "react";
import { IconButton } from "./controls.js";

const DataTree = lazy(() => import("./data-tree.js"));

function stringify(value: unknown): string {
  try {
    // undefined for functions and symbols, despite the typing.
    return (JSON.stringify(value, null, 2) as string | undefined) ?? "";
  } catch {
    return String(value as string);
  }
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function RawJson(props: { text: string }) {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-foreground">
      {props.text}
    </pre>
  );
}

// Stands in while the tree's chunk loads.
function TreeSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading data"
      className="flex animate-pulse flex-col gap-2 py-1"
    >
      {["w-2/5", "w-3/5", "w-1/2", "w-1/3"].map((width, index) => (
        <span
          key={width}
          className={`h-2.5 rounded bg-muted ${width}`}
          style={{ marginLeft: index === 0 ? 0 : 16 }}
        />
      ))}
    </div>
  );
}

export function DataViewer(props: {
  label: string;
  value: unknown;
  // Expression prefix for this value, e.g. "steps.fetch.output".
  root?: string;
  emptyText?: string;
}) {
  const [raw, setRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const empty = isEmpty(props.value);
  const text = stringify(props.value);
  const tree = typeof props.value === "object" && props.value !== null;

  return (
    <section
      aria-label={props.label}
      className="min-w-0 rounded-md border border-solid border-border bg-card"
    >
      <header className="flex h-8 items-center gap-1 border-b border-solid border-border pl-3 pr-1">
        <h4 className="mr-auto text-xs font-medium text-foreground">
          {props.label}
        </h4>
        {!empty && tree ? (
          <button
            type="button"
            aria-pressed={raw}
            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => setRaw((value) => !value)}
          >
            {raw ? "Tree" : "JSON"}
          </button>
        ) : null}
        {!empty ? (
          <IconButton
            icon={copied ? "check" : "copy"}
            label={`Copy ${props.label.toLowerCase()} as JSON`}
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          />
        ) : null}
      </header>
      <div className="px-3 py-2">
        {empty ? (
          <p className="text-xs text-muted-foreground">
            {props.emptyText ?? "Nothing"}
          </p>
        ) : !tree ? (
          <p className="break-words font-mono text-xs text-foreground">
            {text}
          </p>
        ) : raw ? (
          <RawJson text={text} />
        ) : (
          <div className="max-h-72 overflow-auto">
            <Suspense fallback={<TreeSkeleton />}>
              <DataTree value={props.value as object} root={props.root} />
            </Suspense>
          </div>
        )}
      </div>
    </section>
  );
}

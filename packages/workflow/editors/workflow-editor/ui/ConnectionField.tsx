// Connection picker: autocomplete over powerhouse/connection documents,
// grouping ones whose connectorId matches the block's piece package.
import { useEffect, useRef, useState } from "react";
import type {
  BlockForm,
  ConnectionSummary,
  DesignTimeService,
} from "./forms.js";

// "@scope/pkg@1.2.3#name" -> "@scope/pkg" (works for connectorIds too).
function packageOf(id: string): string {
  const head = id.split("#")[0];
  const at = head.lastIndexOf("@");
  return at > 0 ? head.slice(0, at) : head;
}

const STATUS_DOT: Record<string, string> = {
  OK: "bg-emerald-500",
  UNCONFIGURED: "bg-amber-400",
  ERROR: "bg-red-500",
  REVOKED: "bg-red-500",
};

function ConnectionRow(props: {
  connection: ConnectionSummary;
  onPick: (connection: ConnectionSummary) => void;
}) {
  const { connection } = props;
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
      // mousedown so the pick lands before the input's blur.
      onMouseDown={(event) => {
        event.preventDefault();
        props.onPick(connection);
      }}
    >
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[connection.status] ?? "bg-slate-300"}`}
        title={connection.status}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-slate-700">
          {connection.name}
          {connection.accountLabel ? (
            <span className="font-normal text-slate-400">
              {" "}
              · {connection.accountLabel}
            </span>
          ) : null}
        </span>
        <span className="block truncate font-mono text-[10px] text-slate-400">
          {connection.connectorId}
        </span>
      </span>
    </button>
  );
}

function Group(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
        {props.label}
      </div>
      {props.children}
    </div>
  );
}

export function ConnectionField(props: {
  blockType: string;
  value: string;
  onChange: (connectionId: string | null) => void;
  designTime?: DesignTimeService;
}) {
  const [form, setForm] = useState<BlockForm | null | "loading">(
    props.designTime ? "loading" : null,
  );
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(props.value);
  const containerRef = useRef<HTMLDivElement>(null);

  const commit = (next: string) => {
    const trimmed = next.trim();
    if (trimmed !== props.value) props.onChange(trimmed || null);
  };

  useEffect(() => {
    let alive = true;
    props.designTime?.getBlockForm(props.blockType).then(
      (result) => {
        if (alive) setForm(result);
      },
      () => {
        if (alive) setForm(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [props.blockType, props.designTime]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    props.designTime?.listConnections?.().then(
      (result) => {
        if (alive) setConnections(result);
      },
      () => undefined,
    );
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => {
      alive = false;
      window.removeEventListener("mousedown", handler);
    };
  }, [open, props.designTime]);

  const authMode =
    form === "loading" ? "loading" : (form?.auth ?? "optional");
  // Blocks that take no connection only show the field to clear a stale one.
  if (authMode === "none" && !props.value) return null;

  const piecePackage = packageOf(props.blockType);
  const query = text.trim().toLowerCase();
  const visible =
    query && text !== props.value
      ? connections.filter((connection) =>
          [connection.name, connection.connectorId, connection.id].some(
            (candidate) => candidate.toLowerCase().includes(query),
          ),
        )
      : connections;
  const matching = visible.filter(
    (connection) => packageOf(connection.connectorId) === piecePackage,
  );
  const others = visible.filter(
    (connection) => packageOf(connection.connectorId) !== piecePackage,
  );
  const selected = connections.find(
    (connection) => connection.id === props.value,
  );

  const label =
    authMode === "required"
      ? "Connection (required)"
      : authMode === "loading"
        ? "Connection"
        : "Connection (optional)";

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <input
          className="w-full rounded border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-800"
          value={text}
          placeholder="Search connections or paste a document id"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit(event.currentTarget.value);
              setOpen(false);
            }
            if (event.key === "Escape") setOpen(false);
          }}
        />
      </label>
      {selected ? (
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className={`h-2 w-2 rounded-full ${STATUS_DOT[selected.status] ?? "bg-slate-300"}`}
          />
          {selected.name} · {selected.connectorId} · {selected.status}
        </p>
      ) : props.value ? (
        <p className="mt-1 text-[11px] text-slate-400">
          Not a known connection document.
        </p>
      ) : authMode === "required" ? (
        <p className="mt-1 text-[11px] text-amber-600">
          This block requires a connection.
        </p>
      ) : null}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-solid border-slate-200 bg-white py-1 shadow-lg">
          {matching.length > 0 ? (
            <Group label="For this piece">
              {matching.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  onPick={(picked) => {
                    setText(picked.id);
                    commit(picked.id);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          ) : null}
          {others.length > 0 ? (
            <Group label={matching.length > 0 ? "Other connections" : "Connections"}>
              {others.map((connection) => (
                <ConnectionRow
                  key={connection.id}
                  connection={connection}
                  onPick={(picked) => {
                    setText(picked.id);
                    commit(picked.id);
                    setOpen(false);
                  }}
                />
              ))}
            </Group>
          ) : null}
          {matching.length === 0 && others.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-slate-400">
              No connection documents found.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

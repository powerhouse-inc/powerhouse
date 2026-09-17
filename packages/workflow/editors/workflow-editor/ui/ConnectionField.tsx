// Connection picker: autocomplete over the powerhouse/connection documents
// that configure this block's own piece.
import {
  addDocument,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import { useEffect, useRef, useState } from "react";
import { pieceLogo, usePieceLogos } from "./block-meta.js";
import {
  CONNECTION_TYPE,
  compatibleConnections,
  connectionDraftFor,
  looksLikeDocumentId,
  packageOf,
  type ConnectionDraft,
} from "./connection-create.js";
import { CreateConnectionModal } from "./CreateConnectionModal.js";
import type {
  BlockForm,
  ConnectionSummary,
  DesignTimeService,
} from "./forms.js";

const STATUS_DOT: Record<string, string> = {
  OK: "bg-emerald-500",
  UNCONFIGURED: "bg-amber-400",
  ERROR: "bg-red-500",
  REVOKED: "bg-red-500",
};

// The piece's own logo, falling back to its initial until the catalog lands.
function ConnectorIcon(props: { connectorId: string }) {
  usePieceLogos();
  const [broken, setBroken] = useState(false);
  const piecePackage = packageOf(props.connectorId);
  const src = broken ? undefined : pieceLogo(piecePackage);
  if (!src) {
    const short =
      piecePackage
        .split("/")
        .pop()
        ?.replace(/^piece-/, "") ?? "";
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-solid border-slate-200 bg-slate-50 text-[9px] text-slate-500">
        {short.slice(0, 1).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="h-4 w-4 shrink-0 object-contain"
      onError={() => setBroken(true)}
    />
  );
}

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
      <ConnectorIcon connectorId={connection.connectorId} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
        {connection.name}
        {connection.accountLabel ? (
          <span className="font-normal text-slate-400">
            {" "}
            · {connection.accountLabel}
          </span>
        ) : null}
      </span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[connection.status] ?? "bg-slate-300"}`}
        title={connection.status}
      />
    </button>
  );
}

function CreateRow(props: {
  draft: ConnectionDraft;
  busy: boolean;
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50 disabled:opacity-50"
      disabled={props.busy}
      // mousedown so the click lands before the input's blur.
      onMouseDown={(event) => {
        event.preventDefault();
        props.onCreate();
      }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-solid border-slate-300 text-[10px] text-slate-500">
        +
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">
        {props.busy ? "Creating connection…" : "Create connection"}
      </span>
    </button>
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
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const driveId = useSelectedDriveId();

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

  // The selected connection may configure another piece (a stale value, or one
  // pasted by hand), so it is resolved against the whole listing.
  const selected = connections.find(
    (connection) => connection.id === props.value,
  );

  const authMode = form === "loading" ? "loading" : (form?.auth ?? "optional");
  // Blocks that take no connection only show the field to clear a stale one.
  if (authMode === "none" && !props.value) return null;

  const compatible = compatibleConnections(connections, props.blockType);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? compatible.filter((connection) =>
        [connection.name, connection.accountLabel ?? ""].some((candidate) =>
          candidate.toLowerCase().includes(needle),
        ),
      )
    : compatible;
  const draft = driveId
    ? connectionDraftFor({
        blockType: props.blockType,
        authMode,
        // The unfiltered set, so typing cannot summon the create entry for a
        // piece that already has a connection.
        matchingCount: compatible.length,
      })
    : null;

  const create = (pending: ConnectionDraft) => {
    if (!driveId || creating) return;
    setCreating(true);
    setCreateError(null);
    addDocument(driveId, pending.name, CONNECTION_TYPE)
      .then((node) => setDraftId(node.id))
      .catch((error: unknown) => {
        setCreateError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setCreating(false));
  };

  const pick = (connectionId: string) => {
    setQuery("");
    setOpen(false);
    if (connectionId !== props.value) props.onChange(connectionId);
  };

  const clear = () => {
    setQuery("");
    setOpen(false);
    if (props.value) props.onChange(null);
  };

  const finishCreate = (connectionId: string) => {
    setDraftId(null);
    pick(connectionId);
    // The listing is cached, so the new document has to be pulled in for the
    // name and icon below the input to resolve it.
    props.designTime?.refreshConnections?.();
    props.designTime?.listConnections?.().then(
      (result) => setConnections(result),
      () => undefined,
    );
  };

  const label =
    authMode === "required"
      ? "Connection (required)"
      : authMode === "loading"
        ? "Connection"
        : "Connection (optional)";

  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {open ? (
        <input
          autoFocus
          className="w-full rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-800"
          value={query}
          placeholder="Search connections or paste a document id"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setQuery("");
              setOpen(false);
            }
          }}
        />
      ) : (
        // Closed, the field reads as the chosen connection rather than its id.
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-solid border-slate-300 px-2 py-1.5 text-left text-xs hover:bg-slate-50"
          onClick={() => setOpen(true)}
        >
          {selected ? (
            <>
              <ConnectorIcon connectorId={selected.connectorId} />
              <span className="min-w-0 flex-1 truncate text-slate-800">
                {selected.name}
                {selected.accountLabel ? (
                  <span className="text-slate-400">
                    {" "}
                    · {selected.accountLabel}
                  </span>
                ) : null}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[selected.status] ?? "bg-slate-300"}`}
                title={selected.status}
              />
            </>
          ) : (
            <span className="flex-1 truncate text-slate-400">
              {props.value ? props.value : "Select a connection"}
            </span>
          )}
        </button>
      )}
      {props.value && !open ? (
        <button
          type="button"
          className="mt-1 text-[11px] text-slate-400 hover:text-slate-600"
          onClick={clear}
        >
          Clear
        </button>
      ) : null}
      {props.value && !selected ? (
        <p className="mt-1 text-[11px] text-slate-400">
          Not a known connection document.
        </p>
      ) : null}
      {selected &&
      packageOf(selected.connectorId) !== packageOf(props.blockType) ? (
        <p className="mt-1 text-[11px] text-amber-600">
          Configures {selected.connectorId}, not this block&apos;s piece.
        </p>
      ) : null}
      {!props.value && authMode === "required" ? (
        <p className="mt-1 text-[11px] text-amber-600">
          This block requires a connection.
        </p>
      ) : null}
      {createError ? (
        <p className="mt-1 text-[11px] font-medium text-red-600">
          {createError}
        </p>
      ) : null}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-solid border-slate-200 bg-white py-1 shadow-lg">
          {visible.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              onPick={(picked) => pick(picked.id)}
            />
          ))}
          {draft && !needle ? (
            <CreateRow
              draft={draft}
              busy={creating}
              onCreate={() => create(draft)}
            />
          ) : null}
          {visible.length === 0 && looksLikeDocumentId(query) ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-slate-50"
              onMouseDown={(event) => {
                event.preventDefault();
                pick(query.trim());
              }}
            >
              <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                Use document id{" "}
                <span className="font-mono text-slate-500">{query.trim()}</span>
              </span>
            </button>
          ) : null}
          {visible.length === 0 && !draft && !looksLikeDocumentId(query) ? (
            <p className="px-2 py-1.5 text-xs text-slate-400">
              {needle
                ? "No matching connection."
                : "No connection for this piece yet."}
            </p>
          ) : null}
        </div>
      ) : null}
      {draftId && draft ? (
        <CreateConnectionModal
          connectionId={draftId}
          draft={draft}
          onDone={finishCreate}
        />
      ) : null}
    </div>
  );
}

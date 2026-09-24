// Connection picker: autocomplete over the powerhouse/connection documents
// that configure this block's own piece.
import {
  addDocument,
  useSelectedDriveId,
} from "@powerhousedao/reactor-browser";
import { useEffect, useRef, useState } from "react";
import { FieldLabel, Hint, textInputClass } from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
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
  OK: "bg-wf-ok",
  UNCONFIGURED: "bg-wf-warn",
  ERROR: "bg-wf-fail",
  REVOKED: "bg-wf-fail",
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
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-solid border-foreground/10 bg-muted/50 text-[9px] text-muted-foreground">
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
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
      // mousedown so the pick lands before the input's blur.
      onMouseDown={(event) => {
        event.preventDefault();
        props.onPick(connection);
      }}
    >
      <ConnectorIcon connectorId={connection.connectorId} />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {connection.name}
        {connection.accountLabel ? (
          <span className="ml-1.5 font-normal text-muted-foreground">
            {connection.accountLabel}
          </span>
        ) : null}
      </span>
      <span
        className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[connection.status] ?? "bg-muted-foreground/40"}`}
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
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent disabled:opacity-50"
      disabled={props.busy}
      // mousedown so the click lands before the input's blur.
      onMouseDown={(event) => {
        event.preventDefault();
        props.onCreate();
      }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-solid border-foreground/15 text-[10px] text-muted-foreground">
        +
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
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

  return (
    <div ref={containerRef} className="relative">
      <FieldLabel
        label="Connection"
        optional={authMode === "optional"}
        needsValue={!props.value && authMode === "required"}
        action={
          props.value && !open ? (
            <button
              type="button"
              className="rounded px-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={clear}
            >
              Clear
            </button>
          ) : undefined
        }
      />
      {open ? (
        <input
          autoFocus
          aria-label="Search connections"
          className={`${textInputClass} border-ring ring-2 ring-ring/25`}
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
          className={`${textInputClass} flex items-center gap-2 text-left ${
            !props.value && authMode === "required"
              ? "border-wf-warn/70 hover:border-wf-warn"
              : ""
          }`}
          onClick={() => setOpen(true)}
        >
          {selected ? (
            <>
              <ConnectorIcon connectorId={selected.connectorId} />
              <span className="min-w-0 flex-1 truncate text-foreground">
                {selected.name}
                {selected.accountLabel ? (
                  <span className="ml-1.5 text-muted-foreground">
                    {selected.accountLabel}
                  </span>
                ) : null}
              </span>
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[selected.status] ?? "bg-muted-foreground/40"}`}
                title={selected.status}
              />
            </>
          ) : (
            <span className="flex-1 truncate text-muted-foreground/70">
              {props.value ? props.value : "Choose a connection"}
            </span>
          )}
          <Icon
            name="chevronDown"
            className="h-3.5 w-3.5 text-muted-foreground"
          />
        </button>
      )}
      {props.value && !selected ? (
        <Hint>Not a known connection document.</Hint>
      ) : null}
      {selected &&
      packageOf(selected.connectorId) !== packageOf(props.blockType) ? (
        <p className="mt-1.5 text-xs text-wf-warn">
          Configures {selected.connectorId}, not this block&apos;s piece.
        </p>
      ) : null}
      {!props.value && authMode === "required" ? (
        <Hint>This block signs in to its service through a connection.</Hint>
      ) : null}
      {createError ? (
        <p className="mt-1.5 text-xs font-medium text-wf-fail">{createError}</p>
      ) : null}
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border border-solid border-foreground/10 bg-popover p-1 shadow-lg">
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
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                pick(query.trim());
              }}
            >
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                Use document id{" "}
                <span className="font-mono text-muted-foreground">
                  {query.trim()}
                </span>
              </span>
            </button>
          ) : null}
          {visible.length === 0 && !draft && !looksLikeDocumentId(query) ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground/80">
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

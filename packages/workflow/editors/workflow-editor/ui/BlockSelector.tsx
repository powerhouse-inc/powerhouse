// Piece-selector-style popover, adapted from the Activepieces builder
// pieces-selector (MIT, activepieces packages/web).
import { useEffect, useRef, useState } from "react";
import { blockMeta } from "./block-meta.js";
import type { BlockPreset } from "./blocks.js";
import type { StepModel } from "./model.js";
import {
  getPieceSource,
  type PieceActionUi,
  type PieceSummaryUi,
  type PieceTriggerUi,
} from "./piece-source.js";

export type PieceMode = "actions" | "triggers";

export function BlockLogo(props: { blockType: string; size?: number }) {
  const meta = blockMeta(props.blockType);
  const size = props.size ?? 36;
  if (meta.logoUrl) {
    return <LogoFrame src={meta.logoUrl} alt={meta.displayName} size={size} />;
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-sm border border-solid border-slate-200 bg-slate-50 text-slate-600"
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      {meta.glyph ?? "?"}
    </div>
  );
}

function LogoFrame(props: { src: string; alt: string; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-sm border border-solid border-slate-200 bg-white"
      style={{
        width: props.size,
        height: props.size,
        padding: props.size / 5,
      }}
    >
      <img
        src={props.src}
        alt={props.alt}
        className="h-full w-full object-contain"
      />
    </div>
  );
}

function Row(props: {
  logo: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left ${
        props.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50"
      }`}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.logo}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-800">
          {props.label}
        </span>
        <span className="block truncate text-[11px] text-slate-400">
          {props.description}
        </span>
      </span>
    </button>
  );
}

function SectionLabel(props: { children: string }) {
  return (
    <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
      {props.children}
    </div>
  );
}

// null while loading.
interface CatalogState {
  pieces: PieceSummaryUi[];
  error?: string;
}

// Drill-in view: one piece's actions or triggers, per mode.
function PieceEntries(props: {
  piece: PieceSummaryUi;
  mode: PieceMode;
  onPick: (preset: BlockPreset) => void;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<
    (PieceActionUi & Partial<PieceTriggerUi>)[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pieceSource = getPieceSource();
    const load =
      props.mode === "triggers"
        ? pieceSource?.loadTriggers(props.piece.name)
        : pieceSource?.loadActions(props.piece.name);
    load
      ?.then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.piece.name, props.mode]);

  return (
    <div className="max-h-80 overflow-y-auto py-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-3 py-1 text-[11px] text-slate-400 hover:text-slate-600"
        onClick={props.onBack}
      >
        ← {props.piece.displayName}
      </button>
      {error ? (
        <div className="px-3 py-2 text-xs text-red-500">{error}</div>
      ) : entries === null ? (
        <div className="px-3 py-2 text-xs text-slate-400">Loading…</div>
      ) : (
        entries.map((entry) => {
          // Only POLLING triggers run today; the rest are visible but inert.
          const strategy = entry.strategy ?? "POLLING";
          const unsupported =
            props.mode === "triggers" && strategy !== "POLLING";
          return (
            <Row
              key={entry.name}
              logo={
                <LogoFrame
                  src={props.piece.logoUrl}
                  alt={props.piece.displayName}
                  size={28}
                />
              }
              label={entry.displayName}
              description={
                unsupported
                  ? `${strategy.toLowerCase()} — not supported yet`
                  : entry.description
              }
              disabled={unsupported}
              onClick={() =>
                props.onPick({
                  label: entry.displayName,
                  blockType: entry.blockType,
                  description: entry.description,
                  defaultConfig: {},
                })
              }
            />
          );
        })
      )}
    </div>
  );
}

export function BlockSelector(props: {
  title: string;
  presets: BlockPreset[];
  onPick: (preset: BlockPreset) => void;
  onClose: () => void;
  // Show the Activepieces catalog below the presets.
  showPieces?: boolean;
  // Which piece entries the drill-in offers; defaults to actions.
  pieceMode?: PieceMode;
  // Detached steps offered for re-attachment at this insertion point.
  attachSteps?: StepModel[];
  onAttach?: (stepId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [piece, setPiece] = useState<PieceSummaryUi | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        props.onClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [props]);

  const pieceSource = props.showPieces ? getPieceSource() : undefined;
  useEffect(() => {
    if (!pieceSource) return;
    let cancelled = false;
    pieceSource
      .loadCatalog()
      .then((pieces) => {
        if (!cancelled) setCatalog({ pieces });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setCatalog({
            pieces: [],
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pieceSource]);

  const mode: PieceMode = props.pieceMode ?? "actions";
  const lowered = query.toLowerCase();
  const filteredPresets = props.presets.filter((preset) =>
    `${preset.label} ${preset.blockType}`.toLowerCase().includes(lowered),
  );
  const filteredAttach = (props.onAttach ? (props.attachSteps ?? []) : []).filter(
    (step) =>
      `${step.name} ${step.key} ${step.blockType}`
        .toLowerCase()
        .includes(lowered),
  );
  const filteredPieces = (catalog?.pieces ?? []).filter(
    (entry) =>
      (mode === "triggers" ? entry.triggerCount : entry.actionCount) > 0 &&
      `${entry.displayName} ${entry.name} ${entry.description}`
        .toLowerCase()
        .includes(lowered),
  );

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel w-72 rounded-md border border-solid border-slate-200 bg-white shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-slate-100 p-2">
        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {props.title}
        </div>
        {piece ? null : (
          <input
            autoFocus
            className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}
      </div>
      {piece ? (
        <PieceEntries
          piece={piece}
          mode={mode}
          onPick={props.onPick}
          onBack={() => setPiece(null)}
        />
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {filteredAttach.length > 0 ? (
            <>
              <SectionLabel>Attach existing step</SectionLabel>
              {filteredAttach.map((step) => (
                <Row
                  key={step.id}
                  logo={<BlockLogo blockType={step.blockType} size={28} />}
                  label={step.name}
                  description={`{{steps.${step.key}}} · detached`}
                  onClick={() => props.onAttach?.(step.id)}
                />
              ))}
            </>
          ) : null}
          {filteredPresets.map((preset) => (
            <Row
              key={preset.blockType + preset.label}
              logo={<BlockLogo blockType={preset.blockType} size={28} />}
              label={preset.label}
              description={preset.description}
              onClick={() => props.onPick(preset)}
            />
          ))}
          {pieceSource ? (
            <>
              <SectionLabel>Pieces</SectionLabel>
              {catalog === null ? (
                <div className="px-3 py-2 text-xs text-slate-400">
                  Loading catalog…
                </div>
              ) : catalog.error ? (
                <div className="px-3 py-2 text-xs text-red-500">
                  {catalog.error}
                </div>
              ) : (
                filteredPieces.map((entry) => (
                  <Row
                    key={entry.name}
                    logo={
                      <LogoFrame
                        src={entry.logoUrl}
                        alt={entry.displayName}
                        size={28}
                      />
                    }
                    label={entry.displayName}
                    description={
                      mode === "triggers"
                        ? `${entry.triggerCount} trigger${entry.triggerCount === 1 ? "" : "s"} · ${entry.description}`
                        : `${entry.actionCount} action${entry.actionCount === 1 ? "" : "s"} · ${entry.description}`
                    }
                    onClick={() => setPiece(entry)}
                  />
                ))
              )}
            </>
          ) : null}
          {filteredPresets.length === 0 &&
          filteredPieces.length === 0 &&
          filteredAttach.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">No matches</div>
          ) : null}
        </div>
      )}
    </div>
  );
}

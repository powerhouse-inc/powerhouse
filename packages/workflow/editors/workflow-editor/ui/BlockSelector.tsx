// Piece-selector-style popover, adapted from the Activepieces builder
// pieces-selector (MIT, activepieces packages/web).
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Icon, type IconName } from "../../shared/icons.js";
import { blockKey } from "@powerhousedao/pieces-framework/block-type";
import { registerPieceLogos, useBlockMeta } from "./block-meta.js";
import {
  ASSERT_BLOCK,
  BRANCH_BLOCK,
  isCoreBlock,
  MANUAL_TRIGGER,
  pinBlock,
  SCHEDULE_TRIGGER,
  stepBlock,
  WEBHOOK_TRIGGER,
  type BlockIdentity,
  type BlockPreset,
  type BlockRef,
  type PickedPreset,
} from "./blocks.js";
import { useBlockFormPrefetch } from "./design-time.js";
import type { StepModel } from "./model.js";
import { useDraftBlocks } from "./version-badge.js";
import {
  blockUnavailable,
  type BlockSearchHitUi,
  type BlockSearchResultUi,
  type PieceActionUi,
  type PieceSummaryUi,
  type PieceTriggerUi,
  usePieceSource,
} from "./piece-source.js";

export type PieceMode = "actions" | "triggers";

// Logo size for the picker's rows: presets, pieces, search hits and attach.
const ROW_LOGO = 24;

// Built-in blocks have no artwork of their own; each gets a coloured tile.
const CORE_TILE: Record<string, { icon: IconName; color: string }> = {
  [blockKey(MANUAL_TRIGGER)]: { icon: "play", color: "#2563eb" },
  [blockKey(SCHEDULE_TRIGGER)]: { icon: "clock", color: "#7c3aed" },
  [blockKey(WEBHOOK_TRIGGER)]: { icon: "bolt", color: "#0891b2" },
  [blockKey(BRANCH_BLOCK)]: { icon: "branch", color: "#d97706" },
  [blockKey(ASSERT_BLOCK)]: { icon: "alert", color: "#dc2626" },
};

function CoreTile(props: {
  tile: { icon: IconName; color: string };
  size: number;
  bare?: boolean;
}) {
  const tile = props.tile;
  const glyph = Math.round(props.size * (props.bare ? 0.9 : 0.55));
  // Bare: the caller's badge is the tile, so only the icon is drawn.
  if (props.bare) {
    return (
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: props.size, height: props.size, color: tile.color }}
      >
        <Icon name={tile.icon} size={glyph} />
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[22%] text-white"
      style={{
        width: props.size,
        height: props.size,
        backgroundColor: tile.color,
      }}
    >
      <Icon name={tile.icon} size={glyph} />
    </span>
  );
}

export function BlockLogo(props: {
  block: BlockIdentity;
  size?: number;
  // Set where the caller already draws a light badge behind the logo.
  bare?: boolean;
}) {
  const meta = useBlockMeta(props.block);
  const tile = CORE_TILE[blockKey(props.block)] as
    | { icon: IconName; color: string }
    | undefined;
  if (tile) {
    return <CoreTile tile={tile} size={props.size ?? 36} bare={props.bare} />;
  }
  return (
    <LogoFrame
      src={meta.logoUrl}
      alt={meta.displayName}
      size={props.size ?? 36}
      glyph={meta.glyph}
      bare={props.bare}
    />
  );
}

function GlyphBadge(props: { glyph?: string; size: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-sm border border-solid border-foreground/10 bg-muted/50 text-muted-foreground"
      style={{
        width: props.size,
        height: props.size,
        fontSize: props.size / 2,
      }}
    >
      {props.glyph ?? "?"}
    </div>
  );
}

// Falls back to the glyph badge when the piece metadata carries no logo, or
// when the CDN image fails to load (Activepieces retires logo files).
function LogoFrame(props: {
  src?: string;
  alt: string;
  size: number;
  glyph?: string;
  bare?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- a new src gets a fresh chance to load
    setBroken(false);
  }, [props.src]);
  if (!props.src || broken) {
    return <GlyphBadge glyph={props.glyph} size={props.size} />;
  }
  // No frame and no padding around a logo: a piece's artwork is its own tile,
  // with its own corner radius and its own margin.

  // Framing it drew our border through corners that were already rounded —
  // and no single radius matches every piece, so the frame is left to the
  // glyph badge, which is the only case where we draw the tile ourselves.
  return (
    // Piece logos are drawn for light backgrounds, so dark mode backs them
    // with a small white tile rather than losing black artwork to the page.
    <div
      className={`flex shrink-0 items-center justify-center ${
        props.bare
          ? ""
          : "dark:rounded-[22%] dark:bg-white dark:p-[var(--logo-pad)]"
      }`}
      // Pixels, not %: percentage padding follows the container's width.
      style={
        {
          width: props.size,
          height: props.size,
          "--logo-pad": `${Math.round(props.size * 0.12)}px`,
        } as CSSProperties
      }
    >
      <img
        src={props.src}
        alt={props.alt}
        // drop-shadow, not a border or a ring: it follows the image's alpha,
        // so it traces the artwork's own silhouette — rounded corners and all
        // — and gives a white-on-transparent logo an edge on a white row.
        className="h-full w-full object-contain drop-shadow-sm"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

function Row(props: {
  logo: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
  // Warms what a pick will need, while the row is hovered or focused.
  onHover?: () => void;
  disabled?: boolean;
  // The piece version a pick pins to; shown on hover unless `versionNote`
  // says why it matters here.
  version?: string;
  versionNote?: string;
}) {
  return (
    <button
      type="button"
      className={`group flex w-full items-center gap-2 px-3 py-1.5 text-left ${
        props.disabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/50"
      }`}
      disabled={props.disabled}
      onClick={props.onClick}
      onMouseEnter={props.onHover}
      onFocus={props.onHover}
    >
      {props.logo}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-foreground">
          {props.label}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground/80">
          {props.description}
        </span>
      </span>
      {props.version ? (
        <span
          className={`ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted-foreground/70 ${
            props.versionNote
              ? ""
              : "hidden group-hover:inline group-focus-visible:inline"
          }`}
          title={props.versionNote ?? `Pinned to version ${props.version}`}
        >
          v{props.version}
        </span>
      ) : null}
    </button>
  );
}

// The core piece is the runtime's own, so its rows carry no version.
function shownVersion(
  pieceName: string,
  version: string | undefined,
): string | undefined {
  return isCoreBlock({ pieceName }) ? undefined : version;
}

type VersionNote = (
  piece: string | undefined,
  version: string | undefined,
) => string | undefined;

// Why a row's version is worth showing: a local build shadowing the published
// piece, or other steps of the workflow on another version of it.
function useVersionNote(
  catalog: readonly PieceSummaryUi[] | undefined,
): VersionNote {
  const draft = useDraftBlocks();
  return (piece, version) => {
    if (!piece || !version) return undefined;
    const others = [
      ...new Set(
        draft
          .filter(
            (block) =>
              block.pieceName === piece && block.pieceVersion !== version,
          )
          .map((block) => `v${block.pieceVersion}`),
      ),
    ];
    if (others.length > 0) {
      return `Other steps of this workflow use ${others.join(", ")}`;
    }
    const published = catalog?.find(
      (entry) => entry.name === piece,
    )?.publishedVersion;
    return published && published !== version
      ? `A local build; v${published} is published`
      : undefined;
  };
}

function SectionLabel(props: { children: string }) {
  return (
    <div className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
      {props.children}
    </div>
  );
}

// null while loading.
interface CatalogState {
  pieces: PieceSummaryUi[];
  error?: string;
}

// Activepieces category ids → chip labels; AI variants share one chip and
// their CORE/FLOW_CONTROL utilities are renamed so "Core" stays ours.
const CATEGORY_LABELS: Record<string, string> = {
  ARTIFICIAL_INTELLIGENCE: "AI",
  UNIVERSAL_AI: "AI",
  PRODUCTIVITY: "Productivity",
  MARKETING: "Marketing",
  COMMUNICATION: "Communication",
  SALES_AND_CRM: "Sales & CRM",
  DEVELOPER_TOOLS: "Developer tools",
  CONTENT_AND_FILES: "Content & files",
  BUSINESS_INTELLIGENCE: "Business intelligence",
  CORE: "Utilities",
  FLOW_CONTROL: "Utilities",
  COMMERCE: "Commerce",
  FORMS_AND_SURVEYS: "Forms & surveys",
  ACCOUNTING: "Accounting",
  CUSTOMER_SUPPORT: "Customer support",
  PAYMENT_PROCESSING: "Payments",
  HUMAN_RESOURCES: "HR",
};

export const CORE_CHIP = "Core";
// The reactor's own blocks: its own chip, beside Core, because they are a
// piece rather than an engine built-in and an author looks for them by name.
export const POWERHOUSE_CHIP = "Powerhouse";
const AI_CHIP = "AI";

function categoryLabel(id: string): string {
  return (
    CATEGORY_LABELS[id] ??
    id
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/^\w/, (char) => char.toUpperCase())
  );
}

export function chipsOf(piece: { categories: string[] }): Set<string> {
  return new Set(piece.categories.map(categoryLabel));
}

// Chip order: Core and Powerhouse pinned, AI next, then by piece count.
export function orderChips(pieces: { categories: string[] }[]): string[] {
  const counts = new Map<string, number>();
  for (const piece of pieces) {
    for (const chip of chipsOf(piece)) {
      counts.set(chip, (counts.get(chip) ?? 0) + 1);
    }
  }
  const rest = [...counts.entries()]
    .filter(([chip]) => chip !== AI_CHIP)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([chip]) => chip);
  return [
    CORE_CHIP,
    POWERHOUSE_CHIP,
    ...(counts.has(AI_CHIP) ? [AI_CHIP] : []),
    ...rest,
  ];
}

// Drill-in view: one piece's actions or triggers, per mode.
function PieceEntries(props: {
  piece: PieceSummaryUi;
  mode: PieceMode;
  onPick: (preset: BlockPreset) => void;
  onHover: (block: BlockRef) => void;
  onBack: () => void;
  versionNote: VersionNote;
}) {
  const [entries, setEntries] = useState<
    (PieceActionUi & Partial<PieceTriggerUi>)[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const pieceSource = usePieceSource();

  useEffect(() => {
    let cancelled = false;
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
  }, [props.piece.name, props.mode, pieceSource]);

  return (
    <div className="max-h-80 overflow-y-auto py-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-3 py-1 text-[11px] text-muted-foreground/80 hover:text-muted-foreground"
        onClick={props.onBack}
      >
        ← {props.piece.displayName}
      </button>
      {error ? (
        <div className="px-3 py-2 text-xs text-wf-fail">{error}</div>
      ) : entries === null ? (
        <div className="px-3 py-2 text-xs text-muted-foreground/80">
          Loading…
        </div>
      ) : (
        entries.map((entry) => {
          // Visible but inert: picking one would build a step that never runs.
          const kind = props.mode === "triggers" ? "trigger" : "action";
          const unavailable = blockUnavailable({ ...entry, kind });
          const block: BlockRef = {
            pieceName: entry.pieceName,
            pieceVersion: entry.pieceVersion,
            kind,
            name: entry.name,
          };
          return (
            <Row
              key={entry.name}
              logo={
                <LogoFrame
                  src={props.piece.logoUrl}
                  alt={props.piece.displayName}
                  size={ROW_LOGO}
                />
              }
              label={entry.displayName}
              description={unavailable ?? entry.description}
              disabled={unavailable !== undefined}
              version={shownVersion(entry.pieceName, entry.pieceVersion)}
              versionNote={props.versionNote(
                props.piece.name,
                entry.pieceVersion,
              )}
              onHover={
                unavailable === undefined
                  ? () => props.onHover(block)
                  : undefined
              }
              onClick={() =>
                props.onPick({
                  label: entry.displayName,
                  block,
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

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;
const INDEXING_RETRY_MS = 2000;

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: BlockSearchResultUi }
  | { kind: "error"; message: string };

// Debounced catalog-wide search; keeps polling while the runtime indexes.
function useBlockSearch(query: string, enabled: boolean): SearchState {
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const trimmed = query.trim();
  const active = enabled && trimmed.length >= SEARCH_MIN_CHARS;
  const search = usePieceSource()?.searchBlocks;

  useEffect(() => {
    if (!active || !search) {
      // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- drops a finished search when the query goes inactive
      setState({ kind: "idle" });
      return;
    }
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      setState((previous) =>
        previous.kind === "done" ? previous : { kind: "loading" },
      );
      search(trimmed).then(
        (result) => {
          if (!alive) return;
          setState({ kind: "done", result });
          if (result.status === "indexing") {
            retry = setTimeout(
              () => setAttempt((value) => value + 1),
              INDEXING_RETRY_MS,
            );
          }
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
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
      if (retry) clearTimeout(retry);
    };
  }, [active, trimmed, attempt, search]);

  return active ? state : { kind: "idle" };
}

function Chip(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
        props.active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-foreground/10 text-muted-foreground hover:border-foreground/25"
      }`}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  );
}

export function BlockSelector(props: {
  title: string;
  presets: BlockPreset[];
  onPick: (preset: PickedPreset) => void;
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
  const [chip, setChip] = useState<string | null>(null);
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

  const anySource = usePieceSource();
  const pieceSource = props.showPieces ? anySource : undefined;
  // Loaded even without the piece list: presets are pinned to its versions.
  useEffect(() => {
    if (!anySource) return;
    let cancelled = false;
    anySource
      .loadCatalog()
      .then((pieces) => {
        // Canvas nodes read logos from the registry, not from this list.
        registerPieceLogos(pieces);
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
  }, [anySource]);

  const installed = (name: string) =>
    catalog?.pieces.find((entry) => entry.name === name)?.version;
  const versionNote = useVersionNote(catalog?.pieces);
  const pinned = (preset: BlockPreset) => pinBlock(preset.block, installed);
  const pick = (preset: BlockPreset) => {
    const block = pinned(preset);
    if (block) props.onPick({ ...preset, block });
  };
  const prefetch = useBlockFormPrefetch();

  const mode: PieceMode = props.pieceMode ?? "actions";
  const lowered = query.toLowerCase();
  const modePieces = useMemo(
    () =>
      (catalog?.pieces ?? []).filter(
        (entry) =>
          (mode === "triggers" ? entry.triggerCount : entry.actionCount) > 0,
      ),
    [catalog, mode],
  );
  const chips = useMemo(() => orderChips(modePieces), [modePieces]);
  const chipsByPiece = useMemo(
    () => new Map(modePieces.map((entry) => [entry.name, chipsOf(entry)])),
    [modePieces],
  );
  const inChip = (pieceName: string) =>
    chip === null || chip === CORE_CHIP
      ? true
      : (chipsByPiece.get(pieceName)?.has(chip) ?? false);

  const presetChip = chip === CORE_CHIP || chip === POWERHOUSE_CHIP;
  const showCatalog = pieceSource !== undefined && !presetChip;
  const matching = props.presets.filter((preset) =>
    `${preset.label} ${preset.block.pieceName} ${preset.block.name}`
      .toLowerCase()
      .includes(lowered),
  );
  // The engine's own blocks, then the reactor's. Two sections rather than one
  // "Core": the document blocks are a piece, and saying so is honest.
  const corePresets =
    chip === null || chip === CORE_CHIP
      ? matching.filter((preset) => preset.group !== "powerhouse")
      : [];
  const powerhousePresets =
    chip === null || chip === POWERHOUSE_CHIP
      ? matching.filter((preset) => preset.group === "powerhouse")
      : [];
  const filteredAttach = (
    props.onAttach ? (props.attachSteps ?? []) : []
  ).filter((step) =>
    `${step.name} ${step.key} ${step.pieceName} ${step.actionName}`
      .toLowerCase()
      .includes(lowered),
  );
  const filteredPieces = showCatalog
    ? modePieces.filter(
        (entry) =>
          inChip(entry.name) &&
          `${entry.displayName} ${entry.name} ${entry.description}`
            .toLowerCase()
            .includes(lowered),
      )
    : [];

  const search = useBlockSearch(query, showCatalog && !piece);

  const presetRow = (preset: BlockPreset) => {
    const block = pinned(preset);
    return (
      <Row
        key={blockKey(preset.block) + preset.label}
        logo={<BlockLogo block={preset.block} size={ROW_LOGO} />}
        label={preset.label}
        description={
          block
            ? preset.description
            : catalog === null
              ? "Loading…"
              : "Not installed on this runtime"
        }
        disabled={!block}
        version={shownVersion(preset.block.pieceName, block?.pieceVersion)}
        versionNote={versionNote(preset.block.pieceName, block?.pieceVersion)}
        onHover={block ? () => prefetch(block) : undefined}
        onClick={() => pick(preset)}
      />
    );
  };
  // Labels earn their place once there is more than one thing to tell apart.
  const labelPresets =
    showCatalog ||
    filteredAttach.length > 0 ||
    (corePresets.length > 0 && powerhousePresets.length > 0);
  const wantedKind = mode === "triggers" ? "trigger" : "action";
  const hits: BlockSearchHitUi[] =
    search.kind === "done"
      ? search.result.hits.filter(
          (hit) => hit.kind === wantedKind && inChip(hit.pieceName),
        )
      : [];
  const searchActive = search.kind !== "idle";

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel w-80 rounded-md border border-solid border-foreground/10 bg-card shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-foreground/10 p-2">
        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
          {props.title}
        </div>
        {piece ? null : (
          <>
            <input
              autoFocus
              className="w-full rounded border border-foreground/10 px-2 py-1 text-xs"
              placeholder={
                pieceSource ? "Search pieces, actions, triggers…" : "Search…"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {pieceSource && catalog && !catalog.error ? (
              <div className="mt-1.5 flex flex-wrap gap-1 px-0.5">
                {chips.map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    active={chip === label}
                    onClick={() => setChip(chip === label ? null : label)}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      {piece ? (
        <PieceEntries
          piece={piece}
          mode={mode}
          onPick={pick}
          onHover={prefetch}
          onBack={() => setPiece(null)}
          versionNote={versionNote}
        />
      ) : (
        <div className="max-h-80 overflow-y-auto py-1">
          {filteredAttach.length > 0 ? (
            <>
              <SectionLabel>Attach existing step</SectionLabel>
              {filteredAttach.map((step) => (
                <Row
                  key={step.id}
                  logo={<BlockLogo block={stepBlock(step)} size={ROW_LOGO} />}
                  label={step.name}
                  description={`{{steps.${step.key}}} · detached`}
                  onClick={() => props.onAttach?.(step.id)}
                />
              ))}
            </>
          ) : null}
          {corePresets.length > 0 && labelPresets ? (
            <SectionLabel>Core</SectionLabel>
          ) : null}
          {corePresets.map(presetRow)}
          {powerhousePresets.length > 0 && labelPresets ? (
            <SectionLabel>Powerhouse</SectionLabel>
          ) : null}
          {powerhousePresets.map(presetRow)}
          {searchActive ? (
            <>
              <SectionLabel>
                {mode === "triggers" ? "Triggers" : "Actions & triggers"}
              </SectionLabel>
              {search.kind === "loading" ? (
                <div className="px-3 py-1 text-xs text-muted-foreground/80">
                  Searching…
                </div>
              ) : search.kind === "error" ? (
                <div className="px-3 py-1 text-xs text-wf-fail">
                  {search.message}
                </div>
              ) : (
                <>
                  {hits.map((hit) => {
                    const unavailable = blockUnavailable(hit);
                    const block: BlockRef = {
                      pieceName: hit.pieceName,
                      pieceVersion: hit.pieceVersion,
                      kind: hit.kind,
                      name: hit.name,
                    };
                    return (
                      <Row
                        key={blockKey(block)}
                        logo={
                          <LogoFrame
                            src={hit.logoUrl}
                            alt={hit.pieceDisplayName}
                            size={ROW_LOGO}
                          />
                        }
                        label={`${hit.displayName} · ${hit.pieceDisplayName}`}
                        description={
                          unavailable ??
                          (hit.description || hit.pieceDisplayName)
                        }
                        disabled={unavailable !== undefined}
                        version={shownVersion(hit.pieceName, hit.pieceVersion)}
                        versionNote={versionNote(
                          hit.pieceName,
                          hit.pieceVersion,
                        )}
                        onHover={
                          unavailable === undefined
                            ? () => prefetch(block)
                            : undefined
                        }
                        onClick={() =>
                          pick({
                            label: hit.displayName,
                            block,
                            description: hit.description,
                            defaultConfig: {},
                          })
                        }
                      />
                    );
                  })}
                  {/* Status describes the published catalog only. Blocks this
                    reactor ships are already listed above it. */}
                  {search.result.status === "indexing" ? (
                    <div className="px-3 py-1 text-xs text-muted-foreground/80">
                      Indexing the catalog… more results appear shortly.
                    </div>
                  ) : search.result.status === "error" ? (
                    <div className="px-3 py-1 text-xs text-wf-fail">
                      {search.result.error ?? "Search failed"}
                    </div>
                  ) : hits.length === 0 ? (
                    <div className="px-3 py-1 text-xs text-muted-foreground/80">
                      No matching {wantedKind}s
                    </div>
                  ) : null}
                </>
              )}
            </>
          ) : null}
          {showCatalog ? (
            <>
              <SectionLabel>Pieces</SectionLabel>
              {catalog === null ? (
                <div className="px-3 py-2 text-xs text-muted-foreground/80">
                  Loading catalog…
                </div>
              ) : catalog.error ? (
                <div className="px-3 py-2 text-xs text-wf-fail">
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
                        size={ROW_LOGO}
                      />
                    }
                    label={
                      entry.deprecated
                        ? `${entry.displayName} (deprecated)`
                        : entry.displayName
                    }
                    description={
                      entry.unsupported ??
                      (mode === "triggers"
                        ? `${entry.triggerCount} trigger${entry.triggerCount === 1 ? "" : "s"} · ${entry.description}`
                        : `${entry.actionCount} action${entry.actionCount === 1 ? "" : "s"} · ${entry.description}`)
                    }
                    version={shownVersion(entry.name, entry.version)}
                    versionNote={versionNote(entry.name, entry.version)}
                    onClick={() => setPiece(entry)}
                  />
                ))
              )}
            </>
          ) : null}
          {corePresets.length + powerhousePresets.length === 0 &&
          filteredPieces.length === 0 &&
          filteredAttach.length === 0 &&
          !searchActive ? (
            <div className="px-3 py-2 text-xs text-muted-foreground/80">
              No matches
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

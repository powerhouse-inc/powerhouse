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
import {
  CATALOG_MAX_ATTEMPTS,
  CATALOG_RETRY_MS,
  registerPieceLogos,
  useBlockMeta,
} from "./block-meta.js";
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
  type PieceActionUi,
  type PieceSearchFilterUi,
  type PieceSearchMatchUi,
  type PieceSearchResultUi,
  type PieceSourceKind,
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
  label: React.ReactNode;
  description: React.ReactNode;
  // Full text for truncated labels.
  title?: string;
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
      title={props.title}
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

// Activepieces category ids → chip labels; AI variants share one chip.
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

// The category ids a chip stands for, among those the pieces carry.
export function categoriesOfChip(
  chip: string,
  pieces: { categories: string[] }[],
): string[] {
  const ids = new Set(pieces.flatMap((piece) => piece.categories));
  return [...ids].filter((id) => categoryLabel(id) === chip);
}

// Chip order: AI first, then by piece count.
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
  return [...(counts.has(AI_CHIP) ? [AI_CHIP] : []), ...rest];
}

export type SourceTab = "all" | "core" | "powerhouse" | "activepieces";

const TAB_LABELS: Record<SourceTab, string> = {
  all: "All",
  core: "Core",
  powerhouse: "Powerhouse",
  activepieces: "Activepieces",
};

// Pieces each tab lists; Core lists the engine's presets only.
const TAB_SOURCES: Record<SourceTab, readonly PieceSourceKind[] | undefined> = {
  all: undefined,
  core: [],
  powerhouse: ["local", "registry"],
  activepieces: ["activepieces"],
};

export function inTab(tab: SourceTab, piece: { source?: PieceSourceKind }) {
  const sources = TAB_SOURCES[tab];
  return (
    sources === undefined || sources.includes(piece.source ?? "activepieces")
  );
}

export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Every token somewhere in the text, in any order.
export function matchesQuery(text: string, tokens: string[]): boolean {
  const lowered = text.toLowerCase();
  return tokens.every((token) => lowered.includes(token));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Bolds the words the query's tokens start.
function Highlight(props: { text: string; tokens: string[] }) {
  if (props.tokens.length === 0) return <>{props.text}</>;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${props.tokens.map(escapeRegExp).join("|")})`,
    "giu",
  );
  const parts = props.text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-bold text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function blockRow(props: {
  entry: {
    pieceName: string;
    pieceVersion: string;
    name: string;
    displayName: string;
    description: string;
    unsupported?: string | null;
    strategy?: string | null;
  };
  kind: "action" | "trigger";
  logo: React.ReactNode;
  tokens: string[];
  onPick: (preset: BlockPreset) => void;
  onHover: (block: BlockRef) => void;
  versionNote: VersionNote;
}) {
  const { entry, kind } = props;
  // Visible but inert: picking one would build a step that never runs.
  const unavailable = blockUnavailable({ ...entry, kind });
  const block: BlockRef = {
    pieceName: entry.pieceName,
    pieceVersion: entry.pieceVersion,
    kind,
    name: entry.name,
  };
  return (
    <Row
      key={blockKey(block)}
      logo={props.logo}
      label={<Highlight text={entry.displayName} tokens={props.tokens} />}
      title={entry.description || entry.displayName}
      description={
        unavailable ?? (
          <Highlight text={entry.description} tokens={props.tokens} />
        )
      }
      disabled={unavailable !== undefined}
      version={shownVersion(entry.pieceName, entry.pieceVersion)}
      versionNote={props.versionNote(entry.pieceName, entry.pieceVersion)}
      onHover={
        unavailable === undefined ? () => props.onHover(block) : undefined
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
}

// Drill-in view: one piece's actions or triggers, per mode, with a filter.
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
  const [filter, setFilter] = useState("");
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

  const kind = props.mode === "triggers" ? "trigger" : "action";
  const tokens = queryTokens(filter);
  const shown = (entries ?? []).filter((entry) =>
    matchesQuery(
      `${entry.displayName} ${entry.name} ${entry.description}`,
      tokens,
    ),
  );

  return (
    <>
      <div className="flex items-center gap-1 border-b border-foreground/10 p-2">
        <button
          type="button"
          aria-label="Back to pieces"
          className="shrink-0 px-1 text-xs text-muted-foreground/80 hover:text-foreground"
          onClick={props.onBack}
        >
          ←
        </button>
        <LogoFrame
          src={props.piece.logoUrl}
          alt={props.piece.displayName}
          size={16}
        />
        <input
          autoFocus
          className="min-w-0 flex-1 rounded border border-foreground/10 px-2 py-1 text-xs"
          placeholder={`Search ${props.piece.displayName} ${kind}s…`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="max-h-96 overflow-y-auto py-1">
        {error ? (
          <div className="px-3 py-2 text-xs text-wf-fail">{error}</div>
        ) : entries === null ? (
          <div className="px-3 py-2 text-xs text-muted-foreground/80">
            Loading…
          </div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground/80">
            No matching {kind}s
          </div>
        ) : (
          shown.map((entry) =>
            blockRow({
              entry,
              kind,
              logo: (
                <LogoFrame
                  src={props.piece.logoUrl}
                  alt={props.piece.displayName}
                  size={ROW_LOGO}
                />
              ),
              tokens,
              onPick: props.onPick,
              onHover: props.onHover,
              versionNote: props.versionNote,
            }),
          )
        )}
      </div>
    </>
  );
}

// Blocks a search group shows before "more"; all of them for one or two groups.
const GROUP_BLOCKS = 4;

function PieceGroup(props: {
  match: PieceSearchMatchUi;
  tokens: string[];
  // Shows every block without a "more" row.
  open: boolean;
  onOpenPiece: () => void;
  onPick: (preset: BlockPreset) => void;
  onHover: (block: BlockRef) => void;
  versionNote: VersionNote;
}) {
  const [expanded, setExpanded] = useState(false);
  const { match } = props;
  const all = props.open || expanded;
  const blocks = all ? match.blocks : match.blocks.slice(0, GROUP_BLOCKS);
  const hidden = match.blocks.length - blocks.length;
  return (
    <div className="pb-1">
      <Row
        logo={
          <LogoFrame
            src={match.logoUrl}
            alt={match.displayName}
            size={ROW_LOGO}
          />
        }
        label={
          <>
            <Highlight text={match.displayName} tokens={props.tokens} />
            {match.deprecated ? " (deprecated)" : ""}
          </>
        }
        title={match.description || match.displayName}
        description={match.unsupported ?? match.description}
        version={shownVersion(match.pieceName, match.pieceVersion)}
        versionNote={props.versionNote(match.pieceName, match.pieceVersion)}
        onClick={props.onOpenPiece}
      />
      {blocks.map((hit) =>
        blockRow({
          entry: hit,
          kind: hit.kind,
          // An empty slot keeps the blocks indented under their piece.
          logo: <span className="shrink-0" style={{ width: ROW_LOGO }} />,
          tokens: props.tokens,
          onPick: props.onPick,
          onHover: props.onHover,
          versionNote: props.versionNote,
        }),
      )}
      {hidden > 0 ? (
        <button
          type="button"
          className="w-full py-0.5 pl-[44px] text-left text-[11px] text-muted-foreground/80 hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          {hidden} more…
        </button>
      ) : null}
    </div>
  );
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;
const INDEXING_RETRY_MS = 2000;

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; result: PieceSearchResultUi }
  | { kind: "error"; message: string };

// Debounced catalog-wide search; keeps polling while the runtime indexes.
function usePieceSearch(
  query: string,
  filter: PieceSearchFilterUi | null,
): SearchState {
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const trimmed = query.trim();
  const search = usePieceSource()?.searchPieces;
  const active =
    filter !== null &&
    search !== undefined &&
    trimmed.length >= SEARCH_MIN_CHARS;
  // A key, so a filter rebuilt with the same fields does not search again.
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (!active) {
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
      search(trimmed, JSON.parse(filterKey) as PieceSearchFilterUi).then(
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
  }, [active, trimmed, filterKey, attempt, search]);

  // Loading through the debounce, so the browse list does not flash first.
  if (!active) return { kind: "idle" };
  return state.kind === "idle" ? { kind: "loading" } : state;
}

function Chip(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
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

function Tabs(props: {
  tabs: SourceTab[];
  active: SourceTab;
  onSelect: (tab: SourceTab) => void;
}) {
  return (
    <div role="tablist" className="mt-1.5 flex gap-3 px-1">
      {props.tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={props.active === tab}
          className={`-mb-px border-b-2 pb-1 text-[11px] font-medium ${
            props.active === tab
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => props.onSelect(tab)}
        >
          {TAB_LABELS[tab]}
        </button>
      ))}
    </div>
  );
}

function Status(props: { children: React.ReactNode; error?: boolean }) {
  return (
    <div
      className={`px-3 py-1 text-xs ${props.error ? "text-wf-fail" : "text-muted-foreground/80"}`}
    >
      {props.children}
    </div>
  );
}

export function BlockSelector(props: {
  title: string;
  presets: BlockPreset[];
  onPick: (preset: PickedPreset) => void;
  onClose: () => void;
  // Show the piece catalog below the presets.
  showPieces?: boolean;
  // Which piece entries the drill-in offers; defaults to actions.
  pieceMode?: PieceMode;
  // Detached steps offered for re-attachment at this insertion point.
  attachSteps?: StepModel[];
  onAttach?: (stepId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SourceTab>("all");
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
  const [catalogRound, setCatalogRound] = useState(0);
  // Loaded even without the piece list: presets are pinned to its versions.
  // A failed load retries with a fresh fetch, backing off, before it shows.
  useEffect(() => {
    if (!anySource) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = (attempt: number) => {
      const request =
        attempt > 0 && anySource.reloadCatalog
          ? anySource.reloadCatalog()
          : anySource.loadCatalog();
      request
        .then((pieces) => {
          // Canvas nodes read logos from the registry, not from this list.
          registerPieceLogos(pieces);
          if (!cancelled) setCatalog({ pieces });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (attempt + 1 < CATALOG_MAX_ATTEMPTS) {
            timer = setTimeout(
              () => load(attempt + 1),
              CATALOG_RETRY_MS * 2 ** attempt,
            );
            return;
          }
          setCatalog({
            pieces: [],
            error: error instanceof Error ? error.message : String(error),
          });
        });
    };
    load(catalogRound > 0 ? 1 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [anySource, catalogRound]);

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
  const kind = mode === "triggers" ? "trigger" : "action";
  const tokens = queryTokens(query);
  const showCatalog = pieceSource !== undefined && tab !== "core";
  const tabs: SourceTab[] = pieceSource
    ? ["all", "core", "powerhouse", "activepieces"]
    : ["all", "core", "powerhouse"];

  // A piece whose every block is a preset is listed as those presets.
  const modePieces = useMemo(() => {
    const presetCounts = new Map<string, number>();
    for (const preset of props.presets) {
      const name = preset.block.pieceName;
      presetCounts.set(name, (presetCounts.get(name) ?? 0) + 1);
    }
    return (catalog?.pieces ?? []).filter((entry) => {
      const count =
        mode === "triggers" ? entry.triggerCount : entry.actionCount;
      return count > (presetCounts.get(entry.name) ?? 0);
    });
  }, [catalog, mode, props.presets]);
  const tabPieces = useMemo(
    () => modePieces.filter((entry) => inTab(tab, entry)),
    [modePieces, tab],
  );
  const chips = useMemo(() => orderChips(tabPieces), [tabPieces]);
  // One chip has nothing to narrow.
  const showChips = showCatalog && chips.length > 1;
  const activeChip =
    showChips && chip !== null && chips.includes(chip) ? chip : null;
  const inChip = (entry: { categories: string[] }) =>
    activeChip === null || chipsOf(entry).has(activeChip);

  const searchFilter = useMemo<PieceSearchFilterUi | null>(
    () =>
      showCatalog
        ? {
            kind,
            ...(TAB_SOURCES[tab] ? { sources: TAB_SOURCES[tab] } : {}),
            ...(activeChip
              ? { categories: categoriesOfChip(activeChip, tabPieces) }
              : {}),
          }
        : null,
    [showCatalog, kind, tab, activeChip, tabPieces],
  );
  const search = usePieceSearch(query, piece ? null : searchFilter);
  const searchActive = search.kind !== "idle";

  // A chip narrows to pieces, so the presets step aside.
  const matching =
    activeChip === null
      ? props.presets.filter((preset) =>
          matchesQuery(
            `${preset.label} ${preset.description} ${preset.block.pieceName} ${preset.block.name}`,
            tokens,
          ),
        )
      : [];
  // The engine's own blocks, then the reactor's: the document blocks are a
  // piece, and saying so is honest.
  const corePresets =
    tab === "all" || tab === "core"
      ? matching.filter((preset) => preset.group !== "powerhouse")
      : [];
  const powerhousePresets =
    tab === "all" || tab === "powerhouse"
      ? matching.filter((preset) => preset.group === "powerhouse")
      : [];
  const presetBlocks = new Set(
    props.presets.map(
      (preset) => `${preset.block.pieceName} ${preset.block.name}`,
    ),
  );
  const filteredAttach = (
    props.onAttach && tab === "all" ? (props.attachSteps ?? []) : []
  ).filter((step) =>
    matchesQuery(
      `${step.name} ${step.key} ${step.pieceName} ${step.actionName}`,
      tokens,
    ),
  );
  // The browse list, or the fallback when the source cannot search.
  const filteredPieces =
    showCatalog && !searchActive
      ? tabPieces.filter(
          (entry) =>
            inChip(entry) &&
            matchesQuery(
              `${entry.displayName} ${entry.name} ${entry.description}`,
              tokens,
            ),
        )
      : [];
  // Blocks a preset already offers are listed once, as the preset.
  const groups =
    search.kind === "done"
      ? search.result.pieces
          .map((match) => ({
            ...match,
            blocks: match.blocks.filter(
              (hit) => !presetBlocks.has(`${hit.pieceName} ${hit.name}`),
            ),
          }))
          .filter((match) => match.blocks.length > 0)
      : [];

  const openPiece = (match: PieceSearchMatchUi) =>
    setPiece(
      catalog?.pieces.find((entry) => entry.name === match.pieceName) ?? {
        name: match.pieceName,
        displayName: match.displayName,
        description: match.description,
        logoUrl: match.logoUrl,
        actionCount: 0,
        triggerCount: 0,
        categories: match.categories,
        source: match.source,
        version: match.pieceVersion,
      },
    );

  const presetRow = (preset: BlockPreset) => {
    const block = pinned(preset);
    return (
      <Row
        key={blockKey(preset.block) + preset.label}
        logo={<BlockLogo block={preset.block} size={ROW_LOGO} />}
        label={<Highlight text={preset.label} tokens={tokens} />}
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
  const nothing =
    corePresets.length + powerhousePresets.length === 0 &&
    filteredAttach.length === 0;

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel w-96 rounded-md border border-solid border-foreground/10 bg-card shadow-lg"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (piece) setPiece(null);
        else props.onClose();
      }}
    >
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
        <>
          <div className="border-b border-foreground/10 px-2 pt-2">
            <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
              {props.title}
            </div>
            <input
              autoFocus
              className="w-full rounded border border-foreground/10 px-2 py-1 text-xs"
              placeholder={
                pieceSource ? `Search pieces and ${kind}s…` : "Search…"
              }
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <Tabs
              tabs={tabs}
              active={tab}
              onSelect={(next) => {
                setTab(next);
                setChip(null);
              }}
            />
          </div>
          {showChips && catalog && !catalog.error ? (
            <div className="flex gap-1 overflow-x-auto whitespace-nowrap border-b border-foreground/10 px-2.5 py-1.5 [scrollbar-width:thin]">
              {chips.map((label) => (
                <Chip
                  key={label}
                  label={label}
                  active={activeChip === label}
                  onClick={() => setChip(activeChip === label ? null : label)}
                />
              ))}
            </div>
          ) : null}
          <div className="max-h-96 overflow-y-auto py-1">
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
                <SectionLabel>Pieces</SectionLabel>
                {search.kind === "loading" ? (
                  <Status>Searching…</Status>
                ) : search.kind === "error" ? (
                  <Status error>{search.message}</Status>
                ) : (
                  <>
                    {groups.map((match) => (
                      <PieceGroup
                        key={match.pieceName}
                        match={match}
                        tokens={tokens}
                        open={groups.length <= 2}
                        onOpenPiece={() => openPiece(match)}
                        onPick={pick}
                        onHover={prefetch}
                        versionNote={versionNote}
                      />
                    ))}
                    {/* Status covers the published catalog only; local
                      pieces are already in the groups above. */}
                    {search.result.status === "indexing" ? (
                      <Status>
                        Indexing the catalog… more results appear shortly.
                      </Status>
                    ) : search.result.status === "error" ? (
                      <Status error>
                        {search.result.error ?? "Search failed"}
                      </Status>
                    ) : groups.length === 0 ? (
                      <Status>No matching {kind}s</Status>
                    ) : null}
                  </>
                )}
              </>
            ) : null}
            {showCatalog && !searchActive ? (
              <>
                <SectionLabel>Pieces</SectionLabel>
                {catalog === null ? (
                  <Status>Loading catalog…</Status>
                ) : catalog.error ? (
                  <div className="flex items-center gap-2 px-3 py-2 text-xs text-wf-fail">
                    <span className="min-w-0 flex-1">{catalog.error}</span>
                    <button
                      type="button"
                      className="shrink-0 cursor-pointer rounded border border-solid border-foreground/15 bg-card px-1.5 py-0.5 text-foreground hover:border-foreground/25"
                      onClick={() => {
                        setCatalog(null);
                        setCatalogRound((round) => round + 1);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredPieces.length === 0 ? (
                  <Status>
                    {tab === "powerhouse" && tokens.length === 0
                      ? "No registry pieces on this runtime"
                      : "No matching pieces"}
                  </Status>
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
                        <>
                          <Highlight text={entry.displayName} tokens={tokens} />
                          {entry.deprecated ? " (deprecated)" : ""}
                        </>
                      }
                      title={entry.description || entry.displayName}
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
            {!showCatalog && nothing ? <Status>No matches</Status> : null}
          </div>
        </>
      )}
    </div>
  );
}

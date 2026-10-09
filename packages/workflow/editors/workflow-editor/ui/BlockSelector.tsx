// Two-pane block picker: sources on the left, the selected one's blocks on the
// right, and a grouped search list. Shaped after the Activepieces selector.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
  useId,
  useLayoutEffect,
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
  REACTOR_PIECE,
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
import { PICKER_SIZE } from "./PickerPopover.js";
import { recentPicks, rememberPick } from "./picker-recent.js";
import { VirtualList } from "./VirtualList.js";
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
  // The keyboard's row: tinted and marked.
  active?: boolean;
  // The piece the other pane shows, while the keyboard is elsewhere.
  selected?: boolean;
  // Two lines of description, for blocks; the list sizes the row.
  tall?: boolean;
  // Where it sits in its listbox; only the rows in view are mounted.
  option?: OptionPlace;
  // The piece version a pick pins to; shown on hover unless `versionNote`
  // says why it matters here.
  version?: string;
  versionNote?: string;
}) {
  // An option, not a button: focus stays in the search box, which drives the
  // keyboard and points assistive tech at this row.
  return (
    <div
      {...optionAttributes(props.option)}
      role="option"
      aria-selected={(props.active ?? false) || (props.selected ?? false)}
      aria-disabled={props.disabled}
      className={`group mx-1.5 my-px flex h-[calc(100%-2px)] cursor-pointer items-center gap-2.5 rounded-md px-2 text-left ${rowTone(
        props.active,
        props.selected,
      )} ${props.disabled ? "cursor-not-allowed opacity-50" : ""}`}
      title={props.title}
      onClick={props.disabled ? undefined : props.onClick}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={props.onHover}
    >
      {/* Decorative: the label names the row. */}
      <span aria-hidden="true" className="contents">
        {props.logo}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium leading-[18px] text-foreground">
          {props.label}
        </span>
        <span
          // line-clamp sets its own display; `block` would undo it.
          className={`text-xs leading-4 text-muted-foreground ${
            props.tall ? "line-clamp-2" : "block truncate"
          }`}
        >
          {props.description}
        </span>
      </span>
      {props.version ? (
        <span
          className={`ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-muted-foreground ${
            props.versionNote
              ? ""
              : props.active
                ? ""
                : "hidden group-hover:inline"
          }`}
          title={props.versionNote ?? `Pinned to version ${props.version}`}
        >
          v{props.version}
        </span>
      ) : null}
    </div>
  );
}

// The keyboard's row is tinted with the accent; the piece open beside the
// list sits raised on the rail, joined to the pane that shows it.
function rowTone(active?: boolean, selected?: boolean): string {
  if (active) return "bg-wf-run/10 ring-1 ring-inset ring-wf-run/25";
  if (selected) return "bg-card shadow-sm ring-1 ring-foreground/10";
  return "hover:bg-foreground/[0.05]";
}

// A row's id and position, named by the search box's aria-activedescendant.
interface OptionPlace {
  list: string;
  index: number;
  size: number;
}

export function optionId(list: string, index: number): string {
  return `${list}-${index}`;
}

function optionAttributes(place: OptionPlace | undefined) {
  return place
    ? {
        id: optionId(place.list, place.index),
        "aria-posinset": place.index + 1,
        "aria-setsize": place.size,
      }
    : {};
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
    // The reactor piece ships with the runtime, so its copy is the one meant.
    if (piece === REACTOR_PIECE) return undefined;
    const published = catalog?.find(
      (entry) => entry.name === piece,
    )?.publishedVersion;
    return published && published !== version
      ? `A local build; v${published} is published`
      : undefined;
  };
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
  activepieces: "Integrations",
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

// Accents dropped, as the runtime's search drops them.
function folded(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

export function queryTokens(query: string): string[] {
  return folded(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

// Every token somewhere in the text, in any order.
export function matchesQuery(text: string, tokens: string[]): boolean {
  const lowered = folded(text);
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
          <mark key={i} className="bg-transparent font-semibold text-inherit">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

const SEARCH_MIN_CHARS = 2;
const SEARCH_DEBOUNCE_MS = 250;
const INDEXING_RETRY_MS = 2000;

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  // Stale: answered for an earlier query or filter, while the current one runs.
  | { kind: "done"; result: PieceSearchResultUi; stale: boolean }
  | { kind: "error"; message: string };

type SearchAnswer =
  | { kind: "idle" }
  | { kind: "done"; key: string; result: PieceSearchResultUi }
  | { kind: "error"; key: string; message: string };

// Debounced catalog-wide search; keeps polling while the runtime indexes.
function usePieceSearch(
  query: string,
  filter: PieceSearchFilterUi | null,
): SearchState {
  const [state, setState] = useState<SearchAnswer>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const trimmed = query.trim();
  const search = usePieceSource()?.searchPieces;
  const active =
    filter !== null &&
    search !== undefined &&
    trimmed.length >= SEARCH_MIN_CHARS;
  // A key, so a filter rebuilt with the same fields does not search again.
  const filterKey = JSON.stringify(filter);
  const key = `${trimmed}\n${filterKey}`;

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- drops a finished search when the query goes inactive
      setState({ kind: "idle" });
      return;
    }
    let alive = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      search(trimmed, JSON.parse(filterKey) as PieceSearchFilterUi).then(
        (result) => {
          if (!alive) return;
          setState({ kind: "done", key, result });
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
              key,
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
  }, [active, trimmed, filterKey, key, attempt, search]);

  if (!active) return { kind: "idle" };
  // Loading through the debounce, so the browse list does not flash first.
  if (state.kind === "idle") return { kind: "loading" };
  if (state.kind === "error") {
    return state.key === key
      ? { kind: "error", message: state.message }
      : { kind: "loading" };
  }
  // The last answer stays on screen while the next one runs, marked stale.
  return { kind: "done", result: state.result, stale: state.key !== key };
}

// Arrow keys move focus along a row of buttons, wrapping at the ends.
function rovingFocus(event: React.KeyboardEvent<HTMLElement>): void {
  const delta =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (delta === 0) return;
  event.preventDefault();
  const buttons = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
  ];
  const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
  buttons.at((at + delta) % buttons.length)?.focus();
}

function Chip(props: {
  label: string;
  active: boolean;
  // The one chip Tab lands on.
  tabStop: boolean;
  onClick: (fromKeyboard: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.active}
      tabIndex={props.tabStop ? 0 : -1}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium focus-visible:outline-2 focus-visible:outline-wf-run ${
        props.active
          ? "border-wf-run/40 bg-wf-run/10 text-wf-run"
          : "border-foreground/10 text-muted-foreground hover:border-foreground/25 hover:text-foreground"
      }`}
      // A keyboard click reports no pointer clicks.
      onClick={(event) => props.onClick(event.detail === 0)}
    >
      {props.label}
    </button>
  );
}

// A scrolling row of chips that fades at an edge with more beyond it.
function ChipBar(props: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = () => {
    const element = ref.current;
    if (!element) return;
    const left = element.scrollLeft > 1;
    const right =
      element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
    setMore((previous) =>
      previous.left === left && previous.right === right
        ? previous
        : { left, right },
    );
  };
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fade = (side: "left" | "right") => (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 w-14"
      style={{
        [side]: 0,
        background: `linear-gradient(to ${side === "left" ? "right" : "left"}, var(--card), transparent)`,
      }}
    />
  );
  return (
    <div className="relative shrink-0 border-b border-foreground/10">
      <div
        ref={ref}
        role="toolbar"
        aria-label="Categories"
        className="flex gap-1.5 overflow-x-auto whitespace-nowrap px-3 py-2 [scrollbar-width:none]"
        onKeyDown={rovingFocus}
        onScroll={measure}
      >
        {props.children}
      </div>
      {more.left ? fade("left") : null}
      {more.right ? fade("right") : null}
    </div>
  );
}

// What the keys do, where they do it.
function KeyHints(props: { searching: boolean; twoPane: boolean }) {
  const hints: [string[], string][] = props.searching
    ? [
        [["↑", "↓"], "Move"],
        [["Enter"], "Select"],
        [["Esc"], "Clear"],
      ]
    : props.twoPane
      ? [
          [["↑", "↓"], "Move"],
          [["→"], "Open"],
          [["←"], "Back"],
          [["Enter"], "Select"],
          [["Esc"], "Close"],
        ]
      : [
          [["↑", "↓"], "Move"],
          [["Enter"], "Select"],
          [["Esc"], "Close"],
        ];
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center gap-4 border-t border-foreground/10 bg-foreground/[0.025] px-3 py-1.5 text-[11px] text-muted-foreground"
    >
      {hints.map(([keys, label]) => (
        <span key={label} className="flex items-center gap-1">
          {keys.map((key) => (
            <kbd
              key={key}
              className="min-w-[18px] rounded border border-b-2 border-foreground/15 bg-card px-1 text-center font-sans text-[10px] leading-4 text-foreground/80"
            >
              {key}
            </kbd>
          ))}
          {label}
        </span>
      ))}
    </div>
  );
}

function Tabs(props: {
  tabs: SourceTab[];
  active: SourceTab;
  onSelect: (tab: SourceTab, fromKeyboard: boolean) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Piece sources"
      className="inline-flex gap-0.5 rounded-md bg-foreground/[0.05] p-0.5"
      onKeyDown={(event) => {
        rovingFocus(event);
        // Following focus, as a tab list does.
        const focused = document.activeElement as HTMLElement | null;
        const tab = focused?.dataset.tab as SourceTab | undefined;
        if (tab && tab !== props.active) props.onSelect(tab, true);
      }}
    >
      {props.tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          data-tab={tab}
          aria-selected={props.active === tab}
          tabIndex={props.active === tab ? 0 : -1}
          className={`rounded px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-wf-run ${
            props.active === tab
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
          onClick={(event) => props.onSelect(tab, event.detail === 0)}
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
      role="status"
      className={`px-4 py-2.5 text-xs ${props.error ? "text-wf-fail" : "text-muted-foreground"}`}
    >
      {props.children}
    </div>
  );
}

// One pickable row, in either pane or the search list.
interface Entry {
  key: string;
  logo: React.ReactNode;
  label: string;
  description: string;
  // Why it cannot be picked; listed anyway, so the reason shows.
  unavailable?: string;
  version?: string;
  versionNote?: string;
  pick: () => void;
  // Warms what a pick needs.
  warm?: () => void;
}

type ListId = "recent" | "attach" | "core" | "powerhouse";

// A left-pane item: one of our own lists, or a catalog piece.
type Source =
  | {
      kind: "list";
      id: ListId;
      title: string;
      subtitle: string;
      // Drawn small in the list and large over its blocks.
      logo: (size: number) => React.ReactNode;
      entries: Entry[];
    }
  | { kind: "piece"; id: string; piece: PieceSummaryUi };

type SearchRow =
  | { type: "list"; source: Extract<Source, { kind: "list" }> }
  | { type: "piece"; match: PieceSearchMatchUi }
  | { type: "entry"; entry: Entry }
  | { type: "more"; pieceName: string; hidden: number };

const ROW_HEIGHT = 46;
const BLOCK_HEIGHT = 60;
// The open piece's logo, over its blocks.
const HEADER_LOGO = 36;
const HEADER_HEIGHT = 38;
const MORE_HEIGHT = 28;
// Blocks a search group shows before "more"; all of them for one or two groups.
const GROUP_BLOCKS = 4;
// Hovering a piece previews it once the pointer settles.
const HOVER_PREVIEW_MS = 120;

const searchRowHeight = (row: SearchRow) =>
  row.type === "entry"
    ? BLOCK_HEIGHT
    : row.type === "more"
      ? MORE_HEIGHT
      : HEADER_HEIGHT;
const sourceHeight = () => ROW_HEIGHT;
const entryHeight = () => BLOCK_HEIGHT;

function listTile(icon: IconName, color: string) {
  return (size: number) => <CoreTile tile={{ icon, color }} size={size} />;
}

function EntryRow(props: {
  entry: Entry;
  tokens: string[];
  active: boolean;
  option: OptionPlace;
  indent?: boolean;
  onActivate: () => void;
}) {
  const { entry } = props;
  return (
    <Row
      logo={
        props.indent ? (
          // An empty slot keeps the block indented under its piece.
          <span className="shrink-0" style={{ width: ROW_LOGO }} />
        ) : (
          entry.logo
        )
      }
      label={<Highlight text={entry.label} tokens={props.tokens} />}
      title={entry.description || entry.label}
      description={
        entry.unavailable ?? (
          <Highlight text={entry.description} tokens={props.tokens} />
        )
      }
      disabled={entry.unavailable !== undefined}
      active={props.active}
      tall
      option={props.option}
      version={entry.version}
      versionNote={entry.versionNote}
      onHover={() => {
        props.onActivate();
        if (entry.unavailable === undefined) entry.warm?.();
      }}
      onClick={entry.pick}
    />
  );
}

function SourceRow(props: {
  source: Source;
  tokens: string[];
  mode: PieceMode;
  active: boolean;
  selected: boolean;
  option: OptionPlace;
  onActivate: () => void;
  onOpen: () => void;
}) {
  const { source } = props;
  if (source.kind === "list") {
    return (
      <Row
        logo={source.logo(ROW_LOGO)}
        label={source.title}
        description={source.subtitle}
        active={props.active}
        selected={props.selected}
        option={props.option}
        onHover={props.onActivate}
        onClick={props.onOpen}
      />
    );
  }
  const { piece } = source;
  const count =
    props.mode === "triggers" ? piece.triggerCount : piece.actionCount;
  const noun = props.mode === "triggers" ? "trigger" : "action";
  return (
    <Row
      logo={
        <LogoFrame
          src={piece.logoUrl}
          alt={piece.displayName}
          size={ROW_LOGO}
        />
      }
      label={
        <>
          <Highlight text={piece.displayName} tokens={props.tokens} />
          {piece.deprecated ? " (deprecated)" : ""}
        </>
      }
      title={piece.description || piece.displayName}
      description={
        piece.unsupported ?? `${count} ${noun}${count === 1 ? "" : "s"}`
      }
      active={props.active}
      selected={props.selected}
      option={props.option}
      onHover={props.onActivate}
      onClick={props.onOpen}
    />
  );
}

// The actions or triggers of one piece, once loaded.
function usePieceEntries(
  piece: PieceSummaryUi | undefined,
  mode: PieceMode,
): {
  entries: (PieceActionUi & Partial<PieceTriggerUi>)[] | null;
  error: string | null;
} {
  const pieceSource = usePieceSource();
  const [state, setState] = useState<{
    name: string;
    entries: (PieceActionUi & Partial<PieceTriggerUi>)[] | null;
    error: string | null;
  } | null>(null);
  const name = piece?.name;

  useEffect(() => {
    if (!name || !pieceSource) return;
    let cancelled = false;
    const load =
      mode === "triggers"
        ? pieceSource.loadTriggers(name)
        : pieceSource.loadActions(name);
    load.then(
      (entries) => {
        if (!cancelled) setState({ name, entries, error: null });
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({
            name,
            entries: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [name, mode, pieceSource]);

  return state && state.name === name
    ? { entries: state.entries, error: state.error }
    : { entries: null, error: null };
}

function EntriesPane(props: {
  source: Source | undefined;
  mode: PieceMode;
  pieceEntries: Entry[] | null;
  pieceError: string | null;
  tokens: string[];
  activeIndex: number;
  listId: string;
  // Off where the source is the whole picker, as a tab already names it.
  showHeader: boolean;
  onActivate: (index: number) => void;
}) {
  const { source } = props;
  const entries = source?.kind === "list" ? source.entries : props.pieceEntries;
  const kind = props.mode === "triggers" ? "trigger" : "action";
  const title =
    source?.kind === "list" ? source.title : source?.piece.displayName;
  const about =
    source?.kind === "list" ? source.subtitle : source?.piece.description;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {source && props.showHeader ? (
        <div className="flex shrink-0 items-start gap-3 border-b border-foreground/10 px-4 py-3">
          <span aria-hidden="true" className="contents">
            {source.kind === "list" ? (
              source.logo(HEADER_LOGO)
            ) : (
              <LogoFrame src={source.piece.logoUrl} alt="" size={HEADER_LOGO} />
            )}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-5 text-foreground">
              {title}
            </div>
            {about ? (
              <div
                className="line-clamp-2 text-xs leading-4 text-muted-foreground"
                title={about}
              >
                {about}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {!source ? (
        <Status>Pick a piece to see its {kind}s</Status>
      ) : props.pieceError ? (
        <Status error>{props.pieceError}</Status>
      ) : entries === null ? (
        <Status>Loading…</Status>
      ) : entries.length === 0 ? (
        <Status>No {kind}s</Status>
      ) : (
        <VirtualList
          id={props.listId}
          resetKey={source.id}
          label={`${title ?? ""} ${kind}s`}
          className="flex-1 py-1"
          items={entries}
          heightOf={entryHeight}
          keyOf={(entry) => entry.key}
          activeIndex={props.activeIndex}
          render={(entry, index) => (
            <EntryRow
              entry={entry}
              tokens={props.tokens}
              active={index === props.activeIndex}
              option={{ list: props.listId, index, size: entries.length }}
              onActivate={() => props.onActivate(index)}
            />
          )}
        />
      )}
    </div>
  );
}

function SearchList(props: {
  rows: SearchRow[];
  tokens: string[];
  activeIndex: number;
  onActivate: (index: number) => void;
  onOpenPiece: (pieceName: string) => void;
  onOpenList: (id: ListId) => void;
  onExpand: (pieceName: string) => void;
  status: React.ReactNode;
  // "action" or "trigger", for the heading's link.
  kind: string;
  listId: string;
  resetKey: string;
  stale: boolean;
}) {
  const size = props.rows.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {props.status}
      <VirtualList
        id={props.listId}
        label="Search results"
        resetKey={props.resetKey}
        className={`flex-1 py-1 ${props.stale ? "opacity-60" : ""}`}
        items={props.rows}
        heightOf={searchRowHeight}
        keyOf={(row, index) =>
          row.type === "entry"
            ? `e:${row.entry.key}`
            : row.type === "piece"
              ? `p:${row.match.pieceName}`
              : row.type === "list"
                ? `l:${row.source.id}`
                : `m:${row.pieceName}:${index}`
        }
        activeIndex={props.activeIndex}
        render={(row, index) => {
          const active = index === props.activeIndex;
          const activate = () => props.onActivate(index);
          const option = { list: props.listId, index, size };
          if (row.type === "entry") {
            return (
              <EntryRow
                entry={row.entry}
                tokens={props.tokens}
                active={active}
                option={option}
                indent
                onActivate={activate}
              />
            );
          }
          if (row.type === "more") {
            return (
              <div
                {...optionAttributes(option)}
                role="option"
                aria-selected={active}
                className={`mx-1.5 my-px flex h-[calc(100%-2px)] cursor-pointer items-center rounded-md pl-[42px] text-xs text-muted-foreground hover:text-foreground ${rowTone(active)}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={activate}
                onClick={() => props.onExpand(row.pieceName)}
              >
                {row.hidden} more…
              </div>
            );
          }
          const header =
            row.type === "piece"
              ? {
                  logo: (
                    <LogoFrame
                      src={row.match.logoUrl}
                      alt={row.match.displayName}
                      size={20}
                    />
                  ),
                  label: row.match.displayName,
                  note: row.match.deprecated
                    ? "Deprecated"
                    : (row.match.unsupported ?? undefined),
                  kind: props.kind,
                  open: () => props.onOpenPiece(row.match.pieceName),
                }
              : {
                  logo: row.source.logo(20),
                  label: row.source.title,
                  note: undefined,
                  kind: props.kind,
                  open: () => props.onOpenList(row.source.id),
                };
          return (
            <div
              {...optionAttributes(option)}
              role="option"
              aria-selected={active}
              title={`Open ${header.label}`}
              className={`group mx-1.5 mt-1 flex h-[calc(100%-4px)] cursor-pointer items-center gap-2.5 rounded-md px-2 text-left ${rowTone(active)}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={activate}
              onClick={header.open}
            >
              <span aria-hidden="true" className="contents">
                {header.logo}
              </span>
              <span className="truncate text-[13px] font-semibold text-foreground">
                <Highlight text={header.label} tokens={props.tokens} />
              </span>
              {header.note ? (
                <span className="truncate text-[11px] text-muted-foreground">
                  {header.note}
                </span>
              ) : null}
              <span
                className={`ml-auto flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground ${
                  active ? "" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                All {header.kind}s
                <Icon name="chevron" size={12} />
              </span>
            </div>
          );
        }}
      />
    </div>
  );
}

export function BlockSelector(props: {
  title: string;
  presets: BlockPreset[];
  onPick: (preset: PickedPreset) => void;
  onClose: () => void;
  // Show the piece catalog beside the presets.
  showPieces?: boolean;
  // Which piece entries the picker offers; defaults to actions.
  pieceMode?: PieceMode;
  // Detached steps offered for re-attachment at this insertion point.
  attachSteps?: StepModel[];
  onAttach?: (stepId: string) => void;
  // The button that opened it: clicks there are its own to handle.
  anchor?: RefObject<HTMLElement | null>;
  width?: number;
  height?: number;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SourceTab>("all");
  const [chip, setChip] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paneState, setPane] = useState<"sources" | "entries">("sources");
  const [entryIndex, setEntryIndex] = useState(-1);
  const [rowIndex, setRowIndex] = useState(-1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listIds = {
    sources: `${baseId}-sources`,
    entries: `${baseId}-entries`,
    results: `${baseId}-results`,
  };
  // Hover only counts once the pointer has moved, so a list scrolling under
  // a still pointer does not steal the selection.
  const pointerMoved = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const { anchor, onClose } = props;

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      const target = event.target as globalThis.Node;
      if (containerRef.current?.contains(target)) return;
      // The opener toggles the picker itself.
      if (anchor?.current?.contains(target)) return;
      onClose();
    };
    // Capture: the canvas pan handler stops the event before it bubbles.
    window.addEventListener("pointerdown", handler, true);
    return () => window.removeEventListener("pointerdown", handler, true);
  }, [anchor, onClose]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

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
    if (!block) return;
    rememberPick(preset);
    props.onPick({ ...preset, block });
  };
  const prefetch = useBlockFormPrefetch();

  const mode: PieceMode = props.pieceMode ?? "actions";
  const kind = mode === "triggers" ? "trigger" : "action";
  const tokens = queryTokens(query);
  const searching = query.trim().length >= SEARCH_MIN_CHARS;
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
  // Categories narrow catalogs; All and Core lead with our own lists. One
  // chip has nothing to narrow.
  const showChips =
    showCatalog &&
    (tab === "activepieces" || tab === "powerhouse") &&
    chips.length > 1;
  const activeChip =
    showChips && chip !== null && chips.includes(chip) ? chip : null;

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
  const search = usePieceSearch(query, searchFilter);

  const presetEntry = (preset: BlockPreset): Entry => {
    const block = pinned(preset);
    return {
      key: `${blockKey(preset.block)} ${preset.label}`,
      logo: <BlockLogo block={preset.block} size={ROW_LOGO} />,
      label: preset.label,
      description: preset.description,
      unavailable: block
        ? undefined
        : catalog === null
          ? "Loading…"
          : "Not installed on this runtime",
      version: shownVersion(preset.block.pieceName, block?.pieceVersion),
      versionNote: versionNote(preset.block.pieceName, block?.pieceVersion),
      pick: () => pick(preset),
      warm: block ? () => prefetch(block) : undefined,
    };
  };

  const blockEntry = (
    entry: {
      pieceName: string;
      pieceVersion: string;
      name: string;
      displayName: string;
      description: string;
      unsupported?: string | null;
      strategy?: string | null;
    },
    logo: React.ReactNode,
  ): Entry => {
    const block: BlockRef = {
      pieceName: entry.pieceName,
      pieceVersion: entry.pieceVersion,
      kind,
      name: entry.name,
    };
    return {
      key: blockKey(block),
      logo,
      label: entry.displayName,
      description: entry.description,
      // Visible but inert: picking one would build a step that never runs.
      unavailable: blockUnavailable({ ...entry, kind }),
      version: shownVersion(entry.pieceName, entry.pieceVersion),
      versionNote: versionNote(entry.pieceName, entry.pieceVersion),
      pick: () =>
        pick({
          label: entry.displayName,
          block,
          description: entry.description,
          defaultConfig: {},
        }),
      warm: () => prefetch(block),
    };
  };

  // Our own lists, each a source in the left pane. A chip narrows to pieces.
  const lists = (() => {
    if (activeChip !== null) return [];
    const result: Extract<Source, { kind: "list" }>[] = [];
    const add = (
      id: ListId,
      title: string,
      subtitle: string,
      logo: (size: number) => React.ReactNode,
      entries: Entry[],
    ) => {
      if (entries.length > 0) {
        result.push({ kind: "list", id, title, subtitle, logo, entries });
      }
    };
    // Detached steps first: re-attaching is why the picker opened there.
    if (tab === "all") {
      if (props.onAttach) {
        add(
          "attach",
          "Detached steps",
          "Re-attach a step at this point",
          listTile("branch", "#64748b"),
          (props.attachSteps ?? []).map((step) => ({
            key: `attach ${step.id}`,
            logo: <BlockLogo block={stepBlock(step)} size={ROW_LOGO} />,
            label: step.name,
            description: `{{steps.${step.key}}} · detached`,
            pick: () => props.onAttach?.(step.id),
          })),
        );
      }
    }
    if (tab === "all" || tab === "core") {
      add(
        "core",
        "Core",
        "Built into the workflow engine",
        listTile("bolt", "#2563eb"),
        props.presets
          .filter((preset) => preset.group !== "powerhouse")
          .map(presetEntry),
      );
    }
    if (tab === "all" || tab === "powerhouse") {
      const reactorPreset = props.presets.find(
        (preset) => preset.group === "powerhouse",
      );
      add(
        "powerhouse",
        "Documents",
        "Read and change documents on this reactor",
        (size) =>
          reactorPreset ? (
            <BlockLogo block={reactorPreset.block} size={size} />
          ) : null,
        props.presets
          .filter((preset) => preset.group === "powerhouse")
          .map(presetEntry),
      );
    }
    if (tab === "all") {
      const recent = recentPicks(kind).filter(
        (preset) =>
          isCoreBlock(preset.block) || installed(preset.block.pieceName),
      );
      add(
        "recent",
        "Recently used",
        `Your last ${kind}s`,
        listTile("clock", "#64748b"),
        recent.map((preset) => {
          const entry = presetEntry(preset);
          // A piece this runtime has since stopped running stays inert.
          const reason = catalog?.pieces.find(
            (piece) => piece.name === preset.block.pieceName,
          )?.unsupported;
          return reason ? { ...entry, unavailable: reason } : entry;
        }),
      );
    }
    return result;
  })();

  // Browse: lists then pieces, narrowed by a short query on the client.
  const sources = ((): Source[] => {
    const listSources = lists
      .map((list) => ({
        ...list,
        entries: list.entries.filter((entry) =>
          matchesQuery(`${entry.label} ${entry.description}`, tokens),
        ),
      }))
      .filter((list) => list.entries.length > 0);
    const pieceSources: Source[] = showCatalog
      ? tabPieces
          .filter(
            (entry) =>
              (activeChip === null || chipsOf(entry).has(activeChip)) &&
              matchesQuery(
                `${entry.displayName} ${entry.name} ${entry.description}`,
                tokens,
              ),
          )
          .map((piece) => ({ kind: "piece", id: piece.name, piece }))
      : [];
    return [...listSources, ...pieceSources];
  })();

  const selected: Source | undefined =
    sources.find((source) => source.id === selectedId) ?? sources.at(0);
  const sourceIndex = selected ? sources.indexOf(selected) : -1;
  const selectedPiece = selected?.kind === "piece" ? selected.piece : undefined;
  const loaded = usePieceEntries(selectedPiece, mode);
  const pieceEntries =
    selectedPiece && loaded.entries
      ? loaded.entries.map((entry) =>
          blockEntry(
            entry,
            <LogoFrame
              src={selectedPiece.logoUrl}
              alt={selectedPiece.displayName}
              size={ROW_LOGO}
            />,
          ),
        )
      : null;
  const entries =
    selected?.kind === "list" ? selected.entries : (pieceEntries ?? []);
  // The keyboard's block, once the list it points into has loaded.
  const entryAt =
    entries.length === 0 ? -1 : Math.min(entryIndex, entries.length - 1);

  // Search: our lists that match, then the server's groups.
  const presetKeys = new Set(
    props.presets.map(
      (preset) => `${preset.block.pieceName} ${preset.block.name}`,
    ),
  );
  const rows: SearchRow[] = [];
  if (searching) {
    for (const source of sources) {
      if (source.kind !== "list" || source.id === "recent") continue;
      rows.push({ type: "list", source });
      for (const entry of source.entries) rows.push({ type: "entry", entry });
    }
    const groups =
      search.kind === "done"
        ? search.result.pieces
            .map((match) => ({
              ...match,
              // A block a preset offers is listed once, as the preset.
              blocks: match.blocks.filter(
                (hit) => !presetKeys.has(`${hit.pieceName} ${hit.name}`),
              ),
            }))
            .filter((match) => match.blocks.length > 0)
        : [];
    for (const match of groups) {
      rows.push({ type: "piece", match });
      const all = groups.length <= 2 || expanded.has(match.pieceName);
      const shown = all ? match.blocks : match.blocks.slice(0, GROUP_BLOCKS);
      const logo = (
        <LogoFrame
          src={match.logoUrl}
          alt={match.displayName}
          size={ROW_LOGO}
        />
      );
      for (const hit of shown) {
        rows.push({ type: "entry", entry: blockEntry(hit, logo) });
      }
      if (shown.length < match.blocks.length) {
        rows.push({
          type: "more",
          pieceName: match.pieceName,
          hidden: match.blocks.length - shown.length,
        });
      }
    }
    // A source that cannot search, or an index still building, falls back to
    // matching the catalog's piece names.
    const partial =
      !pieceSource?.searchPieces ||
      (search.kind === "done" && search.result.status !== "ready");
    if (showCatalog && partial) {
      const grouped = new Set(groups.map((match) => match.pieceName));
      // Names that match ahead of descriptions that mention them.
      const named = (source: Source) =>
        source.kind === "piece" &&
        matchesQuery(source.piece.displayName, tokens)
          ? 0
          : 1;
      for (const source of [...sources].sort((a, b) => named(a) - named(b))) {
        if (source.kind !== "piece" || grouped.has(source.id)) continue;
        rows.push({
          type: "piece",
          match: {
            pieceName: source.piece.name,
            pieceVersion: source.piece.version ?? "",
            displayName: source.piece.displayName,
            description: source.piece.description,
            logoUrl: source.piece.logoUrl,
            categories: source.piece.categories,
            source: source.piece.source ?? "activepieces",
            namedPiece: true,
            blocks: [],
          },
        });
      }
    }
  }

  // Until the keyboard moves, the best block: Enter picks it.
  const activeRow =
    rowIndex < 0
      ? rows.findIndex((row) => row.type === "entry")
      : Math.min(rowIndex, rows.length - 1);

  // One source needs no list to choose from; its blocks fill the picker.
  const twoPane = showCatalog || sources.length > 1;
  const pane = twoPane ? paneState : "entries";

  const selectSource = (id: string) => {
    setSelectedId(id);
    setPane("sources");
    setEntryIndex(-1);
  };
  const openSource = (id: string) => {
    setSelectedId(id);
    setPane("entries");
    setEntryIndex(0);
  };
  // From a search group to the piece itself, in the browse panes.
  const openPiece = (pieceName: string) => {
    // Not in the browse list (the catalog lacks it): show its blocks here.
    if (!modePieces.some((piece) => piece.name === pieceName)) {
      setExpanded(new Set([...expanded, pieceName]));
      return;
    }
    setQuery("");
    setChip(null);
    if (tab !== "all") setTab("all");
    openSource(pieceName);
    inputRef.current?.focus();
  };
  const hoverSource = (id: string) => {
    if (!pointerMoved.current) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => selectSource(id), HOVER_PREVIEW_MS);
  };

  // An empty list (a piece's blocks still loading) keeps the position.
  const step = (index: number, delta: number, count: number) =>
    count === 0 ? index : Math.min(Math.max(index + delta, 0), count - 1);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const key = event.key;
    // Tabs and chips handle their own keys; the lists answer the search box.
    if (key !== "Escape" && event.target !== inputRef.current) return;
    if (key === "Escape") {
      event.stopPropagation();
      if (query !== "") setQuery("");
      else if (twoPane && pane === "entries" && !searching) setPane("sources");
      else onClose();
      return;
    }
    const delta = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0;
    if (searching) {
      if (delta !== 0) {
        event.preventDefault();
        setRowIndex(Math.max(step(activeRow, delta, rows.length), 0));
        return;
      }
      if (key === "Enter") {
        event.preventDefault();
        // Rows answered for an earlier query are not what Enter means.
        if (search.kind === "done" && search.stale) return;
        const row = rows.at(activeRow);
        if (!row) return;
        if (row.type === "entry") {
          if (row.entry.unavailable === undefined) row.entry.pick();
        } else if (row.type === "piece") openPiece(row.match.pieceName);
        else if (row.type === "list") openSource(row.source.id);
        else setExpanded(new Set([...expanded, row.pieceName]));
      }
      return;
    }
    // Left and right move the caret while there is text to move it in.
    const sideways = query === "";
    if (pane === "sources") {
      if (delta !== 0) {
        event.preventDefault();
        const next = sources.at(step(sourceIndex, delta, sources.length));
        if (next) selectSource(next.id);
      } else if (key === "Enter" || (sideways && key === "ArrowRight")) {
        event.preventDefault();
        if (selected) openSource(selected.id);
      }
      return;
    }
    if (delta !== 0) {
      event.preventDefault();
      setEntryIndex(step(entryIndex, delta, entries.length));
    } else if (sideways && key === "ArrowLeft") {
      event.preventDefault();
      setPane("sources");
    } else if (key === "Enter") {
      event.preventDefault();
      const entry = entryAt < 0 ? undefined : entries.at(entryAt);
      if (entry && entry.unavailable === undefined) entry.pick();
    }
  };

  const width = props.width ?? (pieceSource ? PICKER_SIZE.width : 360);
  const activeList = searching
    ? listIds.results
    : pane === "entries"
      ? listIds.entries
      : listIds.sources;
  const activeIndex = searching
    ? activeRow
    : pane === "entries"
      ? entryAt
      : sourceIndex;
  const activeOption =
    activeIndex >= 0 ? optionId(activeList, activeIndex) : undefined;
  const searchStatus =
    search.kind === "loading" || (search.kind === "done" && search.stale) ? (
      <Status>Searching…</Status>
    ) : search.kind === "error" ? (
      <Status error>{search.message}</Status>
    ) : search.kind === "done" && search.result.status === "indexing" ? (
      // Status covers the published catalog only; local pieces are listed.
      <Status>
        Still indexing the catalog: pieces are matched by name until it is
        ready.
      </Status>
    ) : search.kind === "done" && search.result.status === "error" ? (
      <Status error>
        {search.result.error ?? "Search failed"}; pieces are matched by name.
      </Status>
    ) : rows.length === 0 ? (
      <Status>No matching {kind}s</Status>
    ) : null;
  // Fitted to its content where one short list is all there is to show.
  const compact = !twoPane && !searching;
  const height = props.height ?? PICKER_SIZE.height;

  return (
    <div
      ref={containerRef}
      className="nodrag nopan nowheel flex flex-col overflow-hidden rounded-lg border border-solid border-foreground/10 bg-card shadow-xl"
      style={compact ? { width, maxHeight: height } : { width, height }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={onKeyDown}
      onMouseMove={() => {
        pointerMoved.current = true;
      }}
    >
      <div className="shrink-0 border-b border-foreground/10">
        <div className="flex items-center gap-2 px-3.5 pt-3 text-muted-foreground">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            autoFocus
            role="combobox"
            aria-expanded
            aria-autocomplete="list"
            aria-label={`Search ${props.title.toLowerCase()}`}
            aria-controls={activeList}
            aria-activedescendant={activeOption}
            // Always focused while open; the caret is its focus indicator.
            className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder={
              pieceSource ? `Search pieces and ${kind}s…` : "Search…"
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setRowIndex(-1);
              setExpanded(new Set());
            }}
          />
          <span className="shrink-0 truncate text-xs">{props.title}</span>
        </div>
        <div className="px-3 pb-2.5 pt-2">
          <Tabs
            tabs={tabs}
            active={tab}
            onSelect={(next, fromKeyboard) => {
              setTab(next);
              setChip(null);
              setSelectedId(null);
              setPane("sources");
              if (!fromKeyboard) inputRef.current?.focus();
            }}
          />
        </div>
      </div>
      {showChips && catalog && !catalog.error ? (
        <ChipBar>
          {chips.map((label, index) => (
            <Chip
              key={label}
              label={label}
              active={activeChip === label}
              tabStop={activeChip === null ? index === 0 : activeChip === label}
              onClick={(fromKeyboard) => {
                setChip(activeChip === label ? null : label);
                setSelectedId(null);
                if (!fromKeyboard) inputRef.current?.focus();
              }}
            />
          ))}
        </ChipBar>
      ) : null}
      {searching ? (
        <SearchList
          rows={rows}
          tokens={tokens}
          activeIndex={activeRow}
          onActivate={(index) => {
            if (pointerMoved.current) setRowIndex(index);
          }}
          onOpenPiece={openPiece}
          onOpenList={(id) => {
            setQuery("");
            openSource(id);
          }}
          onExpand={(name) => setExpanded(new Set([...expanded, name]))}
          status={searchStatus}
          kind={kind}
          listId={listIds.results}
          resetKey={`${query} ${JSON.stringify(searchFilter)}`}
          stale={search.kind === "done" && search.stale}
        />
      ) : (
        <div className="flex min-h-0 flex-1">
          {twoPane ? (
            // A tinted rail, so the open piece can sit raised on it.
            <div className="flex w-56 shrink-0 flex-col border-r border-foreground/10 bg-foreground/[0.025]">
              {catalog?.error ? (
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
              ) : null}
              <VirtualList
                id={listIds.sources}
                label="Pieces"
                resetKey={`${tab} ${activeChip ?? ""} ${query}`}
                className="flex-1 py-1"
                items={sources}
                heightOf={sourceHeight}
                keyOf={(source) => `${source.kind}:${source.id}`}
                activeIndex={sourceIndex}
                render={(source, index) => (
                  <SourceRow
                    source={source}
                    tokens={tokens}
                    mode={mode}
                    active={pane === "sources" && index === sourceIndex}
                    selected={index === sourceIndex}
                    option={{
                      list: listIds.sources,
                      index,
                      size: sources.length,
                    }}
                    onActivate={() => hoverSource(source.id)}
                    onOpen={() => {
                      clearTimeout(hoverTimer.current);
                      openSource(source.id);
                      inputRef.current?.focus();
                    }}
                  />
                )}
              />
              {showCatalog && catalog === null ? (
                <Status>Loading catalog…</Status>
              ) : sources.length === 0 ? (
                <Status>
                  {tab === "powerhouse" && tokens.length === 0
                    ? "No registry pieces on this runtime"
                    : "No matching pieces"}
                </Status>
              ) : null}
            </div>
          ) : null}
          <EntriesPane
            source={selected}
            mode={mode}
            pieceEntries={pieceEntries}
            pieceError={selected?.kind === "piece" ? loaded.error : null}
            tokens={tokens}
            activeIndex={pane === "entries" ? entryAt : -1}
            listId={listIds.entries}
            showHeader={twoPane}
            onActivate={(index) => {
              if (!pointerMoved.current) return;
              setPane("entries");
              setEntryIndex(index);
            }}
          />
        </div>
      )}
      <KeyHints searching={searching} twoPane={twoPane} />
    </div>
  );
}

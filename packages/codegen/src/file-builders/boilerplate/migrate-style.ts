import {
  HOST_STYLESHEET,
  projectStyle,
  STYLE_IMPORT_LINES,
  TAILWIND_IMPORT,
} from "@powerhousedao/shared/clis/package-style";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import postcss, {
  type ChildNode,
  type Declaration,
  type Root,
  type Rule,
} from "postcss";
import { hostStyleTemplate, styleTemplate } from "templates";

/** style.css with Connect's imports replaced by the template's, keeping the
 * project's own rules; the template when there's no style.css. */
export function migratedStyle(
  current: string | undefined,
  localPackages: readonly string[] = [],
): string {
  if (current === undefined) return styleTemplate;
  const { tailwind, rest } = projectStyle(current, localPackages);
  const imports = STYLE_IMPORT_LINES.map((line) =>
    TAILWIND_IMPORT.test(line) && tailwind ? tailwind : line,
  ).join("\n");
  return rest ? `${imports}\n\n${rest}\n` : `${imports}\n`;
}

// The tokens Connect's theme sets on :root and .dark: the design system's and core's.
export const CONNECT_THEME_TOKENS = new Set(
  [
    ...["background", "foreground", "card", "card-foreground", "popover"],
    ...["popover-foreground", "primary", "primary-foreground", "secondary"],
    ...["secondary-foreground", "muted", "muted-foreground", "accent"],
    ...["accent-foreground", "border", "input", "ring", "hover", "active"],
    ...["disabled", "destructive", "destructive-foreground", "info"],
    ...["info-foreground", "success", "success-foreground", "warning"],
    ...["warning-foreground", "chart-1", "chart-2", "chart-3", "chart-4"],
    ...["chart-5", "sidebar", "sidebar-foreground", "sidebar-primary"],
    ...["sidebar-primary-foreground", "sidebar-accent"],
    ...["sidebar-accent-foreground", "sidebar-border", "sidebar-ring"],
    ...["ph-core-bg", "ph-core-fg", "ph-core-muted", "ph-core-border"],
    ...["ph-core-hover", "ph-core-link", "ph-core-string", "ph-core-number"],
    "ph-core-danger",
  ].map((name) => `--${name}`),
);

// :root, html or :host, a .dark or [data-theme] on them, or either alone.
const THEME_SELECTOR =
  /^(?:(?::root|html|:host)(?:\.dark|\[data-theme[^\]]*\])?|\.dark|\[data-theme[^\]]*\])$/;
const GLOBAL_SELECTOR = /^(?:html|body)\b/;

export type ThemeOverride = {
  selector: string;
  tokens: string[];
  /** Why ph migrate left it in style.css. */
  reason?: string;
};

export type ConnectThemeMove = {
  style: string;
  /** The host's stylesheet with the moved rules; undefined when nothing moved. */
  host: string | undefined;
  moved: ThemeOverride[];
  left: ThemeOverride[];
  /** Global rules (html, body) that ship with the package. */
  globals: string[];
  /** Why style.css or the host's stylesheet couldn't be read as CSS. */
  unparsed?: string;
};

const normalize = (selector: string) => selector.replace(/\s+/g, " ").trim();
const isTheme = (selector: string) => THEME_SELECTOR.test(normalize(selector));

// A declaration and the comments right above it.
function withComments(node: ChildNode): ChildNode[] {
  const nodes = [node];
  for (let prev = node.prev(); prev?.type === "comment"; prev = prev.prev()) {
    nodes.unshift(prev);
  }
  return nodes;
}

// Declarations or bodyless at-rules: the template's empty rules are not the host's own.
function hasOwnRules(host: Root) {
  let own = false;
  host.walk((node) => {
    if (node.type === "decl" || (node.type === "atrule" && !node.nodes)) {
      own = true;
    }
  });
  return own;
}

// The rule's declarations go into the host's rule with the same selector, or a
// new one after the last placed (before @theme otherwise); comments above it too.
function placeIn(
  host: Root,
  rule: Rule,
  leading: ChildNode[],
  after: ChildNode | undefined,
) {
  const same = host.nodes.find(
    (node): node is Rule =>
      node.type === "rule" &&
      normalize(node.selector) === normalize(rule.selector),
  );
  if (same) {
    same.append([...leading, ...rule.nodes].map((node) => node.clone()));
    return same;
  }
  const placed = rule.clone();
  const theme = host.nodes.find((node) => node.type === "atrule");
  if (after) host.insertAfter(after, placed);
  else if (theme) host.insertBefore(theme, placed);
  else host.append(placed);
  for (const comment of leading) host.insertBefore(placed, comment.clone());
  return placed;
}

/** Connect's theme tokens in style.css, which ph build ships to every Connect
 * that loads the package. They move to the host's stylesheet when it has no
 * rules of its own; otherwise, or when a rule is nested or shares its selector
 * with other elements, they stay and are reported. */
export function moveConnectTheme(
  style: string,
  host: string | undefined,
): ConnectThemeMove {
  let root: Root, hostRoot: Root;
  try {
    root = postcss.parse(style);
    hostRoot = postcss.parse(host ?? hostStyleTemplate);
  } catch (error) {
    const unparsed = error instanceof Error ? error.message : String(error);
    return {
      style,
      host: undefined,
      moved: [],
      left: [],
      globals: [],
      unparsed,
    };
  }
  const hostReason = hasOwnRules(hostRoot)
    ? `${HOST_STYLESHEET} has rules of its own`
    : undefined;
  const moved: ThemeOverride[] = [];
  const left: ThemeOverride[] = [];
  const globals: string[] = [];
  let after: ChildNode | undefined;

  root.walkRules((rule) => {
    const selectors = rule.selectors.map(normalize);
    if (
      selectors.some((selector) => GLOBAL_SELECTOR.test(selector)) &&
      rule.some((node) => node.type === "decl" && !node.prop.startsWith("--"))
    ) {
      globals.push(normalize(rule.selector));
    }
    if (!selectors.some(isTheme)) return;
    const decls = rule.nodes.filter(
      (node): node is Declaration =>
        node.type === "decl" && CONNECT_THEME_TOKENS.has(node.prop),
    );
    if (decls.length === 0) return;
    const override = {
      selector: normalize(rule.selector),
      tokens: decls.map((decl) => decl.prop),
    };
    const parent = rule.parent;
    const reason =
      parent?.type === "atrule"
        ? `inside @${parent.name} ${parent.params}`.trim()
        : parent?.type !== "root"
          ? "nested in another rule"
          : !selectors.every(isTheme)
            ? "its selector targets other elements too"
            : hostReason;
    if (reason) {
      left.push({ ...override, reason });
      return;
    }
    const nodes = decls.flatMap(withComments);
    const whole = rule.nodes.every((node) => nodes.includes(node));
    const leading = whole ? withComments(rule).slice(0, -1) : [];
    const taken = rule.clone();
    taken.removeAll();
    taken.append(nodes.map((node) => node.clone()));
    after = placeIn(hostRoot, taken, leading, after);
    for (const node of whole ? [...leading, rule] : nodes) node.remove();
    moved.push(override);
  });

  return {
    style: moved.length ? root.toString() : style,
    host: moved.length ? hostRoot.toString() : undefined,
    moved,
    left,
    globals,
  };
}

const listed = (overrides: ThemeOverride[]) =>
  overrides
    .map(({ selector, tokens, reason }) => {
      const where = `${selector} (${tokens.join(", ")})`;
      return reason ? `${where}: ${reason}` : where;
    })
    .join("; ");

/** What moveConnectTheme did and what it left, as messages for the console. */
export function connectThemeMessages({
  moved,
  left,
  globals,
  unparsed,
}: ConnectThemeMove) {
  const info: string[] = [];
  const warnings: string[] = [];
  if (unparsed) {
    warnings.push(
      `Couldn't check style.css for Connect's theme (${unparsed}). Tokens it sets ` +
        `ship to every Connect that loads the package; keep this Connect's in ${HOST_STYLESHEET}.`,
    );
  }
  if (moved.length) {
    info.push(
      `Moved Connect's theme from style.css to ${HOST_STYLESHEET}, so it no longer ` +
        `ships in the package's stylesheet: ${listed(moved)}.`,
    );
  }
  if (left.length) {
    warnings.push(
      "style.css sets Connect's theme tokens, which ph build ships to every Connect " +
        `that loads the package. Move them to ${HOST_STYLESHEET}: ${listed(left)}.`,
    );
  }
  if (globals.length) {
    warnings.push(
      `style.css has global rules (${globals.join(", ")}), which ph build ships to ` +
        `every Connect that loads the package. Move this Connect's to ${HOST_STYLESHEET}.`,
    );
  }
  return { info, warnings };
}

export function readStyle(projectDir: string): string | undefined {
  const file = join(projectDir, "style.css");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

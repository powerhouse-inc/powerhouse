import { isDeepStrictEqual } from "node:util";

/**
 * Parity gates: one observation from the classic command and one from the
 * hosts path, compared leaf by leaf against a reviewed list of differences.
 * A gate passes while the two differ exactly as listed. It fails on a
 * difference nobody listed, on a listed difference that no longer shows, and
 * on a listed difference whose pinned sides changed.
 *
 * Nothing here knows what is observed (a service call, a file, a request):
 * a later effect-level gate uses the same three steps, `shapeOf` on each
 * side, `diffShapes`, `expectOnlyAllowedDifferences`.
 */

/** The side that has no value at a path. */
export const ABSENT = "<absent>";
/** A value that is there and not compared (a logger, a resolved plugin). */
export const OPAQUE = "<opaque>";

/** Leaf path to its rendered value. */
export type Shape = Map<string, string>;

export interface ShapeOptions {
  /** Paths rendered as `OPAQUE` when they hold a value: only the presence
   * is compared. `undefined` and `null` stay themselves. */
  opaque?: readonly string[];
  /** Applied to every string leaf and every key, before rendering: what
   * differs between two runs for no reason of the code (a temp dir). */
  normalize?: (text: string) => string;
}

export interface Difference {
  path: string;
  classic: string;
  hosts: string;
}

/** One reviewed difference, or several with one cause. */
export interface AllowedDifference {
  /** The leaf paths it covers. A trailing `.*` covers everything below. */
  paths: readonly string[];
  /** One line: why the two paths differ here. */
  reason: string;
  /** The rendered classic side of every path, when pinned. */
  classic?: string;
  /** The rendered hosts side of every path, when pinned. */
  hosts?: string;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * The leaves of a value. `undefined` is a leaf (a key passed as `undefined`
 * is not a key left out), as are an empty object and an empty array. A Map
 * reads as an object, a function as `<function>`, a promise as `<promise>`,
 * and any other class instance as `<ClassName>`.
 */
export function shapeOf(value: unknown, options: ShapeOptions = {}): Shape {
  const opaque = new Set(options.opaque ?? []);
  const normalize = options.normalize ?? ((text: string) => text);
  const shape: Shape = new Map();
  const visit = (current: unknown, path: string): void => {
    if (current === undefined) {
      shape.set(path, "undefined");
      return;
    }
    if (current === null) {
      shape.set(path, "null");
      return;
    }
    if (opaque.has(path)) {
      shape.set(path, OPAQUE);
      return;
    }
    if (typeof current === "string") {
      shape.set(path, JSON.stringify(normalize(current)));
      return;
    }
    if (typeof current === "function") {
      shape.set(path, "<function>");
      return;
    }
    if (typeof current !== "object") {
      shape.set(path, String(current as number | boolean | bigint | symbol));
      return;
    }
    if (current instanceof Promise) {
      shape.set(path, "<promise>");
      return;
    }
    const below = (key: string) => (path === "" ? key : `${path}.${key}`);
    if (Array.isArray(current)) {
      if (current.length === 0) shape.set(path, "[]");
      current.forEach((item, index) => visit(item, below(String(index))));
      return;
    }
    const entries: [string, unknown][] | undefined =
      current instanceof Map
        ? [...current.entries()].map(([key, item]) => [String(key), item])
        : isPlainObject(current)
          ? Object.entries(current)
          : undefined;
    if (entries === undefined) {
      shape.set(path, `<${current.constructor.name}>`);
      return;
    }
    if (entries.length === 0) shape.set(path, "{}");
    for (const [key, item] of entries) visit(item, below(normalize(key)));
  };
  visit(value, "");
  return shape;
}

const EMPTY = new Set(["{}", "[]"]);

function hasLeavesBelow(shape: Shape, path: string): boolean {
  for (const key of shape.keys()) {
    if (key.startsWith(`${path}.`)) return true;
  }
  return false;
}

/**
 * Every path whose two sides differ, sorted by path. An empty container on
 * one side whose other side has leaves below is not reported itself: those
 * leaves are, each as absent on the empty side.
 */
export function diffShapes(classic: Shape, hosts: Shape): Difference[] {
  const paths = [...new Set([...classic.keys(), ...hosts.keys()])].sort();
  return paths.flatMap((path) => {
    const left = classic.get(path) ?? ABSENT;
    const right = hosts.get(path) ?? ABSENT;
    if (left === right) return [];
    if (EMPTY.has(left) && right === ABSENT && hasLeavesBelow(hosts, path)) {
      return [];
    }
    if (EMPTY.has(right) && left === ABSENT && hasLeavesBelow(classic, path)) {
      return [];
    }
    return [{ path, classic: left, hosts: right }];
  });
}

/** One fact that a path carries at another place than the other path does. */
export interface Relocation {
  /** Where this side has it: a leaf, or the root of a subtree. */
  from: string;
  /** Where the other side has it. */
  to: string;
  /** One line: why the two places are the same fact. */
  reason: string;
}

/**
 * The shape with every relocated leaf at the other side's place, so that
 * `diffShapes` compares the two values: a drift in either fails as an
 * unlisted difference. Throws on a relocation that moves nothing (the fact
 * is no longer where the list says) and on one that would overwrite a leaf.
 */
export function relocate(
  shape: Shape,
  relocations: readonly Relocation[],
): Shape {
  const moved: Shape = new Map();
  const taken = new Set<string>();
  for (const { from, to } of relocations) {
    const leaves = [...shape.keys()].filter(
      (path) => path === from || path.startsWith(`${from}.`),
    );
    if (leaves.length === 0) {
      throw new Error(`Nothing at ${from} to compare with ${to}.`);
    }
    for (const path of leaves) {
      const target = to + path.slice(from.length);
      if (moved.has(target)) {
        throw new Error(`Two relocations end at ${target}.`);
      }
      moved.set(target, shape.get(path) ?? ABSENT);
      taken.add(path);
    }
  }
  const result: Shape = new Map();
  for (const [path, value] of shape) {
    if (taken.has(path)) continue;
    if (moved.has(path)) {
      throw new Error(`${path} is already there: nothing can move onto it.`);
    }
    result.set(path, value);
  }
  for (const [path, value] of moved) result.set(path, value);
  return result;
}

/**
 * The part of `value` that is not in `base`: the leaves that differ, as a
 * sparse object. Arrays are taken whole. A config a path hands on complete
 * and a config a path hands on as an override compare through this, each
 * against the config both started from.
 */
export function overlayOf(value: unknown, base: unknown): unknown {
  if (isDeepStrictEqual(value, base)) return undefined;
  const plain = (item: unknown): item is Record<string, unknown> =>
    typeof item === "object" &&
    item !== null &&
    !Array.isArray(item) &&
    isPlainObject(item);
  if (!plain(value)) return value;
  const under = plain(base) ? base : {};
  const overlay: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key in under && isDeepStrictEqual(item, under[key])) continue;
    overlay[key] = key in under ? overlayOf(item, under[key]) : item;
  }
  return overlay;
}

function covers(pattern: string, path: string): boolean {
  if (!pattern.endsWith(".*")) return pattern === path;
  return path.startsWith(pattern.slice(0, -1));
}

export interface Judgement {
  /** Differences no entry covers. */
  unlisted: Difference[];
  /** Listed paths that no longer differ. */
  stale: { path: string; reason: string }[];
  /** Covered differences whose pinned side is no longer what it was. */
  mismatched: { difference: Difference; entry: AllowedDifference }[];
}

export function judgeDifferences(
  differences: readonly Difference[],
  allowlist: readonly AllowedDifference[],
): Judgement {
  const used = new Set<string>();
  const judgement: Judgement = { unlisted: [], stale: [], mismatched: [] };
  for (const difference of differences) {
    let entry: AllowedDifference | undefined;
    for (const candidate of allowlist) {
      const pattern = candidate.paths.find((p) => covers(p, difference.path));
      if (pattern === undefined) continue;
      used.add(pattern);
      entry ??= candidate;
    }
    if (!entry) {
      judgement.unlisted.push(difference);
      continue;
    }
    const pinned =
      (entry.classic === undefined || entry.classic === difference.classic) &&
      (entry.hosts === undefined || entry.hosts === difference.hosts);
    if (!pinned) judgement.mismatched.push({ difference, entry });
  }
  for (const entry of allowlist) {
    for (const path of entry.paths) {
      if (!used.has(path)) judgement.stale.push({ path, reason: entry.reason });
    }
  }
  return judgement;
}

const side = (difference: Difference) =>
  `classic ${difference.classic} | hosts ${difference.hosts}`;

/**
 * Throws unless the differences are exactly the listed ones. The message
 * names every unlisted difference with both sides, every listed path that no
 * longer differs, and every pin that no longer holds.
 */
export function expectOnlyAllowedDifferences(
  label: string,
  differences: readonly Difference[],
  allowlist: readonly AllowedDifference[],
): void {
  const { unlisted, stale, mismatched } = judgeDifferences(
    differences,
    allowlist,
  );
  if (unlisted.length + stale.length + mismatched.length === 0) return;
  const lines = [`${label}: the two paths no longer differ as listed.`];
  if (unlisted.length > 0) {
    lines.push(
      "",
      "Not listed (make the paths agree, or list each with its reason):",
      ...unlisted.map((d) => `  ${JSON.stringify(d.path)}: ${side(d)}`),
    );
  }
  if (stale.length > 0) {
    lines.push(
      "",
      "Listed, and no longer different (remove from the list):",
      ...stale.map((s) => `  ${JSON.stringify(s.path)} (${s.reason})`),
    );
  }
  if (mismatched.length > 0) {
    lines.push(
      "",
      "Listed with other values (review, then update the pins):",
      ...mismatched.map(
        ({ difference, entry }) =>
          `  ${JSON.stringify(difference.path)}: ${side(difference)}; listed as classic ${entry.classic ?? "(any)"} | hosts ${entry.hosts ?? "(any)"}`,
      ),
    );
  }
  throw new Error(lines.join("\n"));
}

/** A scenario's list: the base list without `dropped`, plus `added`. A
 * dropped path that the base does not list is a mistake in the scenario. */
export function adjustAllowlist(
  base: readonly AllowedDifference[],
  change: {
    dropped?: readonly string[];
    added?: readonly AllowedDifference[];
  },
): AllowedDifference[] {
  const dropped = new Set(change.dropped ?? []);
  const listed = new Set(base.flatMap((entry) => entry.paths));
  const unknown = [...dropped].filter((path) => !listed.has(path));
  if (unknown.length > 0) {
    throw new Error(`Not in the base list: ${unknown.join(", ")}`);
  }
  return [
    ...base
      .map((entry) => ({
        ...entry,
        paths: entry.paths.filter((path) => !dropped.has(path)),
      }))
      .filter((entry) => entry.paths.length > 0),
    ...(change.added ?? []),
  ];
}

import {
  isToken,
  TOKEN_ESCAPE_KEY,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { isBlank } from "./catalog.ts";
import { parsePath } from "./policy.ts";
import { isDelete, type HostRuleIssue, type Setter } from "./schema.ts";

type Container = Record<string, unknown> | unknown[];

function isContainer(value: unknown): value is Container {
  return typeof value === "object" && value !== null;
}

/** A token, or a `$$` escape: opaque to a setter. */
function isOpaque(value: unknown): boolean {
  if (isToken(value)) return true;
  if (!isContainer(value) || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === TOKEN_ESCAPE_KEY;
}

function child(container: Container, segment: string): unknown {
  if (Array.isArray(container)) return container[Number(segment)];
  return Object.hasOwn(container, segment) ? container[segment] : undefined;
}

function indexError(container: Container, segment: string): string | undefined {
  if (!Array.isArray(container)) return undefined;
  const index = Number(segment);
  if (!Number.isInteger(index) || index < 0 || index >= container.length) {
    return `has no item ${segment}`;
  }
  return undefined;
}

/** Blocks whose absence means the same as empty: a delete that empties one drops it. */
const PRUNED = [
  "reactor.router",
  "reactor.placement",
  "reactor.placement.drives",
];

function isEmptyObject(value: unknown): boolean {
  return (
    isContainer(value) &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function opaque(path: readonly string[]): string {
  return `${path.join(".")} is filled in from a token, so its parts can't be changed.`;
}

/** Applies one setter in place; returns why it could not. */
function applyOne(root: Container, setter: Setter): string | undefined {
  const parsed = parsePath(setter.path);
  if ("error" in parsed) return parsed.error;
  const { segments, subject } = parsed;
  const remove = isDelete(setter.value);
  let current: Container = root;
  const parents: Container[] = [];
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const at = segments.slice(0, index + 1).join(".");
    if (isOpaque(current)) return opaque(segments.slice(0, index));
    const missing = indexError(current, segment);
    if (missing) return `${segments.slice(0, index).join(".")} ${missing}.`;
    let next = child(current, segment);
    if (next === undefined) {
      if (index < subject.length) return `There is no ${at} in this host.`;
      if (remove) return undefined;
      next = {};
      (current as Record<string, unknown>)[segment] = next;
    }
    if (!isContainer(next))
      return `${at} is a single value, not a group of settings.`;
    parents.push(current);
    current = next;
  }
  const last = segments[segments.length - 1];
  if (isOpaque(current)) return opaque(segments.slice(0, -1));
  const missing = indexError(current, last);
  if (missing) return `${segments.slice(0, -1).join(".")} ${missing}.`;
  const exists = child(current, last) !== undefined;
  if (remove) {
    if (Array.isArray(current))
      return "Items in a list can't be removed one by one.";
    if (!exists) return undefined;
    delete current[last];
    for (let depth = segments.length - 1; depth > subject.length; depth--) {
      const block = segments.slice(subject.length, depth).join(".");
      if (!PRUNED.includes(block) || !isEmptyObject(current)) break;
      const parent = parents[depth - 1] as Record<string, unknown>;
      delete parent[segments[depth - 1]];
      current = parent;
    }
    return undefined;
  }
  // A new member is added by setting its whole wrapper or, on a blank host, folder.
  const addsMember =
    subject.at(-2) === "children" ||
    (subject.length === 2 && subject[0] === "members" && isBlank(root));
  if (segments.length === subject.length && !exists && !addsMember) {
    return `There is no ${setter.path} in this host.`;
  }
  const value = structuredClone(setter.value);
  if (Array.isArray(current)) current[Number(last)] = value;
  else current[last] = value;
  return undefined;
}

/** In order, on a copy; each setter that cannot apply is reported and skipped. */
export function applySetters(
  envelope: HostExport,
  setters: readonly Setter[],
): { envelope: HostExport; issues: HostRuleIssue[] } {
  const copy = structuredClone(envelope) as HostExport;
  const issues: HostRuleIssue[] = [];
  for (const setter of setters) {
    const error = applyOne(copy as unknown as Container, setter);
    if (error !== undefined) {
      issues.push({ rule: "setter", path: setter.path, message: error });
    }
  }
  return { envelope: copy, issues };
}

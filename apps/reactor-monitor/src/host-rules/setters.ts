import {
  isToken,
  TOKEN_ESCAPE_KEY,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { parsePath } from "./policy.js";
import { isDelete, type HostRuleIssue, type Setter } from "./schema.js";

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
    if (exists) delete current[last];
    return undefined;
  }
  // A new member may be added by setting its whole wrapper; a host or folder may not.
  const addsMember = subject.at(-2) === "children";
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

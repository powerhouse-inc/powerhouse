import {
  isToken,
  TOKEN_ESCAPE_KEY,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { parsePath } from "./policy.js";
import { isDelete, type MatrixIssue, type Setter } from "./schema.js";

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
    return `no index ${segment} (length ${container.length})`;
  }
  return undefined;
}

/** Applies one setter in place; returns why it could not. */
function applyOne(root: Container, setter: Setter): string | undefined {
  const parsed = parsePath(setter.path);
  if ("error" in parsed) return parsed.error;
  const { segments, subject } = parsed;
  let current: Container = root;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const at = segments.slice(0, index + 1).join(".");
    if (isOpaque(current))
      return `${segments.slice(0, index).join(".")} is a token`;
    const missing = indexError(current, segment);
    if (missing) return `${at}: ${missing}`;
    let next = child(current, segment);
    if (next === undefined) {
      if (index < subject.length) return `${at} does not exist`;
      if (isDelete(setter.value)) return undefined;
      next = {};
      (current as Record<string, unknown>)[segment] = next;
    }
    if (!isContainer(next)) return `${at} is not an object`;
    current = next;
  }
  const last = segments[segments.length - 1];
  if (isOpaque(current)) return `${segments.slice(0, -1).join(".")} is a token`;
  const missing = indexError(current, last);
  if (missing) return `${setter.path}: ${missing}`;
  if (
    segments.length === subject.length &&
    child(current, last) === undefined
  ) {
    return `${setter.path} does not exist`;
  }
  if (isDelete(setter.value)) {
    if (Array.isArray(current)) return "an array element cannot be deleted";
    delete current[last];
    return undefined;
  }
  const value = structuredClone(setter.value);
  if (Array.isArray(current)) current[Number(last)] = value;
  else current[last] = value;
  return undefined;
}

export type SetterSource = { axis?: string; value?: string };

/** In order, on a copy; `sources[i]` names where setter i came from. */
export function applySetters(
  envelope: HostExport,
  setters: readonly Setter[],
  sources: readonly SetterSource[] = [],
): { envelope: HostExport; issues: MatrixIssue[] } {
  const copy = structuredClone(envelope) as HostExport;
  const issues: MatrixIssue[] = [];
  setters.forEach((setter, index) => {
    const error = applyOne(copy as unknown as Container, setter);
    if (error === undefined) return;
    issues.push({
      stage: "setter",
      path: setter.path,
      message: error,
      ...sources[index],
    });
  });
  return { envelope: copy, issues };
}

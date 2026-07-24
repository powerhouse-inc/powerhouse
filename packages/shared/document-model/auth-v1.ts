// Version-1 auth policy rules. These are consensus rules applied identically
// by every replica; changing any of them requires a new policy version.

import { z } from "zod";
import type { AuthDecision, AuthRequest, AuthSubject } from "./auth.js";
import { groupDocumentType } from "./document-type.js";
import type { Capability, Grant, Principal } from "./state.js";

/** Maximum number of grants in a policy. */
export const MAX_AUTH_GRANTS = 100;
/** Maximum nesting depth of a condition tree. */
export const MAX_CONDITION_DEPTH = 10;
/** Maximum node count (conditions plus operands) of a condition tree. */
export const MAX_CONDITION_NODES = 100;
/** Maximum entries in an execute capability's operation list. */
export const MAX_CAPABILITY_OPERATIONS = 100;

/**
 * Thrown when a grant violates the v1 validation rules. The message is stored
 * on error operations, so it must be a pure function of the input.
 */
export class InvalidGrantError extends Error {
  public readonly grantId: string;

  constructor(grantId: string, problem: string) {
    super(`Invalid grant "${grantId}": ${problem}`);
    this.name = "InvalidGrantError";
    this.grantId = grantId;
  }
}

/** Thrown for a `{ group }` principal on a group document: references never chain. */
export class GroupPrincipalNotAllowedError extends Error {
  public readonly grantId: string;

  constructor(grantId: string) {
    super(
      `Grant "${grantId}" uses a group principal on a group document: a group's auth scope cannot reference other groups`,
    );
    this.name = "GroupPrincipalNotAllowedError";
    this.grantId = grantId;
  }
}

const GRANT_KEYS = new Set([
  "id",
  "description",
  "effect",
  "principal",
  "capability",
  "where",
]);
const PRINCIPAL_KINDS = new Set(["anyone", "address", "group", "match"]);
const COMPARISON_CONDITION_KINDS = new Set([
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
]);

export function isPlainValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operandProblem(
  value: unknown,
  capabilityScope: string | undefined,
  budget: { nodes: number },
): string | null {
  budget.nodes -= 1;
  if (budget.nodes < 0) {
    return `condition exceeds ${MAX_CONDITION_NODES} nodes`;
  }
  if (!isPlainValue(value)) {
    return "operand must be an object";
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return "operand must have exactly one of attr or lit";
  }
  if (keys[0] === "attr") {
    const attr = value.attr;
    if (typeof attr !== "string" || attr.length === 0) {
      return "attr must be a non-empty string";
    }
    if (
      capabilityScope !== undefined &&
      capabilityScope !== "*" &&
      attr.startsWith("doc.")
    ) {
      const pathScope = attr.split(".")[1] ?? "";
      if (pathScope !== capabilityScope) {
        return `condition path "${attr}" reads scope "${pathScope}" but the capability covers only scope "${capabilityScope}"`;
      }
    }
    return null;
  }
  if (keys[0] === "lit") {
    const lit = value.lit;
    if (
      lit !== null &&
      typeof lit !== "string" &&
      typeof lit !== "number" &&
      typeof lit !== "boolean"
    ) {
      return "lit must be a string, number, boolean, or null";
    }
    // NaN, Infinity, and -0 do not survive JSON round-trips identically
    if (typeof lit === "number" && !Number.isFinite(lit)) {
      return "lit must be a finite number";
    }
    if (typeof lit === "number" && Object.is(lit, -0)) {
      return "lit must not be negative zero";
    }
    return null;
  }
  return `unknown operand kind "${keys[0]}"`;
}

function conditionProblem(
  value: unknown,
  capabilityScope: string | undefined,
  depth: number,
  budget: { nodes: number },
): string | null {
  if (depth > MAX_CONDITION_DEPTH) {
    return `condition exceeds depth ${MAX_CONDITION_DEPTH}`;
  }
  budget.nodes -= 1;
  if (budget.nodes < 0) {
    return `condition exceeds ${MAX_CONDITION_NODES} nodes`;
  }
  if (!isPlainValue(value)) {
    return "condition must be an object";
  }
  const keys = Object.keys(value);
  if (keys.length !== 1) {
    return "condition must have exactly one operator";
  }
  const kind = keys[0];
  const body = value[kind];
  if (COMPARISON_CONDITION_KINDS.has(kind)) {
    if (!Array.isArray(body) || body.length !== 2) {
      return `${kind} requires a pair of operands`;
    }
    for (const operand of body) {
      const problem = operandProblem(operand, capabilityScope, budget);
      if (problem !== null) {
        return problem;
      }
    }
    return null;
  }
  if (kind === "in" || kind === "notIn") {
    if (!Array.isArray(body) || body.length !== 2 || !Array.isArray(body[1])) {
      return `${kind} requires an operand and an operand list`;
    }
    const first = operandProblem(body[0], capabilityScope, budget);
    if (first !== null) {
      return first;
    }
    for (const operand of body[1] as unknown[]) {
      const problem = operandProblem(operand, capabilityScope, budget);
      if (problem !== null) {
        return problem;
      }
    }
    return null;
  }
  if (kind === "exists") {
    return operandProblem(body, capabilityScope, budget);
  }
  if (kind === "and" || kind === "or") {
    if (!Array.isArray(body)) {
      return `${kind} requires a condition list`;
    }
    for (const child of body) {
      const problem = conditionProblem(
        child,
        capabilityScope,
        depth + 1,
        budget,
      );
      if (problem !== null) {
        return problem;
      }
    }
    return null;
  }
  if (kind === "not") {
    return conditionProblem(body, capabilityScope, depth + 1, budget);
  }
  return `unknown condition operator "${kind}"`;
}

function principalProblem(
  value: unknown,
  capabilityScope: string | undefined,
): string | null {
  if (!isPlainValue(value)) {
    return "principal must be an object";
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || !PRINCIPAL_KINDS.has(keys[0])) {
    return "principal must have exactly one of anyone, address, group, or match";
  }
  const kind = keys[0];
  if (kind === "anyone" && value.anyone !== true) {
    return "anyone must be true";
  }
  if (kind === "address") {
    const address = value.address;
    if (typeof address !== "string" || address.length === 0) {
      return "address must be a non-empty string";
    }
  }
  if (kind === "group") {
    const group = value.group;
    if (typeof group !== "string" || group.length === 0) {
      return "group must be a non-empty string";
    }
  }
  if (kind === "match") {
    return conditionProblem(value.match, capabilityScope, 1, {
      nodes: MAX_CONDITION_NODES,
    });
  }
  return null;
}

function capabilityProblem(value: unknown): string | null {
  if (!isPlainValue(value)) {
    return "capability must be an object";
  }
  const can = value.can;
  if (can !== "read" && can !== "execute") {
    return "capability.can must be read or execute";
  }
  const allowedKeys =
    can === "execute" ? ["can", "scope", "operation"] : ["can", "scope"];
  // sorted: jsonb storage does not preserve key order
  const unknownKeys = Object.keys(value)
    .filter((key) => !allowedKeys.includes(key))
    .sort();
  if (unknownKeys.length > 0) {
    return `unknown capability key "${unknownKeys[0]}"`;
  }
  if (value.scope !== undefined) {
    if (typeof value.scope !== "string" || value.scope.length === 0) {
      return "capability.scope must be a non-empty string";
    }
  }
  if (can === "execute" && value.operation !== undefined) {
    const operation = value.operation;
    if (!Array.isArray(operation)) {
      return "capability.operation must be an array";
    }
    if (operation.length > MAX_CAPABILITY_OPERATIONS) {
      return `capability.operation exceeds ${MAX_CAPABILITY_OPERATIONS} entries`;
    }
    for (const entry of operation) {
      if (typeof entry !== "string" || entry.length === 0) {
        return "capability.operation entries must be non-empty strings";
      }
    }
  }
  return null;
}

/** Returns the first v1-rule violation, or null. Pure, total, deterministic. */
export function grantProblem(value: unknown): string | null {
  if (!isPlainValue(value)) {
    return "grant must be an object";
  }
  // sorted: jsonb storage does not preserve key order
  const unknownKeys = Object.keys(value)
    .filter((key) => !GRANT_KEYS.has(key))
    .sort();
  if (unknownKeys.length > 0) {
    return `unknown grant key "${unknownKeys[0]}"`;
  }
  if (typeof value.id !== "string" || value.id.length === 0) {
    return "id must be a non-empty string";
  }
  if (typeof value.description !== "string") {
    return "description must be a string";
  }
  if (value.effect !== "allow" && value.effect !== "deny") {
    return "effect must be allow or deny";
  }
  const capabilityValue = value.capability;
  const capability = capabilityProblem(capabilityValue);
  if (capability !== null) {
    return capability;
  }
  const capabilityScope = (capabilityValue as Record<string, unknown>).scope as
    | string
    | undefined;
  const principal = principalProblem(value.principal, capabilityScope);
  if (principal !== null) {
    return principal;
  }
  if (value.where !== undefined) {
    return conditionProblem(value.where, capabilityScope, 1, {
      nodes: MAX_CONDITION_NODES,
    });
  }
  return null;
}

export const GrantSchema = () =>
  z.custom<Grant>((value) => grantProblem(value) === null);

/** V1 shape rules plus the group-document group-principal ban. */
export function assertValidGrant(grant: unknown, documentType: string): void {
  const grantId =
    isPlainValue(grant) && typeof grant.id === "string" ? grant.id : "";
  const problem = grantProblem(grant);
  if (problem !== null) {
    throw new InvalidGrantError(grantId, problem);
  }
  if (
    documentType === groupDocumentType &&
    "group" in (grant as Grant).principal
  ) {
    throw new GroupPrincipalNotAllowedError(grantId);
  }
}

/** Validates an initial grant list: the count cap plus every grant. */
export function assertValidInitialGrants(
  grants: Grant[],
  documentType: string,
): void {
  if (grants.length > MAX_AUTH_GRANTS) {
    throw new InvalidGrantError("", `policy exceeds ${MAX_AUTH_GRANTS} grants`);
  }
  for (const grant of grants) {
    assertValidGrant(grant, documentType);
  }
}

/** Validates a grant upsert: the grant itself plus the count cap on append. */
export function assertValidGrantUpsert(
  grant: Grant,
  existing: Grant[],
  documentType: string,
): void {
  assertValidGrant(grant, documentType);
  const exists = existing.some((g) => g.id === grant.id);
  if (!exists && existing.length >= MAX_AUTH_GRANTS) {
    throw new InvalidGrantError(
      grant.id,
      `policy exceeds ${MAX_AUTH_GRANTS} grants`,
    );
  }
}

function capabilityCovers(
  capability: Capability,
  request: AuthRequest,
): boolean {
  if (capability.can !== request.verb) {
    return false;
  }
  const scope = capability.scope;
  if (scope !== undefined && scope !== "*" && scope !== request.scope) {
    return false;
  }
  if (capability.can === "execute") {
    // An execute capability with no operation list covers every operation in the scope.
    if (capability.operation === undefined) {
      return true;
    }
    return (
      request.operation !== undefined &&
      capability.operation.includes(request.operation)
    );
  }
  return true;
}

function principalMatches(principal: Principal, subject: AuthSubject): boolean {
  if ("anyone" in principal) {
    return true;
  }
  if ("address" in principal) {
    return (
      subject.address !== undefined &&
      subject.address.toLowerCase() === principal.address.toLowerCase()
    );
  }
  // { group } and { match } are not evaluated yet: group membership needs the
  // PHGroup model (a missing group never widens access) and conditions are deferred.
  return false;
}

/**
 * Evaluates a v1 grant stack: default deny, last applicable grant wins.
 * Group and match principals and `where` conditions are not evaluated yet; a
 * grant that uses any of them never applies.
 */
export function evaluateGrants(
  grants: Grant[],
  subject: AuthSubject,
  request: AuthRequest,
): AuthDecision {
  let decision: AuthDecision = "deny";
  for (const grant of grants) {
    // `where` is not evaluated yet; a conditional grant never applies.
    if (grant.where !== undefined) {
      continue;
    }
    if (
      capabilityCovers(grant.capability, request) &&
      principalMatches(grant.principal, subject)
    ) {
      decision = grant.effect;
    }
  }
  return decision;
}

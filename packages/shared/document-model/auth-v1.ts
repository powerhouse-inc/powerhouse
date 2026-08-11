// Version-1 auth policy rules. These are consensus rules applied identically
// by every replica; changing any of them requires a new policy version.

import { z } from "zod";
import type {
  AuthDecision,
  AuthEvaluation,
  AuthRequest,
  AuthSubject,
  ConditionContext,
} from "./auth.js";
import { groupDocumentType } from "./document-type.js";
import type {
  AuthGroups,
  Capability,
  Condition,
  Grant,
  PHGroupState,
  Principal,
} from "./state.js";

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

/**
 * Thrown when a change would leave a creator-less policy with no grant
 * permitting execute on the auth scope. Without the creator carve-out no
 * subject could ever administer such a policy again.
 */
export class AuthAdministrationLockoutError extends Error {
  public readonly grantId: string;

  constructor(grantId: string) {
    super(
      `Change to grant "${grantId}" would leave no reachable grant permitting execute on the auth scope: a policy with no creator must always retain one`,
    );
    this.name = "AuthAdministrationLockoutError";
    this.grantId = grantId;
  }
}

/**
 * Thrown when INITIALIZE_AUTH would create a creator-less policy with no grant
 * permitting execute on the auth scope. Such a policy would be born with no
 * subject able to administer it.
 */
export class AuthAdministrationMissingError extends Error {
  constructor() {
    super(
      "Initial grants include no reachable grant permitting execute on the auth scope: a policy with no creator must always include one",
    );
    this.name = "AuthAdministrationMissingError";
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

/**
 * Validates an initial grant list: the count cap, every grant, and — on a
 * creator-less policy — that some grant keeps the auth scope administrable.
 */
export function assertValidInitialGrants(
  grants: Grant[],
  documentType: string,
  creator: string | undefined,
): void {
  if (grants.length > MAX_AUTH_GRANTS) {
    throw new InvalidGrantError("", `policy exceeds ${MAX_AUTH_GRANTS} grants`);
  }
  for (const grant of grants) {
    assertValidGrant(grant, documentType);
  }
  if (creator === undefined && !administrationReachable(grants)) {
    throw new AuthAdministrationMissingError();
  }
}

/**
 * Validates a grant upsert: the grant itself, the count cap on append, and
 * administration retention. Retention is checked on an append as well as an
 * in-place replace, because a grant appended after the administration grant can
 * shadow it (evaluation is last-applicable-grant-wins) and so take
 * administration away without removing anything.
 */
export function assertValidGrantUpsert(
  grant: Grant,
  existing: Grant[],
  documentType: string,
  creator: string | undefined,
): void {
  assertValidGrant(grant, documentType);
  const exists = existing.some((g) => g.id === grant.id);
  if (!exists && existing.length >= MAX_AUTH_GRANTS) {
    throw new InvalidGrantError(
      grant.id,
      `policy exceeds ${MAX_AUTH_GRANTS} grants`,
    );
  }
  // Built the same way applySetGrantAction builds it, so the two cannot drift.
  const next = exists
    ? existing.map((g) => (g.id === grant.id ? grant : g))
    : [...existing, grant];
  assertAuthAdministrationRetained(creator, existing, next, grant.id);
}

/**
 * The request whose coverage keeps a policy administrable: a subject who may
 * SET_GRANT can upsert any grant, so every other repair stays reachable.
 */
const AUTH_ADMINISTRATION_REQUEST: AuthRequest = {
  verb: "execute",
  scope: "auth",
  operation: "SET_GRANT",
};

/**
 * Whether some subject can still administer the auth scope under this grant list.
 *
 * Asks the evaluator rather than pattern-matching a single grant: evaluation is
 * last-applicable-grant-wins, so an allow that some later deny shadows keeps
 * nothing reachable even though it is still present in the list. Only anyone and
 * address principals are candidates, because those are the ones v1 can match at
 * all; a `where` condition or a group or match principal never applies.
 */
function administrationReachable(grants: Grant[]): boolean {
  return grants.some((grant) => {
    const subject = administrationCandidate(grant);
    if (subject === undefined) {
      return false;
    }
    return (
      evaluateGrantStack(grants, subject, AUTH_ADMINISTRATION_REQUEST)
        .decision === "allow"
    );
  });
}

/**
 * The subject to test this grant with, or undefined when the grant could never
 * carry administration for anyone.
 */
function administrationCandidate(grant: Grant): AuthSubject | undefined {
  if (
    grant.effect !== "allow" ||
    grant.where !== undefined ||
    !capabilityCovers(grant.capability, AUTH_ADMINISTRATION_REQUEST)
  ) {
    return undefined;
  }
  if ("address" in grant.principal) {
    return { address: grant.principal.address, key: undefined };
  }
  if ("anyone" in grant.principal) {
    return { address: undefined, key: undefined };
  }
  return undefined;
}

/**
 * A creator-less policy must always retain a grant permitting execute on the
 * auth scope; on a signed document the creator carve-out keeps administration
 * reachable instead. Rejects a change that takes the last such grant away. A
 * policy already without one is left alone: the change is not what locks it.
 */
export function assertAuthAdministrationRetained(
  creator: string | undefined,
  previous: Grant[],
  next: Grant[],
  grantId: string,
): void {
  if (creator !== undefined) {
    return;
  }
  if (administrationReachable(previous) && !administrationReachable(next)) {
    throw new AuthAdministrationLockoutError(grantId);
  }
}

// --- Condition evaluation (version 1) -------------------------------------

/** A resolved operand value; undefined marks a path that did not resolve. */
type ConditionValue = string | number | boolean | null;

/**
 * Narrows to the values conditions compare. An object, array, or non-finite
 * number resolves to undefined, and every comparison involving undefined is
 * false.
 */
function asConditionValue(value: unknown): ConditionValue | undefined {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

/**
 * Resolves one operand. Attr roots: `subject.*`, `doc.<scope>.*` where the
 * scope must be the executing scope (validation already rejects any other,
 * but resolution stays total), and `action.input.*`.
 */
function resolveOperand(
  operand: unknown,
  subject: AuthSubject,
  request: AuthRequest,
  conditions: ConditionContext,
): ConditionValue | undefined {
  if (!isPlainValue(operand)) {
    return undefined;
  }
  if ("lit" in operand) {
    return asConditionValue(operand.lit);
  }

  const attr = operand.attr;
  if (typeof attr !== "string" || attr.length === 0) {
    return undefined;
  }
  const path = attr.split(".");

  let value: unknown;
  let rest: string[];
  if (path[0] === "subject") {
    value = subject;
    rest = path.slice(1);
  } else if (path[0] === "doc") {
    if (path[1] !== request.scope) {
      return undefined;
    }
    value = conditions.scopeState;
    rest = path.slice(2);
  } else if (path[0] === "action" && path[1] === "input") {
    value = conditions.actionInput;
    rest = path.slice(2);
  } else {
    return undefined;
  }

  for (const segment of rest) {
    if (!isPlainValue(value)) {
      return undefined;
    }
    value = value[segment];
  }
  return asConditionValue(value);
}

/**
 * Total order within one type: numbers numerically, strings by code point.
 * Everything else, including mixed types, does not order.
 */
function compareValues(
  left: ConditionValue,
  right: ConditionValue,
): number | undefined {
  if (typeof left === "number" && typeof right === "number") {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (typeof left === "string" && typeof right === "string") {
    const leftPoints = Array.from(left);
    const rightPoints = Array.from(right);
    const shared = Math.min(leftPoints.length, rightPoints.length);
    for (let i = 0; i < shared; i++) {
      const a = leftPoints[i].codePointAt(0) ?? 0;
      const b = rightPoints[i].codePointAt(0) ?? 0;
      if (a !== b) {
        return a < b ? -1 : 1;
      }
    }
    return leftPoints.length === rightPoints.length
      ? 0
      : leftPoints.length < rightPoints.length
        ? -1
        : 1;
  }
  return undefined;
}

/**
 * Tri-state evaluation: undefined marks a structurally invalid node, which
 * poisons the whole tree to false at the top. That is distinct from an
 * operand that fails to resolve, which is a valid comparison that is false.
 * The distinction keeps `not` from widening over malformed input.
 */
function evaluateNode(
  node: unknown,
  subject: AuthSubject,
  request: AuthRequest,
  conditions: ConditionContext,
): boolean | undefined {
  if (!isPlainValue(node)) {
    return undefined;
  }
  const keys = Object.keys(node);
  if (keys.length !== 1) {
    return undefined;
  }
  const kind = keys[0];
  const body = node[kind];

  switch (kind) {
    case "eq":
    case "ne":
    case "lt":
    case "lte":
    case "gt":
    case "gte": {
      if (!Array.isArray(body) || body.length !== 2) {
        return undefined;
      }
      const left = resolveOperand(body[0], subject, request, conditions);
      const right = resolveOperand(body[1], subject, request, conditions);
      if (left === undefined || right === undefined) {
        return false;
      }
      if (kind === "eq") {
        return left === right;
      }
      if (kind === "ne") {
        return left !== right;
      }
      const order = compareValues(left, right);
      if (order === undefined) {
        return false;
      }
      switch (kind) {
        case "lt":
          return order < 0;
        case "lte":
          return order <= 0;
        case "gt":
          return order > 0;
        case "gte":
          return order >= 0;
      }
      return undefined;
    }
    case "in":
    case "notIn": {
      if (
        !Array.isArray(body) ||
        body.length !== 2 ||
        !Array.isArray(body[1])
      ) {
        return undefined;
      }
      const left = resolveOperand(body[0], subject, request, conditions);
      if (left === undefined) {
        return false;
      }
      const found = body[1].some((element) => {
        const value = resolveOperand(element, subject, request, conditions);
        return value !== undefined && value === left;
      });
      return kind === "in" ? found : !found;
    }
    case "exists": {
      if (!isPlainValue(body)) {
        return undefined;
      }
      return resolveOperand(body, subject, request, conditions) !== undefined;
    }
    case "and":
    case "or": {
      if (!Array.isArray(body)) {
        return undefined;
      }
      let result = kind === "and";
      for (const child of body) {
        const value = evaluateNode(child, subject, request, conditions);
        if (value === undefined) {
          return undefined;
        }
        if (kind === "and") {
          result = result && value;
        } else {
          result = result || value;
        }
      }
      return result;
    }
    case "not": {
      const value = evaluateNode(body, subject, request, conditions);
      return value === undefined ? undefined : !value;
    }
    default:
      return undefined;
  }
}

/**
 * Evaluates a version-1 condition. Deterministic, total, and pure: any input
 * shape yields a boolean and never throws, and a malformed condition is
 * false. These are consensus semantics, versioned by `PHAuthState.version`;
 * changing them requires a new version.
 */
export function evaluateCondition(
  condition: Condition,
  subject: AuthSubject,
  request: AuthRequest,
  conditions: ConditionContext,
): boolean {
  return evaluateNode(condition, subject, request, conditions) === true;
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

function principalMatches(
  principal: Principal,
  subject: AuthSubject,
  request: AuthRequest,
  groups?: AuthGroups,
  conditions?: ConditionContext,
): boolean {
  if ("anyone" in principal) {
    return true;
  }
  if ("address" in principal) {
    return (
      subject.address !== undefined &&
      subject.address.toLowerCase() === principal.address.toLowerCase()
    );
  }
  if ("group" in principal) {
    // Groups match only when the groups projection is supplied (authGroups
    // on). A group the map does not hold fails closed: access is never
    // widened by a missing group.
    if (groups === undefined || subject.address === undefined) {
      return false;
    }
    // Total over malformed folded state: an index miss or a non-list member
    // field never widens access.
    const group = groups[principal.group] as PHGroupState | undefined;
    if (group === undefined || !Array.isArray(group.members)) {
      return false;
    }
    const address = subject.address.toLowerCase();
    return group.members.some((member) => member.toLowerCase() === address);
  }
  if ("match" in principal) {
    // Matches only when a condition context is supplied (authConditions on).
    if (conditions === undefined) {
      return false;
    }
    return evaluateCondition(principal.match, subject, request, conditions);
  }
  return false;
}

/**
 * The group document ids named by `{ group }` principals in a grant list, in
 * order of first appearance. These are the streams the groups projection reads.
 */
export function referencedGroupIds(grants: Grant[]): string[] {
  const ids: string[] = [];
  for (const grant of grants) {
    if ("group" in grant.principal && !ids.includes(grant.principal.group)) {
      ids.push(grant.principal.group);
    }
  }
  return ids;
}

/**
 * Evaluates a v1 grant stack: default deny, last applicable grant wins, and
 * reports which grant decided it. Group principals match only against a
 * supplied groups map, and `where` clauses and { match } principals evaluate
 * only against a supplied condition context; a grant that uses an unsupplied
 * feature never applies.
 */
export function evaluateGrantStack(
  grants: Grant[],
  subject: AuthSubject,
  request: AuthRequest,
  groups?: AuthGroups,
  conditions?: ConditionContext,
): AuthEvaluation {
  let applicable: Grant | undefined;
  for (const grant of grants) {
    if (grant.where !== undefined) {
      // With no condition context a conditional grant never applies.
      if (conditions === undefined) {
        continue;
      }
      if (!evaluateCondition(grant.where, subject, request, conditions)) {
        continue;
      }
    }
    if (
      capabilityCovers(grant.capability, request) &&
      principalMatches(grant.principal, subject, request, groups, conditions)
    ) {
      applicable = grant;
    }
  }

  if (applicable === undefined) {
    return { decision: "deny", refusal: "no-applicable-grant" };
  }
  if (applicable.effect === "deny") {
    return {
      decision: "deny",
      refusal: "denied-by-grant",
      grantId: applicable.id,
    };
  }
  return { decision: "allow" };
}

/**
 * Evaluates a v1 grant stack: default deny, last applicable grant wins. This is
 * {@link evaluateGrantStack} with the reason dropped.
 */
export function evaluateGrants(
  grants: Grant[],
  subject: AuthSubject,
  request: AuthRequest,
  groups?: AuthGroups,
  conditions?: ConditionContext,
): AuthDecision {
  return evaluateGrantStack(grants, subject, request, groups, conditions)
    .decision;
}

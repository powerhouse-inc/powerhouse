import type {
  Condition,
  Grant,
  PHAuthState,
} from "@powerhousedao/shared/document-model";
import { MAX_CONDITION_DEPTH } from "@powerhousedao/shared/document-model";

/**
 * The rungs of the auth enforcement ladder, as a benchmark sweeps them.
 *
 * The bottom rung is two cells, not one. Below `authEnforcement` the executor
 * still runs an interim in-memory `decide()` against the document it already
 * holds, so a policied document pays a full grant scan with no extra reads.
 * `L0_POLICIED` against `L2` at the same grant count therefore isolates the
 * projection reads from the scan they both perform, which is the one comparison
 * that separates auth's I/O cost from its CPU cost.
 */
export const AUTH_LEVELS = [
  "L0_CLEAN",
  "L0_POLICIED",
  "L1_DOCUMENT_DECISIONS",
  "L2_AUTH_ENFORCEMENT",
  "L3_AUTH_GROUPS",
  "L4_AUTH_CONDITIONS",
] as const;

export type AuthLevel = (typeof AUTH_LEVELS)[number];

/** The four reactor feature flags, as a plain record. */
export type AuthFlagSet = {
  documentDecisions: boolean;
  authEnforcement: boolean;
  authGroups: boolean;
  authConditions: boolean;
};

/**
 * The flags a level turns on. Cumulative, because `validateFeatureFlags`
 * refuses a set that skips a prerequisite: a cell that sets only the last flag
 * fails at build rather than measuring anything.
 */
export function flagsFor(level: AuthLevel): AuthFlagSet {
  const documentDecisions = level !== "L0_CLEAN" && level !== "L0_POLICIED";
  const authEnforcement =
    documentDecisions && level !== "L1_DOCUMENT_DECISIONS";
  const authGroups = authEnforcement && level !== "L2_AUTH_ENFORCEMENT";
  const authConditions = authGroups && level !== "L3_AUTH_GROUPS";
  return { documentDecisions, authEnforcement, authGroups, authConditions };
}

/** Whether a level's documents carry an initialized policy at all. */
export function policiedAt(level: AuthLevel): boolean {
  return level !== "L0_CLEAN";
}

/**
 * The environment a bench host reads its flags from, so a sweep cell maps one
 * to one onto a deployment's configuration rather than a bespoke encoding.
 */
export function envFor(level: AuthLevel): Record<string, string> {
  const flags = flagsFor(level);
  return {
    REACTOR_DOCUMENT_DECISIONS: String(flags.documentDecisions),
    REACTOR_AUTH_ENFORCEMENT: String(flags.authEnforcement),
    REACTOR_AUTH_GROUPS: String(flags.authGroups),
    REACTOR_AUTH_CONDITIONS: String(flags.authConditions),
  };
}

export const BENCH_WRITER_ADDRESS =
  "0x00000000000000000000000000000000000bench";
export const BENCH_OUTSIDER_ADDRESS =
  "0x000000000000000000000000000000000outside";
export const BENCH_ADMIN_ADDRESS = "0x00000000000000000000000000000000000admin";

/** Where in the stack the grant that decides the request sits. */
export type MatchPosition = "first" | "last";

export type PolicyShape = {
  /** Total grants in the stack, at most MAX_AUTH_GRANTS. */
  grantCount: number;
  /** Group document ids named by `{ group }` principals. */
  groupIds: string[];
  /** Attach this condition as a `where` clause on every filler grant. */
  where?: Condition;
  /**
   * Whether the deciding grant is scanned first or last. `evaluateGrantStack`
   * has no early exit, so `first` is the case an early-exit implementation
   * would win: it is how a benchmark demonstrates that none happens.
   */
  matchPosition: MatchPosition;
  /** The address the domain-scope allow is written for. */
  writerAddress: string;
};

export const MINIMAL_SHAPE: PolicyShape = {
  grantCount: 2,
  groupIds: [],
  matchPosition: "last",
  writerAddress: BENCH_WRITER_ADDRESS,
};

/**
 * A grant permitting anyone to administer the auth scope.
 *
 * A policy installed on an unsigned document has no creator, so nothing carries
 * the creator carve-out and `assertValidInitialGrants` refuses a stack that
 * leaves administration unreachable. Every generated policy therefore opens
 * with this.
 */
function authAdministrationGrant(): Grant {
  return {
    id: "bench-auth-admin",
    description: "anyone administers the auth scope",
    effect: "allow",
    principal: { anyone: true },
    capability: { can: "execute", scope: "auth" },
  };
}

/**
 * The grant that lets the benchmark's writer mutate the domain scope. Without
 * it every measured write is refused and the benchmark times a rejection.
 */
function writerGrant(writerAddress: string): Grant {
  return {
    id: "bench-writer",
    description: "the bench writer executes the global scope",
    effect: "allow",
    principal: { address: writerAddress },
    capability: { can: "execute", scope: "global" },
  };
}

/**
 * A grant that is scanned but never applies: it names an address nobody signs
 * as. Filler exists to make the stack long without changing the outcome, so grant
 * count can be swept independently of what the policy decides.
 */
function fillerGrant(index: number, where?: Condition): Grant {
  const grant: Grant = {
    id: `bench-filler-${index}`,
    description: "scanned, never applicable",
    effect: "allow",
    principal: { address: `0xfiller${index.toString().padStart(33, "0")}` },
    capability: { can: "execute", scope: "global" },
  };
  return where === undefined ? grant : { ...grant, where };
}

/** A grant whose principal is a group, for the authGroups axis. */
function groupGrant(groupId: string, index: number): Grant {
  return {
    id: `bench-group-${index}`,
    description: "members of a group execute the global scope",
    effect: "allow",
    principal: { group: groupId },
    capability: { can: "execute", scope: "global" },
  };
}

/**
 * Builds a grant stack for one cell of the matrix.
 *
 * The stack always contains the auth-administration grant and the writer grant;
 * everything else is filler sized to `grantCount`. `matchPosition` decides
 * whether the writer grant is scanned first or last.
 */
export function buildGrants(shape: PolicyShape): Grant[] {
  const fixed: Grant[] = [authAdministrationGrant()];
  const groups = shape.groupIds.map((id, index) => groupGrant(id, index));
  const writer = writerGrant(shape.writerAddress);

  const reserved = fixed.length + groups.length + 1;
  const fillerCount = Math.max(0, shape.grantCount - reserved);
  const filler: Grant[] = [];
  for (let index = 0; index < fillerCount; index++) {
    filler.push(fillerGrant(index, shape.where));
  }

  return shape.matchPosition === "first"
    ? [...fixed, writer, ...groups, ...filler]
    : [...fixed, ...groups, ...filler, writer];
}

/** A version-1 policy over a generated grant stack. */
export function buildAuthState(shape: PolicyShape): PHAuthState {
  return { version: 1, grants: buildGrants(shape) };
}

/**
 * A comparison reading the executing scope's state, which is the cheapest
 * condition that still forces the evaluator to resolve an attribute path.
 */
export function conditionLeaf(index: number): Condition {
  return { eq: [{ attr: "doc.global.name" }, { lit: `never-${index}` }] };
}

/**
 * A condition of a given nesting depth and node count, for sweeping the two
 * limits the policy language imposes independently.
 *
 * A node is a condition or an operand, so an `eq` costs three. Depth counts
 * from one at the root, and reaching depth D needs D-1 nested `and` nodes with
 * the comparisons as the innermost children. Those `and` nodes come out of the
 * same budget, so a deeper condition has less room to be wide.
 */
export function conditionTree(depth: number, nodeBudget: number): Condition {
  const levels = Math.max(1, Math.min(depth, MAX_CONDITION_DEPTH));
  const andCount = levels - 1;
  const leafBudget = nodeBudget - andCount;
  const leafCount = Math.max(1, Math.floor(leafBudget / 3));

  const leaves: Condition[] = [];
  for (let index = 0; index < leafCount; index++) {
    leaves.push(conditionLeaf(index));
  }

  if (andCount === 0) {
    return leaves[0];
  }

  let node: Condition = { and: leaves };
  for (let level = 1; level < andCount; level++) {
    node = { and: [node] };
  }
  return node;
}

/**
 * The node count the validator charges a condition, so a fixture can assert it
 * sits under the cap instead of assuming so.
 */
export function countConditionNodes(condition: Condition): number {
  const entries = Object.entries(condition as Record<string, unknown>);
  if (entries.length !== 1) {
    return 1;
  }
  const [kind, body] = entries[0];

  if (kind === "and" || kind === "or") {
    let total = 1;
    for (const child of body as Condition[]) {
      total += countConditionNodes(child);
    }
    return total;
  }
  if (kind === "not") {
    return 1 + countConditionNodes(body as Condition);
  }
  if (kind === "exists") {
    return 2;
  }
  if (kind === "in" || kind === "notIn") {
    const pair = body as [unknown, unknown[]];
    return 2 + pair[1].length;
  }
  return 3;
}

/** A roster of synthetic member addresses, for the group-size axis. */
export function groupMembers(count: number, includeWriter: boolean): string[] {
  const members: string[] = [];
  for (let index = 0; index < count; index++) {
    members.push(`0xmember${index.toString().padStart(33, "0")}`);
  }
  if (includeWriter) {
    members.push(BENCH_WRITER_ADDRESS);
  }
  return members;
}

/**
 * A grant stack whose administration check costs its worst legal price.
 *
 * `administrationReachable` stops at the first candidate grant that still
 * resolves to allow, so a policy whose administration sits at the top settles
 * in one scan. This orders it the other way: every earlier candidate is
 * shadowed by a blanket deny and resolves to deny, so the search runs the full
 * stack and each step scans the stack again.
 *
 * The result is still installable, which is the point. Administration stays
 * reachable through the final address-scoped grant, so this is a policy a
 * deployment can actually hold rather than a shape the validator would refuse.
 */
export function adversarialAdminGrants(grantCount: number): Grant[] {
  const shadowed = Math.max(0, grantCount - 2);
  const grants: Grant[] = [];

  for (let index = 0; index < shadowed; index++) {
    grants.push({
      id: `bench-shadowed-${index}`,
      description: "an administration candidate a later deny shadows",
      effect: "allow",
      principal: { address: `0xshadow${index.toString().padStart(33, "0")}` },
      capability: { can: "execute", scope: "auth" },
    });
  }

  grants.push({
    id: "bench-deny-all-auth",
    description: "shadows every administration grant above",
    effect: "deny",
    principal: { anyone: true },
    capability: { can: "execute", scope: "auth" },
  });

  grants.push({
    id: "bench-sole-admin",
    description: "the only grant that still administers the auth scope",
    effect: "allow",
    principal: { address: BENCH_ADMIN_ADDRESS },
    capability: { can: "execute", scope: "auth" },
  });

  return grants;
}

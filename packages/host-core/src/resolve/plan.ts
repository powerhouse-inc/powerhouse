import { refKey, type OutputRef } from "./declared.js";

/**
 * The dependency plan (pipeline step 4): which compound member consumes
 * which member's outputs, and the start order that follows. Producers start
 * before consumers; `config.startOrder` is optional and, when given, must
 * agree with the tokens. Cycles fail. Pure.
 */

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

export interface PlanMember {
  /** The member key (`children.<key>`). */
  key: string;
  /** The member's host folder (`children.<key>.host`). */
  host: string;
  /** The producers its tokens name, with the host path of one token each. */
  refs: { ref: OutputRef; path: string }[];
}

export interface PlanEdge {
  consumer: string;
  producer: string;
  /** Host path in the consumer of the (first) token behind this edge. */
  path: string;
}

export interface CompoundPlan {
  /** Member keys in start order. */
  order: string[];
  edges: PlanEdge[];
  /** "tokens": derived from the dependencies; "startOrder": the declared
   * order, checked against them. */
  source: "tokens" | "startOrder";
}

/** The member a ref names: the unique member running `ref.host`, or the
 * member `ref.member` when given (it must run `ref.host`). */
export function memberForRef(
  ref: OutputRef,
  members: readonly Pick<PlanMember, "key" | "host">[],
): { key: string } | { error: string } {
  if (ref.member !== undefined) {
    const named = members.find((m) => m.key === ref.member);
    if (!named) {
      return {
        error: `names member "${ref.member}", which this compound does not declare (members: ${members.map((m) => m.key).join(", ")}).`,
      };
    }
    if (named.host !== ref.host) {
      return {
        error: `names member "${ref.member}" of host "${ref.host}", but that member runs host "${named.host}".`,
      };
    }
    return { key: named.key };
  }
  const running = members.filter((m) => m.host === ref.host);
  if (running.length === 1) return { key: running[0].key };
  if (running.length === 0) {
    return {
      error: `names host "${ref.host}", which no member of this compound runs (members run: ${[...new Set(members.map((m) => m.host))].join(", ")}).`,
    };
  }
  return {
    error: `names host "${ref.host}", which members ${running.map((m) => `"${m.key}"`).join(" and ")} both run; add member: "<key>" to pick one.`,
  };
}

function edgesOf(members: readonly PlanMember[]): PlanEdge[] {
  const edges: PlanEdge[] = [];
  const problems: string[] = [];
  for (const member of members) {
    const seen = new Set<string>();
    for (const { ref, path } of member.refs) {
      const target = memberForRef(ref, members);
      if ("error" in target) {
        problems.push(`${member.key}: ${path} ${target.error}`);
        continue;
      }
      if (target.key === member.key) {
        problems.push(
          `${member.key}: ${path} reads ${refKey(ref)}'s outputs, which is this member itself.`,
        );
        continue;
      }
      if (seen.has(target.key)) continue;
      seen.add(target.key);
      edges.push({ consumer: member.key, producer: target.key, path });
    }
  }
  if (problems.length > 0) {
    throw new PlanError(problems.join("\n"));
  }
  return edges;
}

/** Declared start order: the named members first, then the rest in
 * declaration order. */
function declaredOrder(
  members: readonly PlanMember[],
  startOrder: readonly string[],
): string[] {
  const keys = members.map((m) => m.key);
  const named = [...new Set(startOrder)].filter((k) => keys.includes(k));
  return [...named, ...keys.filter((k) => !named.includes(k))];
}

export function planCompound(
  members: readonly PlanMember[],
  startOrder?: readonly string[],
): CompoundPlan {
  const edges = edgesOf(members);

  if (startOrder) {
    const order = declaredOrder(members, startOrder);
    const index = new Map(order.map((k, i) => [k, i]));
    const bad = edges.filter(
      (e) => (index.get(e.producer) ?? 0) > (index.get(e.consumer) ?? 0),
    );
    if (bad.length > 0) {
      throw new PlanError(
        bad
          .map(
            (e) =>
              `config.startOrder starts "${e.consumer}" before "${e.producer}", but ${e.consumer}.${e.path} consumes "${e.producer}"'s outputs. Reorder startOrder (or omit it: the order follows the tokens).`,
          )
          .join("\n"),
      );
    }
    return { order, edges, source: "startOrder" };
  }

  // Kahn's algorithm; ties keep declaration order.
  const pending = new Map(members.map((m) => [m.key, new Set<string>()]));
  for (const e of edges) pending.get(e.consumer)?.add(e.producer);
  const order: string[] = [];
  while (order.length < members.length) {
    const next = members.find(
      (m) => !order.includes(m.key) && pending.get(m.key)?.size === 0,
    );
    if (!next) {
      const stuck = members.filter((m) => !order.includes(m.key));
      throw new PlanError(
        `output tokens form a cycle between ${stuck.map((m) => `"${m.key}"`).join(", ")}: ${edges
          .filter(
            (e) =>
              stuck.some((m) => m.key === e.consumer) &&
              stuck.some((m) => m.key === e.producer),
          )
          .map((e) => `${e.consumer} (${e.path}) needs ${e.producer}`)
          .join("; ")}.`,
      );
    }
    order.push(next.key);
    for (const set of pending.values()) set.delete(next.key);
  }
  return { order, edges, source: "tokens" };
}

import type { OutputRef } from "./declared.js";
import { memberForRef } from "./plan.js";
import type { OutputSource } from "./resolve.js";

/**
 * The compound output source: a member's `$output` tokens read the live
 * `RunnerHandle.outputs` of the members started before it. Pure (the
 * run-record source for standalone hosts is node: ./node.ts).
 */
export function compoundOutputSource(
  members: readonly { key: string; host: string }[],
  started: ReadonlyMap<string, unknown>,
  compound: string,
): OutputSource {
  return {
    lookup(ref: OutputRef) {
      const target = memberForRef(ref, members);
      if ("error" in target) {
        return {
          status: "unavailable",
          message: `compound "${compound}": a token ${target.error}`,
        };
      }
      if (!started.has(target.key)) {
        return {
          status: "unavailable",
          message: `compound "${compound}": member "${target.key}" (host "${ref.host}") has not started yet; a producer must start before its consumers.`,
        };
      }
      return { status: "available", outputs: started.get(target.key) };
    },
  };
}

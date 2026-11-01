import type { ParsedCmdResult } from "@powerhousedao/shared/clis";
import {
  connectPreviewArgs,
  switchboardArgs,
} from "@powerhousedao/shared/clis/args";
import { command, runSafely } from "cmd-ts";

/**
 * The classic `ph switchboard` argument shape, produced by the SAME cmd-ts
 * definitions the classic command parses — not re-derived by hand. A runner
 * starts from this object and overlays only the keys its host file owns, so
 * every key the classic command carries (including the ones it carries as
 * `undefined`, e.g. `dbPath`) reaches the service exactly as it does on the
 * classic path. The uniform-runners switchboard runner once hand-built a
 * partial object that omitted `dbPath`; the service's then-default
 * `.ph/read-model.db` became both the reactor and the read-model PGlite dir —
 * two instances on one PGDATA (see uniform-runners-plan/legacy-parity-rectification.md).
 */
const classicSwitchboard = command({
  name: "switchboard",
  args: switchboardArgs,
  handler: (args) => args,
});

const classicConnectPreview = command({
  name: "preview",
  args: connectPreviewArgs,
  handler: (args) => args,
});

export type SwitchboardArgs = ParsedCmdResult<typeof classicSwitchboard>;
export type ConnectPreviewArgs = ParsedCmdResult<typeof classicConnectPreview>;

export async function classicSwitchboardArgs(
  argv: string[] = [],
): Promise<SwitchboardArgs> {
  const result = await runSafely(classicSwitchboard, argv);
  if (result._tag === "error") {
    throw new Error(
      `classic switchboard args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

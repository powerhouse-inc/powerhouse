import type { ParsedCmdResult } from "@powerhousedao/shared/clis";
import {
  connectPreviewArgs,
  switchboardArgs,
} from "@powerhousedao/shared/clis/args";
import { command, runSafely } from "cmd-ts";

/**
 * The argument shape the switchboard service takes, produced by the cmd-ts
 * definitions of `@powerhousedao/shared/clis/args` — not re-derived by hand.
 * A runner starts from this object and overlays only the keys its host file
 * owns, so every key of the shape (including the ones it carries as
 * `undefined`, e.g. `dbPath`) reaches the service. The switchboard runner
 * once hand-built a partial object that omitted `dbPath`; the service's then-default
 * `.ph/read-model.db` became both the reactor and the read-model PGlite dir —
 * two instances on one PGDATA (see uniform-runners-plan/legacy-parity-rectification.md).
 */
const switchboard = command({
  name: "switchboard",
  args: switchboardArgs,
  handler: (args) => args,
});

const connectPreview = command({
  name: "preview",
  args: connectPreviewArgs,
  handler: (args) => args,
});

export type SwitchboardArgs = ParsedCmdResult<typeof switchboard>;
export type ConnectPreviewArgs = ParsedCmdResult<typeof connectPreview>;

export async function switchboardServiceArgs(
  argv: string[] = [],
): Promise<SwitchboardArgs> {
  const result = await runSafely(switchboard, argv);
  if (result._tag === "error") {
    throw new Error(
      `switchboard args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

/** The argument shape the Connect preview service takes, the same way. */
export async function connectPreviewServiceArgs(
  argv: string[] = [],
): Promise<ConnectPreviewArgs> {
  const result = await runSafely(connectPreview, argv);
  if (result._tag === "error") {
    throw new Error(
      `connect preview args did not parse: ${result.error.config.message}`,
    );
  }
  return result.value;
}

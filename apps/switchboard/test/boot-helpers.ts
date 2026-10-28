import { switchboardConfigFromEnv } from "../src/config/from-env.js";
import { callerOverEnv } from "../src/config/merge.js";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import { startSwitchboard, type SwitchboardDeps } from "../src/server.mjs";

/** Boots the way an edge does: the caller's layer over process.env's. */
export function bootSwitchboard(
  config: SwitchboardConfigInput,
  deps: SwitchboardDeps = {},
): ReturnType<typeof startSwitchboard> {
  return startSwitchboard(
    callerOverEnv(
      switchboardConfigFromEnv(process.env, { logger: deps.logger }),
      config,
    ),
    deps,
  );
}

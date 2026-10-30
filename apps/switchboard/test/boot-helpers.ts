import { switchboardConfigFromEnv } from "../src/config/from-env.js";
import { callerOverEnv } from "../src/config/merge.js";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import { startSwitchboard, type SwitchboardDeps } from "../src/server.mjs";

/** Boots the way an edge does: the caller's layer over `env`'s. */
export function bootSwitchboard(
  config: SwitchboardConfigInput,
  deps: SwitchboardDeps = {},
  env: NodeJS.ProcessEnv = process.env,
): ReturnType<typeof startSwitchboard> {
  return startSwitchboard(
    callerOverEnv(
      switchboardConfigFromEnv(env, { logger: deps.logger }),
      config,
    ),
    deps,
  );
}

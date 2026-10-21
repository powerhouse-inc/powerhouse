import { accessToken } from "./access-token.js";
import { build } from "./build.js";
import { connect } from "./connect.js";
import { generate } from "./generate.js";
import { init } from "./init.js";
import { inspect } from "./inspect.js";
import { install } from "./install.js";
import { list } from "./list.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { migrate } from "./migrate.js";
import { model } from "./model.js";
import { publish } from "./publish.js";
import { registryLogin } from "./registry-login.js";
import { runHost } from "./run.js";
import { scalar } from "./scalar.js";
import { subgraph } from "./subgraph.js";
import { switchboard } from "./switchboard.js";
import { uninstall } from "./uninstall.js";
import { unpublish } from "./unpublish.js";
import { vetra } from "./vetra.js";
import { isUniformRunnersEnabled } from "../utils/feature-flags.js";

const baseCommands = {
  init,
  generate,
  vetra,
  connect,
  build,
  publish,
  unpublish,
  "access-token": accessToken,
  "registry-login": registryLogin,
  inspect,
  list,
  migrate,
  model,
  subgraph,
  scalar,
  switchboard,
  login,
  logout,
  install,
  uninstall,
} as const;

/** Exported for tests; the flag decides whether `run` is registered at all,
 * so flag-off keeps the command surface byte-identical to before. */
export function buildPhCliCommands(uniformRunners: boolean) {
  return uniformRunners ? { ...baseCommands, run: runHost } : baseCommands;
}

export const phCliCommands = buildPhCliCommands(isUniformRunnersEnabled());

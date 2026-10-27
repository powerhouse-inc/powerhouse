import { accessToken } from "./access-token.js";
import { build } from "./build.js";
import { connect } from "./connect.js";
import { generate } from "./generate.js";
import { host } from "./host.js";
import { init } from "./init.js";
import { inspect } from "./inspect.js";
import { install } from "./install.js";
import { list } from "./list.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { mcp } from "./mcp.js";
import { migrate } from "./migrate.js";
import { publish } from "./publish.js";
import { registryLogin } from "./registry-login.js";
import { runHost } from "./run.js";
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
  mcp,
  migrate,
  switchboard,
  login,
  logout,
  install,
  uninstall,
} as const;

/** Exported for tests; the flag decides whether `run` and `host` are
 * registered at all, so flag-off keeps the command surface byte-identical. */
export function buildPhCliCommands(uniformRunners: boolean) {
  return uniformRunners
    ? { ...baseCommands, run: runHost, host }
    : baseCommands;
}

export const phCliCommands = buildPhCliCommands(isUniformRunnersEnabled());

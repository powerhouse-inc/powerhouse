import { accessToken } from "./access-token.js";
import { build } from "./build.js";
import { connect } from "./connect.js";
import { credentials } from "./credentials.js";
import { generate } from "./generate.js";
import { host } from "./host.js";
import { identity } from "./identity.js";
import { init } from "./init.js";
import { inspect } from "./inspect.js";
import { install } from "./install.js";
import { keyframes } from "./keyframes.js";
import { list } from "./list.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { mcp } from "./mcp.js";
import { migrate } from "./migrate.js";
import { model } from "./model.js";
import { mutate } from "./mutate.js";
import { publish } from "./publish.js";
import { registryLogin } from "./registry-login.js";
import { runHost } from "./run.js";
import { token } from "./token.js";
import { uninstall } from "./uninstall.js";
import { unpublish } from "./unpublish.js";
import { vetra } from "./vetra.js";
import { whoami } from "./whoami.js";

export const phCliCommands = {
  init,
  generate,
  connect,
  build,
  publish,
  unpublish,
  "access-token": accessToken,
  "registry-login": registryLogin,
  inspect,
  keyframes,
  list,
  mcp,
  migrate,
  model,
  mutate,
  login,
  logout,
  whoami,
  identity,
  credentials,
  token,
  install,
  uninstall,
  run: runHost,
  host,
  vetra,
} as const;

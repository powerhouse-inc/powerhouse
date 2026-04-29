import { accessToken } from "./access-token.js";
import { build } from "./build.js";
import { code } from "./code.js";
import { connect } from "./connect.js";
import { generate } from "./generate.js";
import { init } from "./init.js";
import { inspect } from "./inspect.js";
import { install } from "./install.js";
import { list } from "./list.js";
import { login } from "./login.js";
import { logout } from "./logout.js";
import { migrate } from "./migrate.js";
import { publish } from "./publish.js";
import { switchboard } from "./switchboard.js";
import { uninstall } from "./uninstall.js";
import { unpublish } from "./unpublish.js";
import { vetra } from "./vetra.js";

export const phCliCommands = {
  init,
  code,
  generate,
  vetra,
  connect,
  build,
  publish,
  unpublish,
  "access-token": accessToken,
  inspect,
  list,
  migrate,
  switchboard,
  login,
  logout,
  install,
  uninstall,
} as const;

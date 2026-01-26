import { accessToken } from "./access-token.js";
import { connect } from "./connect.js";
import { generate } from "./generate.js";
import { inspect } from "./inspect.js";
import { install } from "./install.js";
import { list } from "./list.js";
import { login } from "./login.js";
import { migrate } from "./migrate.js";
import { switchboard } from "./switchboard.js";
import { uninstall } from "./uninstall.js";
import { vetra } from "./vetra.js";

export const phCliCommands = {
  generate,
  vetra,
  connect,
  "access-token": accessToken,
  inspect,
  list,
  migrate,
  switchboard,
  login,
  install,
  uninstall,
} as const;

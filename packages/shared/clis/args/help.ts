import { command } from "cmd-ts";
import type { phCliCommandNames } from "../command-names.js";
import { accessTokenArgs } from "./access-token.js";
import { debugArgs } from "./common.js";
import { connectArgs } from "./connect.js";
import { generateArgs } from "./generate.js";
import { inspectArgs } from "./inspect.js";
import { installArgs } from "./install.js";
import { listArgs } from "./list.js";
import { loginArgs } from "./login.js";
import { migrateArgs } from "./migrate.js";
import { publishArgs } from "./publish.js";
import { registryLoginArgs } from "./registry.js";
import { switchboardArgs } from "./switchboard.js";
import { uninstallArgs } from "./uninstall.js";
import { vetraArgs } from "./vetra.js";

// Thin wrapper around `command()` that preserves the literal types of
// `name` and `aliases` on the return value.
function helpCommand<
  const N extends string,
  const A extends readonly string[] = readonly [],
>(
  config: Parameters<typeof command>[0] & { name: N; aliases?: A },
): ReturnType<typeof command> & { readonly name: N; readonly aliases: A } {
  const aliases = (config.aliases ?? ([] as readonly string[])) as A;
  // Forward the original config (with the normalized aliases) through cmd-ts
  // and re-attach the literal types via a localized cast.
  return Object.assign(command({ ...config, aliases: [...aliases] }), {
    name: config.name,
    aliases,
  }) as ReturnType<typeof command> & {
    readonly name: N;
    readonly aliases: A;
  };
}

export const phCliHelpCommands = {
  generate: helpCommand({
    name: "generate",
    args: generateArgs,
    description: "Generate powerhouse code",
    handler: () => {},
  }),
  vetra: helpCommand({
    name: "vetra",
    args: vetraArgs,
    description:
      "Starts Vetra development environment with switchboard, reactor, and connect",
    handler: () => {},
  }),
  connect: helpCommand({
    name: "connect",
    args: connectArgs,
    description: "Powerhouse Connect commands",
    handler: () => {},
  }),
  build: helpCommand({
    name: "build",
    args: debugArgs,
    description: "Build your project for publishing to the registry",
    handler: () => {},
  }),
  publish: helpCommand({
    name: "publish",
    args: publishArgs,
    description: "Publish a package to the Powerhouse registry",
    handler: () => {},
  }),
  list: helpCommand({
    name: "list",
    aliases: ["l"],
    args: listArgs,
    description: "List installed packages",
    handler: () => {},
  }),
  "access-token": helpCommand({
    name: "access-token",
    args: accessTokenArgs,
    description: "Generate a bearer token for API authentication",
    handler: () => {},
  }),
  "registry-login": helpCommand({
    name: "registry-login",
    args: registryLoginArgs,
    description:
      "Log in to a Powerhouse registry (writes a Renown bearer token to ~/.npmrc)",
    handler: () => {},
  }),
  inspect: helpCommand({
    name: "inspect",
    aliases: ["is"],
    args: inspectArgs,
    description: "Inspect a package",
    handler: () => {},
  }),
  migrate: helpCommand({
    name: "migrate",
    args: migrateArgs,
    description: "Run migrations",
    handler: () => {},
  }),
  switchboard: helpCommand({
    name: "switchboard",
    aliases: ["reactor"],
    args: switchboardArgs,
    description: "Starts local Switchboard",
    handler: () => {},
  }),
  login: helpCommand({
    name: "login",
    args: loginArgs,
    description: "Authenticate with Renown using your Ethereum wallet",
    handler: () => {},
  }),
  logout: helpCommand({
    name: "logout",
    args: loginArgs,
    description: "Deletes an existing session created with 'ph login'",
    handler: () => {},
  }),
  install: helpCommand({
    name: "install",
    aliases: ["add", "i"],
    args: installArgs,
    description: "Install a Powerhouse dependency",
    handler: () => {},
  }),
  uninstall: helpCommand({
    name: "uninstall",
    aliases: ["remove"],
    args: uninstallArgs,
    description: "Uninstall a Powerhouse dependency",
    handler: () => {},
  }),
};

export { phCliCommandNames } from "../command-names.js";

// Compile-time drift guard: phCliCommandNames must match the names+aliases
// declared above. If you add or rename a command/alias, the type of
// `_DerivedNames` changes and the assignment below errors until
// `command-names.ts` is updated to match. Costs nothing at runtime.
type _DerivedNames = {
  [K in keyof typeof phCliHelpCommands]:
    | (typeof phCliHelpCommands)[K]["name"]
    | (typeof phCliHelpCommands)[K]["aliases"][number];
}[keyof typeof phCliHelpCommands];

type _Names = (typeof phCliCommandNames)[number];

type _Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _phCliCommandNamesInSync: _Equal<_DerivedNames, _Names> extends true
  ? true
  : never = true;

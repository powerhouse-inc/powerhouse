import { command } from "cmd-ts";
import type { phCliCommandNames } from "../command-names.js";
import { accessTokenArgs } from "./access-token.js";
import { debugArgs } from "./common.js";
import { connectConfigArgs } from "./connect.js";
import { generateArgs } from "./generate.js";
import { hostCheckArgs } from "./host.js";
import { inspectArgs } from "./inspect.js";
import { installArgs } from "./install.js";
import { keyframesArgs } from "./keyframes.js";
import { listArgs } from "./list.js";
import { loginArgs } from "./login.js";
import { mcpArgs } from "./mcp.js";
import { migrateArgs } from "./migrate.js";
import { modelCheckArgs } from "./model.js";
import { publishArgs } from "./publish.js";
import { registryLoginArgs } from "./registry.js";
import { runArgs } from "./run.js";
import { uninstallArgs } from "./uninstall.js";

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
  run: helpCommand({
    name: "run",
    args: runArgs,
    description: "Run a host from hosts/ with its runner",
    handler: () => {},
  }),
  host: helpCommand({
    name: "host",
    args: hostCheckArgs,
    description:
      "Check or export a host from hosts/: `ph host check|export <host>`",
    handler: () => {},
  }),
  generate: helpCommand({
    name: "generate",
    args: generateArgs,
    description: "Generate powerhouse code",
    handler: () => {},
  }),
  dev: helpCommand({
    name: "dev",
    args: debugArgs,
    description:
      "Run the project's dev host (hosts/dev) in dev mode: the same as `ph run dev`. A project with hosts/vetra and no hosts/dev runs that host",
    handler: () => {},
  }),
  vetra: helpCommand({
    name: "vetra",
    args: debugArgs,
    description:
      "Open Vetra Studio: `ph run @powerhousedao/vetra-cli/studio`, installing @powerhousedao/vetra-cli first when the project lacks it. The dev mode is `ph dev`",
    handler: () => {},
  }),
  connect: helpCommand({
    name: "connect",
    args: connectConfigArgs,
    description:
      "Run the project's connect host: `ph connect [studio|build|preview]` is `ph run connect dev|build|serve`. `ph connect config` reads and writes Connect's runtime configuration",
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
  mcp: helpCommand({
    name: "mcp",
    args: mcpArgs,
    description:
      "Serve the project's reactor-mcp tools over stdio, starting the project's dev host on the first tool call",
    handler: () => {},
  }),
  keyframes: helpCommand({
    name: "keyframes",
    args: keyframesArgs,
    description:
      "Report on and clean up the keyframes of a running switchboard",
    handler: () => {},
  }),
  migrate: helpCommand({
    name: "migrate",
    args: migrateArgs,
    description: "Run migrations",
    handler: () => {},
  }),
  model: helpCommand({
    name: "model",
    args: modelCheckArgs,
    description:
      "Check or inspect this package's document models (experimental): `ph model check|inspect`",
    handler: () => {},
  }),
  switchboard: helpCommand({
    name: "switchboard",
    args: debugArgs,
    description:
      "Run the project's switchboard host (hosts/switchboard): the same as `ph run switchboard`",
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

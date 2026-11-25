import { defineCli } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli whose configured `create` would build its own reactor, and the drive
// it wants on a remote switchboard. Under the runner `create` is never called.
export const cli = defineCli({
  name: "fixture-embedded",
  version: "0.0.1",
  description: "A Cli with its own reactor factory configured",
  commands,
  interactive: { welcome: "fixture-embedded shell" },
});

cli.configureReactor({
  create: () => Promise.reject(new Error("embedded reactor created")),
  remote: { drives: [{ name: "Notes", role: "personal" }] },
});

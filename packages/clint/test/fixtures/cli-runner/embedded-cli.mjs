import { defineCli } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli that configured an embedded reactor, switchboard and Connect in code,
// as vetra-cli does today, and the drive it wants on a remote switchboard.
// Under the runner none of the embedded parts may start.
export const cli = defineCli({
  name: "fixture-embedded",
  version: "0.0.1",
  description: "A Cli with an embedded reactor configured",
  commands,
  interactive: { welcome: "fixture-embedded shell" },
});

cli.configureReactor({
  create: () => Promise.reject(new Error("embedded reactor created")),
  switchboard: {
    enabled: true,
    port: Number(process.env.FIXTURE_SWITCHBOARD_PORT),
  },
  connect: { enabled: true, port: Number(process.env.FIXTURE_CONNECT_PORT) },
  remote: { drives: [{ name: "Notes", role: "personal" }] },
});

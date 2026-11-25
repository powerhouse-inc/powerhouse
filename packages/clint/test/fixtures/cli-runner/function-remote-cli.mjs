import path from "node:path";
import { defineCli } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli whose remote is a function of the setup context, as a Cli that reads
// its identity from its workdir has it: the drive it asks for is named after
// the workdir the runner gives it.
export const cli = defineCli({
  name: "fixture-function-remote",
  version: "0.0.1",
  description: "A Cli whose remote config is built at attach",
  commands,
});

cli.configureReactor({
  create: () => Promise.reject(new Error("embedded reactor created")),
  remote: (setup) =>
    Promise.resolve({
      drives: [
        { name: `Desk ${path.basename(setup.workdir)}`, role: "personal" },
      ],
    }),
});

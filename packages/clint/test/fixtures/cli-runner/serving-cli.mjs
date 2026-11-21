import { defineCli, defineTrigger } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli that keeps running without a shell: its routine has a trigger, which
// finds no work.
const idle = defineTrigger({
  id: "idle",
  type: "poll",
  poll: () => Promise.resolve(null),
});

export const cli = defineCli({
  name: "fixture-serving",
  version: "0.0.1",
  description: "A Cli that serves its routine",
  commands,
  triggers: [idle],
  routine: { tickInterval: 200 },
});

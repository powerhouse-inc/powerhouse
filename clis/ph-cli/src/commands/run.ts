import {
  boolean,
  command,
  flag,
  option,
  optional,
  positional,
  string,
} from "cmd-ts";

export const runHost = command({
  name: "run",
  description:
    "Run a host from the project's hosts/ folder: `ph run <host> [verb]`. " +
    "The host's own host.js names the runner module; the verb defaults to `run`. " +
    "Part of uniform-runners (FEATURE_UNIFORM_RUNNERS_ENABLED).",
  args: {
    host: positional({
      type: string,
      displayName: "host",
      description: "Folder name under hosts/ (e.g. vetra, connect).",
    }),
    verb: positional({
      type: optional(string),
      displayName: "verb",
      description: "Runner verb (default: run; e.g. dev, build, serve).",
    }),
    debug: flag({
      type: optional(boolean),
      long: "debug",
      description: "Print resolved host/runner/verb before dispatch.",
    }),
    explain: option({
      type: optional(string),
      long: "explain",
      description:
        "Explain a resolved aspect instead of running: `--explain drives` " +
        "prints the merged drive plan with provenance.",
    }),
  },
  handler: async (args) => {
    if (args.explain !== undefined) {
      const { explainHost } = await import("../services/run/explain.js");
      await explainHost({ host: args.host, topic: args.explain });
      return;
    }
    const { startRun } = await import("../services/run/start-run.js");
    await startRun({ host: args.host, verb: args.verb, debug: args.debug });
  },
});

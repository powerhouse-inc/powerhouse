import {
  boolean,
  command,
  flag,
  option,
  optional,
  positional,
  restPositionals,
  string,
} from "cmd-ts";

export const runHost = command({
  name: "run",
  description:
    "Run a host from the project's hosts/ folder: `ph run <host> [verb]`. " +
    "The host's own host.js names the runner module; the verb defaults to `run`. " +
    "Arguments after the verb go to the runner, which names the ones it accepts. " +
    "`ph run <package>/<host>` runs a host that an installed package supplies.",
  args: {
    host: positional({
      type: string,
      displayName: "host",
      description:
        "Folder name under hosts/ (e.g. vetra, connect), or `<package>/<host>` " +
        "for one in an installed package's hosts/ (e.g. `@acme/tools/studio`).",
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
    stop: flag({
      type: optional(boolean),
      long: "stop",
      description:
        "Stop the project's running instance of this host instead of " +
        "starting one: it shuts down as on Ctrl-C, and the command returns " +
        "when it has.",
    }),
    explain: option({
      type: optional(string),
      long: "explain",
      description:
        "Explain a resolved aspect instead of running: `--explain drives` " +
        "prints the merged drive plan with provenance; `--explain outputs` " +
        "prints what each host produces, the output tokens it reads and " +
        "the start order they imply.",
    }),
    // cli.ts moves the runner's arguments behind a `--` (forwardRunnerArgv).
    argv: restPositionals({
      type: string,
      displayName: "runner arguments",
      description:
        "Arguments for the host's runner (e.g. --port 4001); they win over " +
        "the host file.",
    }),
  },
  handler: async (args) => {
    if (args.explain !== undefined) {
      const { explainHost } = await import("../services/run/explain.js");
      await explainHost({ host: args.host, topic: args.explain });
      return;
    }
    if (args.stop) {
      const { stopRunningHost } =
        await import("@powerhousedao/ph-run/start-run");
      await stopRunningHost({ host: args.host });
      return;
    }
    const run = {
      host: args.host,
      verb: args.verb,
      debug: args.debug,
      argv: args.argv,
    };
    // hosts/vetra is what `ph vetra` is sugar for (run-sugar.ts): its stack
    // keeps the runtime record `ph mcp` reads.
    if (args.host === "vetra") {
      const { runVetraHost } = await import("../services/run/vetra-host.js");
      await runVetraHost(run);
      return;
    }
    const { startRun } = await import("@powerhousedao/ph-run/start-run");
    await startRun(run);
  },
});

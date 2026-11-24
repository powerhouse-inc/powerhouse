import { runSafely } from "cmd-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import type * as StartRun from "@powerhousedao/ph-run/start-run";
import { runHost } from "../src/commands/run.js";
import { vetra } from "../src/commands/vetra.js";
import { forwardRunnerArgv } from "../src/utils/run-sugar.js";
// Loaded here first: a runner that host-core loads itself would get the real
// host-core, since vitest hands a mocked module's original to what that
// original imports.
import "./fixtures/parity-gate/ph-cli/connect.js";
import "./fixtures/parity-gate/ph-cli/switchboard.js";
import {
  adjustAllowlist,
  diffShapes,
  expectOnlyAllowedDifferences,
  relocate,
  shapeOf,
  type AllowedDifference,
  type Relocation,
  type Shape,
} from "./parity-gate.js";
import {
  makeParityProject,
  NEUTRAL_ENV,
  observe,
  OPAQUE_PATHS,
  removeParityProjects,
  resetRecorded,
  trackProcessListeners,
} from "./parity-project.js";

/**
 * Call-shape gate: `ph vetra` against `ph run vetra`.
 *
 * Each path runs for real up to its two services: the classic cmd-ts command
 * parses a real argv and `startVetra` runs; the `run` command takes the argv
 * cli.ts forwards to it, `runVetraHost` starts the scaffolded vetra host, and
 * the compound runner starts its switchboard and Studio members through
 * their runners. The switchboard service, Connect Studio,
 * the drive helpers and plugin resolution are stand-ins
 * (test/parity-project.ts), so what is compared is the `startSwitchboard`
 * call and the `runConnectStudio` call each path makes, the drives each
 * seeds itself, and what each leaves under the project.
 *
 * The two differ as `DIFFERENCES` lists, and in no other way. A fact the two
 * carry at different places is compared by value (`SAME_FACT_ELSEWHERE`).
 */

vi.mock("@powerhousedao/ph-run/switchboard", async () => {
  const { switchboardService } = await import("./parity-project.js");
  return switchboardService;
});
vi.mock("@powerhousedao/switchboard/utils", async () => {
  const { switchboardUtils } = await import("./parity-project.js");
  return switchboardUtils;
});
vi.mock("@powerhousedao/host-core", async (importOriginal) => {
  const actual = await importOriginal<typeof HostCore>();
  const { resolveHostPlugins } = await import("./parity-project.js");
  return { ...actual, resolveHostPlugins };
});
vi.mock("../src/services/connect-studio.js", async () => {
  const { connectStudioService } = await import("./parity-project.js");
  return connectStudioService;
});
vi.mock("../src/utils/resolve-switchboard-port.js", async () => {
  const { portResolver } = await import("./parity-project.js");
  return portResolver;
});
vi.mock("../src/utils/configure-vetra-github-url.js", async () => {
  const { githubUrl } = await import("./parity-project.js");
  return githubUrl;
});

// `ph run` keeps the stack's handle to itself: the gate needs it to stop.
const started = vi.hoisted(() => ({ runs: [] as unknown[] }));
vi.mock("@powerhousedao/ph-run/start-run", async (importOriginal) => {
  const actual = await importOriginal<typeof StartRun>();
  return {
    ...actual,
    startRun: async (args: StartRun.StartRunArgs) => {
      const result = await actual.startRun(args);
      started.runs.push(result);
      return result;
    },
  };
});

/**
 * What the hosts path carries at another place than classic does. Each is
 * read at the classic place before the two are compared, so the VALUES are
 * held equal: nothing here is a listed difference.
 */
const SAME_FACT_ELSEWHERE: Relocation[] = [
  {
    from: "plugins.switchboard.3.config.processorConfig",
    to: "switchboard.options.processorConfig",
    reason:
      "the runner sets the codegen processor's VetraConfig on the vetra-studio plugin entry (runners/switchboard.ts withStudioProcessorConfig), and the plugin merges it into the server's processorConfig map (packages/vetra-studio/src/switchboard.ts); classic passes the map itself (services/vetra.ts startLocalVetraSwitchboard)",
  },
];

const TIMEOUT = 30_000;
const cwd = process.cwd();
let untrackListeners: () => void;

beforeEach(() => {
  untrackListeners = trackProcessListeners();
  for (const name of NEUTRAL_ENV) vi.stubEnv(name, undefined);
  // The switchboard runner's readiness probe of the drive it serves.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200 })),
  );
  for (const method of ["log", "info", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation(() => undefined);
  }
});

afterEach(() => {
  untrackListeners();
  process.chdir(cwd);
  removeParityProjects();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** `ph vetra <argv>` in a fresh scaffolded project. */
async function classic(argv: string[]): Promise<Shape> {
  const project = await makeParityProject();
  process.chdir(project.root);
  resetRecorded();
  const result = await runSafely(vetra, argv);
  if (result._tag === "error") throw new Error(result.error.config.message);
  // `startVetra` reports a failure on the console and returns.
  expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  return shapeOf(observe(project), {
    opaque: OPAQUE_PATHS,
    normalize: project.normalize,
  });
}

/**
 * `ph run vetra <argv>` in a fresh scaffolded project: the `run` command
 * itself, behind the argv rewrite cli.ts gives it, so what `runVetraHost`
 * does around `startRun` is observed too.
 */
async function hosts(argv: string[]): Promise<Shape> {
  const project = await makeParityProject();
  process.chdir(project.root);
  resetRecorded();
  started.runs.length = 0;
  const forwarded = forwardRunnerArgv(["run", "vetra", ...argv]);
  const result = await runSafely(runHost, forwarded.slice(1));
  if (result._tag === "error") throw new Error(result.error.config.message);
  expect(started.runs).toHaveLength(1);
  const shape = relocate(
    shapeOf(observe(project), {
      opaque: OPAQUE_PATHS,
      normalize: project.normalize,
    }),
    SAME_FACT_ELSEWHERE,
  );
  await (started.runs[0] as { shutdown: () => Promise<void> }).shutdown();
  return shape;
}

const under = (prefix: string, keys: readonly string[]) =>
  keys.map((key) => `${prefix}.${key}`);

/**
 * Every way `ph run vetra` differs from `ph vetra` for a scaffolded project,
 * without flags.
 */
const DIFFERENCES: AllowedDifference[] = [
  /* ------------------------------------------- the switchboard service */
  {
    paths: under("switchboard.options", [
      "bindCLIShortcuts",
      "connectBasePath",
      "connectPort",
      "cors",
      "defaultDrivesUrl",
      "disableConnect",
      "drivesPreserveStrategy",
      "drivesPublicBase",
      "force",
      "host",
      "interactive",
      "localPackage",
      "logLevel",
      "open",
      "printUrls",
      "remoteDrive",
      "renownNamespace",
      "restart",
      "switchboardPort",
      "verbose",
      "watch",
      "watchTimeout",
    ]),
    hosts: "<absent>",
    reason:
      "classic spreads its whole parsed argv into the call (services/vetra.ts startLocalVetraSwitchboard, `...args`); the runner passes the switchboard arguments only (ph-run runners/switchboard.ts toSwitchboardArgs)",
  },
  {
    // Compared through SAME_FACT_ELSEWHERE; driveId and interactive agree.
    paths: ["switchboard.options.processorConfig.VetraConfig.driveUrl"],
    classic: '"http://localhost:2650/d/vetra-<project-hash>"',
    hosts: '"http://localhost:7650/d/vetra-<project-hash>"',
    reason:
      "the codegen processor's local drive URL: classic builds it on the CONNECT port (services/vetra.ts startLocalVetraSwitchboard, getDefaultVetraUrl(connectPort)), the runner on the switchboard port, where the drive is served (runners/switchboard.ts startVetraSwitchboard, requestedPort)",
  },
  {
    paths: ["studio.options.devPlugins.where"],
    classic: '"ph vetra"',
    hosts: '"hosts/parity-lab-connect/host.js"',
    reason:
      "where the dev-server plugin entries are written, for an error message: classic has no host file, so it names its command (services/vetra.ts), and the runner names the host file whose runner.devPlugins it passes (runners/connect.ts startStudio)",
  },
  {
    paths: ["switchboard.options.useVetraDrive"],
    classic: "true",
    hosts: "false",
    reason:
      "classic has the server create the Vetra drive; the vetra host declares it under reactor.drives and the runner creates it (see seeds)",
  },
  {
    paths: ["switchboard.options.vetraDriveId"],
    classic: '"vetra-<project-hash>"',
    hosts: '"vetra"',
    reason:
      "the runner leaves the argument at its default, since the declared drive carries the id (seeds.vetra-<project-hash>.id)",
  },
  {
    paths: ["seeds.vetra-<project-hash>.*"],
    reason:
      "the declared Vetra drive, created by the runner after start with the id and app the classic server gives it",
  },
  {
    paths: ["seeds.vetra-preview-<project-hash>.*"],
    reason:
      "the vetra host always declares a preview drive, as vetra-preview-<hash>; classic creates one only under --watch, as preview-<hash> (services/vetra.ts startVetraPreviewDrive)",
  },
  {
    paths: ["switchboard.options.drive", "seeds.powerhouse.*"],
    reason:
      "the host declares reactor.drives, so the runner passes `drive: undefined` and creates the switchboard host's powerhouse drive too; classic vetra has no powerhouse drive",
  },
  {
    paths: ["switchboard.options.mcp"],
    classic: "true",
    hosts: "undefined",
    reason:
      "a declared composition owns the switch: the mcp plugin's presence sets it (ph-run runners/switchboard.ts toSwitchboardArgs)",
  },
  {
    paths: ["switchboard.options.strictPort"],
    classic: "true",
    hosts: "<absent>",
    reason:
      "classic probes the port itself and then always binds strictly (startLocalVetraSwitchboard); the runner passes strictPort only when given",
  },
  {
    paths: ["effects.portProbes"],
    classic: '"7650"',
    hosts: '""',
    reason:
      "classic's own probe for a free switchboard port (utils/resolve-switchboard-port.ts), which the hosts path does not run",
  },
  {
    paths: ["switchboard.options.pluginComposition"],
    classic: "<absent>",
    hosts: "<opaque>",
    reason:
      "the member declares runner.plugins, so the runner resolves them and hands them on",
  },
  {
    paths: [
      "plugins.switchboard.0",
      "plugins.switchboard.1",
      "plugins.switchboard.2",
    ],
    reason:
      "the switchboard host's composition (mcp, attachments, workflows): classic has no composition",
  },
  {
    paths: [
      "plugins.switchboard.3.module",
      "plugins.switchboard.3.enabled",
      "plugins.switchboard.3.verbs.0",
    ],
    classic: "<absent>",
    reason:
      "the vetra-studio switchboard plugin, for `dev`, as the entry the runner normalizes to carry the VetraConfig (runners/switchboard.ts withStudioProcessorConfig): what stands in for classic's hard-wired Vetra processors",
  },
  {
    paths: ["seeds.workflows.*"],
    reason:
      "the workflows plugin's drive, which the runner seeds; classic seeds it only when the config turns workflows on",
  },
  {
    paths: ["switchboard.options.readyAfter"],
    classic: "<absent>",
    hosts: "<promise>",
    reason: "/ready waits for the drives the runner seeds after start",
  },
  {
    paths: ["switchboard.options.signalHandlers"],
    classic: "<absent>",
    hosts: "false",
    reason:
      "under a compound the parent owns the signals (runners/switchboard.ts start, ctx.parent)",
  },
  {
    paths: ["switchboard.logger"],
    classic: "<opaque>",
    hosts: "undefined",
    reason:
      "classic hands the server a [vetra, switchboard] child logger; the runner leaves it its own",
  },
  {
    paths: ["switchboard.base"],
    classic: "undefined",
    hosts: "<opaque>",
    reason:
      "the member's own config goes under the args as the third argument (memberSwitchboardConfig)",
  },

  /* ------------------------------------------------------ Connect Studio */
  {
    paths: under("studio.args", [
      "connectPort",
      "dbPath",
      "dev",
      "disableConnect",
      "drivesPublicBase",
      "https",
      "httpsCertFile",
      "httpsKeyFile",
      "interactive",
      "remoteDrive",
      "remoteDrives",
      "restart",
      "switchboardPort",
      "verbose",
      "watch",
    ]),
    hosts: "<absent>",
    reason:
      "classic spreads its whole parsed `ph vetra` argv into the call (services/vetra.ts startVetra, `...args`); the runner passes the classic `ph connect studio` arguments (runners/connect.ts toStudioArgs over services/classic-args.ts), which have none of the keys only `ph vetra` takes",
  },
  {
    paths: ["studio.args.bindCLIShortcuts"],
    classic: "true",
    hosts: "false",
    reason:
      "toStudioArgs fixes it to false; classic passes the flag's default, true",
  },
  {
    paths: ["studio.args.open", "studio.args.strictPort"],
    classic: "undefined",
    hosts: "false",
    reason:
      "toStudioArgs turns an unset flag into false; classic passes the unset flag on",
  },
  {
    paths: ["studio.logger"],
    classic: "<opaque>",
    hosts: "undefined",
    reason: "classic hands Studio its own green vite logger",
  },
  {
    paths: [
      "studio.options.cacheDir",
      "studio.options.proxy",
      "studio.options.routes",
    ],
    classic: "<absent>",
    reason:
      "the runner's own options: a vite cache per host, and the host's routes and proxy (runners/connect.ts dev)",
  },
  {
    paths: ["studio.options.exposeStop", "studio.options.restartWith"],
    classic: "<absent>",
    hosts: "<function>",
    reason:
      "the runner's hooks into a config-change restart: the restarted server starts under the supervisor as the first did, and the handle stops whichever is current (runners/connect.ts dev); classic restarts in place and stops through its own exit handling",
  },
  {
    // The drive's URL agrees: Studio opens on the switchboard's Vetra drive.
    paths: [
      "studio.override.drives.defaultDrives.0.backend",
      "studio.override.drives.defaultDrives.0.name",
    ],
    reason:
      "the member declares the Vetra drive by slug on a named backend (hosts/vetra reactor.drives); classic gives Studio the URL alone",
  },
  {
    // reactorClient agrees: "remote" on both.
    paths: [
      "studio.override.instance.remoteBackends.0.name",
      "studio.override.instance.remoteBackends.0.url",
    ],
    classic: "<absent>",
    reason:
      "the member's one backend, the switchboard member by its Vetra drive (hosts/vetra reactor.backends); classic sets reactorClient alone (services/vetra.ts buildVetraStudioOverride)",
  },
  {
    paths: ["studio.override.instance.reactorWorker"],
    classic: "<absent>",
    hosts: "false",
    reason: "derived from the member's backends: a remote one, so no worker",
  },
  {
    paths: [
      "studio.override.composition.0.*",
      "studio.override.composition.1.config",
      "studio.override.composition.1.module",
      "studio.override.composition.2.config.drive",
      "studio.override.composition.2.module",
    ],
    classic: "<absent>",
    reason:
      "the member's composition (generic, vetra-studio, workflows on the switchboard's Workflows drive): classic has no composition",
  },

  /* --------------------------------------------------- left behind */
  {
    paths: ["effects.runRecords"],
    classic: '""',
    hosts: '"vetra.json"',
    reason:
      "`ph run` publishes the host's outputs in .ph/run/<host>.json; classic writes no such record",
  },
];

const REMOTE_DRIVE = "http://localhost:9/d/remote-x";
const FLAGS = [
  "--switchboard-port",
  "7711",
  "--connect-port",
  "7712",
  "--strictPort",
  "--remote-drive",
  REMOTE_DRIVE,
];

describe("ph vetra and ph run vetra", () => {
  it(
    "make the same two service calls without flags, but for the listed differences",
    async () => {
      const [classicShape, hostsShape] = [await classic([]), await hosts([])];
      for (const shape of [classicShape, hostsShape]) {
        expect(shape.get("switchboard.options.port")).toBe("7650");
        expect(shape.get("studio.args.port")).toBe("2650");
        // Both keep the runtime record, and correct the drifted .mcp.json.
        expect(shape.get("effects.vetraRuntimeRecord")).toBe("true");
        expect(shape.get("effects.mcpJsonUrl")).toBe(
          '"http://localhost:7650/mcp"',
        );
      }
      expectOnlyAllowedDifferences(
        "ph vetra | ph run vetra",
        diffShapes(classicShape, hostsShape),
        DIFFERENCES,
      );
    },
    TIMEOUT,
  );

  it(
    "carry the ports, --strictPort and --remote-drive to both services",
    async () => {
      const [classicShape, hostsShape] = [
        await classic(FLAGS),
        await hosts(FLAGS),
      ];
      for (const shape of [classicShape, hostsShape]) {
        expect(shape.get("switchboard.options.port")).toBe("7711");
        expect(shape.get("switchboard.options.strictPort")).toBe("true");
        expect(shape.get("switchboard.options.remoteDrives.0")).toBe(
          JSON.stringify(REMOTE_DRIVE),
        );
        expect(shape.get("studio.args.port")).toBe("7712");
        expect(shape.get("studio.args.strictPort")).toBe("true");
        // The codegen processor works on the remote drive.
        expect(
          shape.get("switchboard.options.processorConfig.VetraConfig.driveUrl"),
        ).toBe(JSON.stringify(REMOTE_DRIVE));
        expect(
          shape.get("switchboard.options.processorConfig.VetraConfig.driveId"),
        ).toBe('"remote-x"');
        // Its GitHub URL is set once, and the records follow the port given.
        expect(shape.get("effects.githubUrlCalls")).toBe("1");
        expect(shape.get("effects.vetraRuntimeRecord")).toBe("true");
        expect(shape.get("effects.mcpJsonUrl")).toBe(
          '"http://localhost:7711/mcp"',
        );
      }
      expectOnlyAllowedDifferences(
        "ph vetra <flags> | ph run vetra <flags>",
        diffShapes(classicShape, hostsShape),
        adjustAllowlist(DIFFERENCES, {
          dropped: [
            // Given, so both paths bind strictly, and classic does not probe.
            "switchboard.options.strictPort",
            "studio.args.strictPort",
            "effects.portProbes",
            // Both hand the processor the remote drive's own URL.
            "switchboard.options.processorConfig.VetraConfig.driveUrl",
          ],
          added: [
            {
              paths: ["studio.override.instance.reactorClient"],
              classic: "<absent>",
              hosts: '"remote"',
              reason:
                "with a remote drive classic Studio keeps its own reactor and syncs that drive (buildVetraStudioOverride); the member stays a client of the switchboard member, which syncs it",
            },
            {
              paths: ["studio.override.drives.defaultDrives.0.url"],
              classic: '"http://localhost:7711/d/remote-x"',
              hosts: '"http://localhost:7711/d/vetra-<project-hash>"',
              reason:
                "classic Studio opens on the remote drive itself; the member opens on the switchboard member's Vetra drive, as without the flag",
            },
          ],
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "--watch adds the preview drive on classic, and nothing on the hosts path",
    async () => {
      const without = await hosts([]);
      const warn = vi.mocked(console.warn);
      warn.mockClear();
      const withFlag = await hosts(["--watch"]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("--watch is retired and has no effect"),
      );
      expect(diffShapes(without, withFlag)).toEqual([]);

      expectOnlyAllowedDifferences(
        "ph vetra --watch | ph run vetra --watch",
        diffShapes(await classic(["--watch"]), withFlag),
        adjustAllowlist(DIFFERENCES, {
          added: [
            {
              paths: ["seeds.preview-<project-hash>.*"],
              hosts: "<absent>",
              reason:
                "classic's preview drive, preview-<hash>; the host's is vetra-preview-<hash>, with or without the flag",
            },
            {
              paths: ["studio.override.drives.defaultDrives.1.*"],
              hosts: "<absent>",
              reason:
                "classic adds its preview drive to Studio's default drives; the member's config lists neither preview drive",
            },
          ],
        }),
      );
    },
    TIMEOUT,
  );

  it(
    "--interactive reaches the codegen processor on both paths",
    async () => {
      const INTERACTIVE =
        "switchboard.options.processorConfig.VetraConfig.interactive";
      // Unset, it is false on both.
      expect((await classic([])).get(INTERACTIVE)).toBe("false");
      expect((await hosts([])).get(INTERACTIVE)).toBe("false");

      const [classicShape, hostsShape] = [
        await classic(["--interactive"]),
        await hosts(["--interactive"]),
      ];
      expect(classicShape.get(INTERACTIVE)).toBe("true");
      expect(hostsShape.get(INTERACTIVE)).toBe("true");
      // And it changes nothing else: the list is the one without flags.
      expectOnlyAllowedDifferences(
        "ph vetra --interactive | ph run vetra --interactive",
        diffShapes(classicShape, hostsShape),
        DIFFERENCES,
      );
    },
    TIMEOUT,
  );
});

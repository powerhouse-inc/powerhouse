import { runSafely } from "cmd-ts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import { startRun } from "@powerhousedao/ph-run/start-run";
import { switchboard } from "../src/commands/switchboard.js";
// Loaded here first: a runner that host-core loads itself would get the real
// host-core, since vitest hands a mocked module's original to what that
// original imports.
import "./fixtures/parity-gate/ph-cli/switchboard.js";
import {
  adjustAllowlist,
  diffShapes,
  expectOnlyAllowedDifferences,
  shapeOf,
  type AllowedDifference,
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
 * Call-shape gate: `ph switchboard` against `ph run switchboard`.
 *
 * Each path runs for real up to the switchboard service: the classic cmd-ts
 * command parses a real argv and its handler runs; `startRun` loads the
 * scaffolded switchboard host and runs its runner. The service, the drive
 * helpers and plugin resolution are stand-ins (test/parity-project.ts), so
 * what is compared is the `startSwitchboard` call each path makes, the
 * drives each seeds itself, and what each leaves under the project.
 *
 * The two differ as `DIFFERENCES` lists, and in no other way.
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

const TIMEOUT = 30_000;
const cwd = process.cwd();
let untrackListeners: () => void;

beforeEach(() => {
  untrackListeners = trackProcessListeners();
  for (const name of NEUTRAL_ENV) vi.stubEnv(name, undefined);
  // The runner's readiness probe of the drive it serves.
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

/** `ph switchboard <argv>` in a fresh scaffolded project. */
async function classic(argv: string[]): Promise<Shape> {
  const project = await makeParityProject();
  process.chdir(project.root);
  resetRecorded();
  const result = await runSafely(switchboard, argv);
  if (result._tag === "error") throw new Error(result.error.config.message);
  return shapeOf(observe(project), {
    opaque: OPAQUE_PATHS,
    normalize: project.normalize,
  });
}

/** `ph run switchboard <argv>` in a fresh scaffolded project. */
async function hosts(argv: string[]): Promise<Shape> {
  const project = await makeParityProject();
  process.chdir(project.root);
  resetRecorded();
  const handle = (await startRun({ host: "switchboard", argv })) as {
    shutdown: () => Promise<void>;
  };
  const shape = shapeOf(observe(project), {
    opaque: OPAQUE_PATHS,
    normalize: project.normalize,
  });
  await handle.shutdown();
  return shape;
}

/**
 * Every way `ph run switchboard` differs from `ph switchboard` for a
 * scaffolded project, without flags.
 */
const DIFFERENCES: AllowedDifference[] = [
  {
    paths: ["switchboard.options.port"],
    classic: "4001",
    hosts: "7650",
    reason:
      "the scaffolded host reads reactor.port from powerhouse.config.json (codegen templates/boilerplate/hosts.ts, switchboardHost); classic takes PH_SWITCHBOARD_PORT or 4001 and never the config (shared/clis/args/switchboard.ts)",
  },
  {
    paths: ["switchboard.options.mcp"],
    classic: "true",
    hosts: "undefined",
    reason:
      "a declared composition owns the switch: the mcp plugin's presence sets it (ph-run runners/switchboard.ts toSwitchboardArgs, `mcp: composed ? undefined : classic.mcp`)",
  },
  {
    paths: ["switchboard.options.pluginComposition"],
    classic: "<absent>",
    hosts: "<opaque>",
    reason:
      "the host declares runner.plugins, so the runner resolves them and hands them on (runners/switchboard.ts start, resolveHostPlugins)",
  },
  {
    paths: ["plugins.switchboard.0", "plugins.switchboard.1"],
    reason:
      "the scaffolded composition, mcp and attachments: classic has no composition",
  },
  {
    paths: ["plugins.switchboard.2", "seeds.workflows.*"],
    reason:
      "the scaffolded composition has the workflows plugin, whose drive the runner seeds; classic seeds none, and serves workflows only when the config turns them on",
  },
  {
    paths: ["switchboard.options.drive", "seeds.powerhouse.*"],
    reason:
      "the host declares reactor.drives, so the runner passes `drive: undefined` (no implicit default drive) and creates the declared powerhouse drive itself (runners/switchboard.ts start, serverArgs and seedDrives); on classic the server creates it",
  },
  {
    paths: ["switchboard.options.readyAfter"],
    classic: "<absent>",
    hosts: "<promise>",
    reason:
      "/ready waits for the drives the runner seeds after start (runners/switchboard.ts start)",
  },
  {
    paths: ["switchboard.base"],
    classic: "undefined",
    hosts: "<opaque>",
    reason:
      "the host's own config goes under the args as the third argument (runners/switchboard.ts start, memberSwitchboardConfig); classic leaves the service to read the process env",
  },
  {
    paths: ["effects.runRecords"],
    classic: '""',
    hosts: '"parity-lab-switchboard.json"',
    reason:
      "`ph run` publishes the host's outputs in .ph/run/<host>.json (ph-run services/run/start-run.ts publishOutputs); classic writes no record",
  },
];

describe("ph switchboard and ph run switchboard", () => {
  it(
    "make the same service call without flags, but for the listed differences",
    async () => {
      const differences = diffShapes(await classic([]), await hosts([]));
      expectOnlyAllowedDifferences(
        "ph switchboard | ph run switchboard",
        differences,
        DIFFERENCES,
      );
    },
    TIMEOUT,
  );

  it(
    "carry --port, --https and --db-path to the service alike",
    async () => {
      const argv = ["--port", "7777", "--https", "--db-path", "./.ph/custom"];
      const [classicShape, hostsShape] = [
        await classic(argv),
        await hosts(argv),
      ];
      for (const shape of [classicShape, hostsShape]) {
        expect(shape.get("switchboard.options.port")).toBe("7777");
        expect(shape.get("switchboard.options.https")).toBe("true");
        expect(shape.get("switchboard.options.dbPath")).toBe('"./.ph/custom"');
      }
      expectOnlyAllowedDifferences(
        "ph switchboard <flags> | ph run switchboard <flags>",
        diffShapes(classicShape, hostsShape),
        adjustAllowlist(DIFFERENCES, {
          dropped: ["switchboard.options.port"],
        }),
      );
    },
    TIMEOUT,
  );

  // Not a call-shape difference: one path has the flag, the other refuses it.
  it(
    "--strictPort exists only on the hosts path",
    async () => {
      await expect(classic(["--strictPort"])).rejects.toThrow(
        /Unknown arguments/,
      );
      const withFlag = await hosts(["--strictPort"]);
      expect(withFlag.get("switchboard.options.strictPort")).toBe("true");
      const without = await hosts([]);
      expect(without.has("switchboard.options.strictPort")).toBe(false);
    },
    TIMEOUT,
  );
});

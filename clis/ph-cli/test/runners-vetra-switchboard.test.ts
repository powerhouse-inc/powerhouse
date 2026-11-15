import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import type { PluginEntryData, RunnerContext } from "@powerhousedao/host-core";
import {
  hostSchema as switchboardHostSchema,
  type SwitchboardHost,
} from "../src/runners/switchboard.js";
import {
  printVetraSwitchboardUrls,
  vetraProcessorConfigOf,
} from "../src/services/vetra-switchboard.js";

/**
 * The vetra host's switchboard member (`ph run vetra`): a switchboard whose
 * composition has the Vetra Studio plugin active gets what classic `ph vetra`
 * gives its switchboard, from the same code —
 *  - the codegen processor's config (`VetraConfig`), handed to the server
 *    through the studio plugin's entry config;
 *  - the printed URL block, once the member is ready;
 *  - the GitHub URL of a remote vetra drive, before Connect starts.
 * Nothing starts here: the switchboard service is mocked.
 */

vi.mock("@powerhousedao/ph-run/switchboard", () => ({
  startSwitchboard: vi.fn().mockResolvedValue({
    workflowsEnabled: false,
    mcpEnabled: false,
    port: 7599,
    reactor: { fake: true },
    shutdown: vi.fn(),
  }),
}));
vi.mock("@powerhousedao/switchboard/utils", () => ({
  ensureDrive: vi.fn().mockResolvedValue("http://localhost:7599/d/x"),
}));
vi.mock("@powerhousedao/host-core", async (importOriginal) => {
  const actual = await importOriginal<typeof HostCore>();
  return { ...actual, resolveHostPlugins: vi.fn().mockResolvedValue([]) };
});
vi.mock("../src/utils/configure-vetra-github-url.js", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
  configureVetraGithubUrl: vi.fn().mockResolvedValue(undefined),
}));

const STUDIO = "@powerhousedao/vetra-studio/switchboard";
const REMOTE = "https://remote.example/d/remote-vetra";

const ctx = (verb: string, ...argv: string[]): RunnerContext => ({
  projectRoot: "/lab",
  verb,
  env: {},
  argv,
});

const studioDrives: NonNullable<SwitchboardHost["reactor"]>["drives"] = [
  { slug: "vetra", name: "Vetra", projectHash: true },
  { slug: "vetra-preview", name: "Vetra Preview", projectHash: true },
];

/** Verbs receive the PARSED host, as validateHost hands it to them. */
const vetraSwitchboard = (drives = studioDrives) =>
  switchboardHostSchema.parse({
    name: "lab-switchboard",
    runner: {
      module: "@powerhousedao/ph-cli/runners/switchboard",
      port: 7599,
      plugins: [
        "@powerhousedao/switchboard/plugins/attachments",
        { module: STUDIO, verbs: ["dev"] },
      ],
    },
    reactor: { drives },
  } satisfies SwitchboardHost);

/** The entries the runner resolved its composition from. */
async function resolvedEntries(): Promise<PluginEntryData[]> {
  const hostCore = await import("@powerhousedao/host-core");
  const calls = vi.mocked(hostCore.resolveHostPlugins).mock.calls;
  return [...calls[calls.length - 1][3]];
}

async function githubUrlCalls() {
  const { configureVetraGithubUrl } =
    await import("../src/utils/configure-vetra-github-url.js");
  return vi.mocked(configureVetraGithubUrl).mock.calls;
}

describe("switchboard runner — the vetra host's switchboard", () => {
  let log: MockInstance<typeof console.log>;

  beforeEach(async () => {
    // the readiness probe (waitForDrive): the drive answers
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { configureVetraGithubUrl } =
      await import("../src/utils/configure-vetra-github-url.js");
    vi.mocked(configureVetraGithubUrl).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    log.mockRestore();
  });

  it("hands the studio plugin the codegen processor config and prints the URLs once ready", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    const vetraId = hostCore.projectDriveId("/lab", "vetra");
    const previewId = hostCore.projectDriveId("/lab", "vetra-preview");

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.dev(
      vetraSwitchboard(),
      ctx("dev", "--interactive"),
    );

    // the other entries pass as written; the studio entry carries VetraConfig
    expect(await resolvedEntries()).toEqual([
      "@powerhousedao/switchboard/plugins/attachments",
      {
        module: STUDIO,
        enabled: true,
        verbs: ["dev"],
        config: {
          processorConfig: {
            VetraConfig: {
              interactive: true,
              driveUrl: `http://localhost:7599/d/${vetraId}`,
              // the declared vetra drive only: the preview drive's slug
              // also starts with "vetra-"
              driveId: vetraId,
            },
          },
        },
      },
    ]);

    await handle.ready;
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        "Vetra Switchboard: http://localhost:7599/graphql",
      ),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `➜ Drive URL: http://localhost:7599/d/${vetraId}`,
      ),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        `➜ Preview Drive URL: http://localhost:7599/d/${previewId}`,
      ),
    );
    // no remote drive: nothing to configure
    expect(await githubUrlCalls()).toEqual([]);
  });

  it("is not interactive unless --interactive is passed", async () => {
    const runner = await import("../src/runners/switchboard.js");
    await runner.dev(vetraSwitchboard(), ctx("dev"));

    expect((await resolvedEntries())[1]).toMatchObject({
      config: { processorConfig: { VetraConfig: { interactive: false } } },
    });
  });

  it("--remote-drive: codegen follows the remote drive, and its GitHub URL is configured before ready", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.dev(
      vetraSwitchboard(),
      ctx("dev", "--remote-drive", REMOTE),
    );

    expect((await resolvedEntries())[1]).toMatchObject({
      config: {
        processorConfig: {
          VetraConfig: {
            interactive: false,
            driveUrl: REMOTE,
            driveId: "remote-vetra",
          },
        },
      },
    });

    await handle.ready;
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        "➜ Drive URL: http://localhost:7599/d/remote-vetra",
      ),
    );
    expect(await githubUrlCalls()).toEqual([[7599, REMOTE, false]]);
  });

  it("a vetra drive the host declares as remote is configured the same way", async () => {
    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.dev(
      vetraSwitchboard([{ slug: "vetra", remote: { url: REMOTE } }]),
      ctx("dev"),
    );

    expect((await resolvedEntries())[1]).toMatchObject({
      config: { processorConfig: { VetraConfig: { driveId: "remote-vetra" } } },
    });
    await handle.ready;
    expect(await githubUrlCalls()).toEqual([[7599, REMOTE, false]]);
  });

  it("a verb the studio entry is not active for starts a plain switchboard", async () => {
    const host = vetraSwitchboard();
    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(host, ctx("run", "--remote-drive", REMOTE));

    // the entries as the host file wrote them
    expect(await resolvedEntries()).toEqual(host.runner.plugins);
    await handle.ready;
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining("Vetra Switchboard"),
    );
    expect(await githubUrlCalls()).toEqual([]);
  });
});

describe("what classic `ph vetra` and the vetra host share", () => {
  it("the codegen processor follows the remote drive when one is given", () => {
    const local = {
      interactive: false,
      localDriveUrl: "http://localhost:3001/d/vetra-1234abcd",
      localDriveId: "vetra-1234abcd",
    };
    expect(
      vetraProcessorConfigOf({ ...local, remoteDrive: undefined }),
    ).toEqual({
      interactive: false,
      driveUrl: "http://localhost:3001/d/vetra-1234abcd",
      driveId: "vetra-1234abcd",
    });
    expect(vetraProcessorConfigOf({ ...local, remoteDrive: REMOTE })).toEqual({
      interactive: false,
      driveUrl: REMOTE,
      driveId: "remote-vetra",
    });
  });

  it("prints the URL block, or the short lines under --logs", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const lines = () => log.mock.calls.map((call) => String(call[0] ?? ""));
    try {
      printVetraSwitchboardUrls({
        verbose: false,
        remoteDrive: undefined,
        switchboardPort: 4001,
        driveUrl: "http://localhost:4001/d/vetra-1234abcd",
        previewDriveUrl: null,
        workflowsDriveUrl: "http://localhost:4001/d/workflows",
      });
      expect(lines()).toEqual([
        "",
        expect.stringContaining(
          "Vetra Switchboard: http://localhost:4001/graphql",
        ),
        expect.stringContaining(
          "   ➜ Drive URL: http://localhost:4001/d/vetra-1234abcd",
        ),
        expect.stringContaining(
          "   ➜ Workflows Drive URL: http://localhost:4001/d/workflows",
        ),
      ]);

      log.mockClear();
      printVetraSwitchboardUrls({
        verbose: true,
        remoteDrive: REMOTE,
        switchboardPort: 4001,
        driveUrl: "http://localhost:4001/d/remote-vetra",
      });
      expect(lines()).toEqual([
        expect.stringContaining("Vetra Switchboard: Started successfully"),
        expect.stringContaining(
          `Vetra Switchboard: Syncing with remote drive: ${REMOTE}`,
        ),
      ]);
    } finally {
      log.mockRestore();
    }
  });
});

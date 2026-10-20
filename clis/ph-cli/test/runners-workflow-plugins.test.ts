import { describe, expect, it, vi } from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import type { ResolvedPlugin, RunnerContext } from "@powerhousedao/host-core";
import {
  hostSchema as connectHostSchema,
  type ConnectHost,
} from "../src/runners/connect.js";
import {
  hostSchema as switchboardHostSchema,
  outputsSchema as switchboardOutputsSchema,
  type SwitchboardHost,
} from "../src/runners/switchboard.js";

/**
 * Workflow-plugins plan — the runners' side of "the drive is a plugin
 * contribution, the link is declared":
 *  - the switchboard runner seeds the drives its composition contributes and
 *    reports them on the handle (a compound hands them to connect), while the
 *    host's own declarations still decide whether the implicit default drive
 *    is replaced;
 *  - a compound member (connect, switchboard) leaves SIGINT/SIGTERM to the
 *    compound.
 */

vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi.fn().mockResolvedValue({
    resolvedUrls: { local: ["http://localhost:3000/"], network: [] },
    close: vi.fn(),
  }),
}));
vi.mock("../src/services/switchboard.js", () => ({
  startSwitchboard: vi.fn().mockResolvedValue({
    workflowsEnabled: true,
    mcpEnabled: false,
    port: 7599,
    reactor: { fake: true },
    shutdown: vi.fn(),
  }),
}));
vi.mock("../src/services/vetra.js", () => ({
  seedWorkflowsDrive: vi
    .fn()
    .mockResolvedValue("http://localhost:7599/d/implicit"),
}));
vi.mock("@powerhousedao/switchboard/utils", () => ({
  addDefaultDrive: vi.fn().mockResolvedValue("http://localhost:7599/d/x"),
}));
vi.mock("@powerhousedao/host-core", async (importOriginal) => {
  const actual = await importOriginal<typeof HostCore>();
  return { ...actual, resolveHostPlugins: vi.fn() };
});

const ctx: RunnerContext = { projectRoot: "/lab", verb: "run", env: {} };

function workflowsComposition(
  drive?: Record<string, unknown> | false,
): ResolvedPlugin[] {
  const declaration =
    drive === false
      ? []
      : [
          {
            slug: "workflows",
            name: "Workflows",
            preferredEditor: "workflow-studio",
            projectHash: "id",
            ...drive,
          },
        ];
  return [
    {
      entry: {
        module: "@powerhousedao/switchboard/plugins/workflows",
        enabled: true,
        verbs: "*",
        config: {},
      },
      provenance: "dependency",
      plugin: {
        name: "switchboard-workflows",
        appliesTo: "switchboard",
        contributions: { drives: declaration },
      },
    },
  ];
}

/** Verbs receive the PARSED host, as validateHost hands it to them. */
const connect = (host: ConnectHost) => connectHostSchema.parse(host);
const switchboard = (host: SwitchboardHost) =>
  switchboardHostSchema.parse(host);

const switchboardHost = (reactor?: SwitchboardHost["reactor"]) =>
  switchboard({
    name: "lab-switchboard",
    runner: {
      module: "@powerhousedao/ph-cli/runners/switchboard",
      port: 7599,
      plugins: ["@powerhousedao/switchboard/plugins/workflows"],
    },
    ...(reactor ? { reactor } : {}),
  });

describe("switchboard runner — plugin-contributed drives", () => {
  it("seeds the contributed Workflows drive, keeps the implicit default drive, reports both", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValue(
      workflowsComposition(),
    );
    const { addDefaultDrive } =
      await import("@powerhousedao/switchboard/utils");
    vi.mocked(addDefaultDrive).mockClear();
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    vi.mocked(startSwitchboard).mockClear();
    const { seedWorkflowsDrive } = await import("../src/services/vetra.js");
    vi.mocked(seedWorkflowsDrive).mockClear();

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(switchboardHost(), ctx);

    // no host declaration -> the server's implicit default drive stays
    const args = vi.mocked(startSwitchboard).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect("drive" in args && args.drive === undefined).toBe(false);
    // the contribution is seeded through the host-core seeder with its
    // project-hashed id and Workflow Studio binding
    expect(vi.mocked(addDefaultDrive)).toHaveBeenCalledTimes(1);
    const seeded = vi.mocked(addDefaultDrive).mock.calls[0][1] as {
      id: string;
      slug: string;
      preferredEditor?: string;
      global: { name: string };
    };
    expect(seeded.slug).toBe("workflows");
    expect(seeded.id).toBe(hostCore.projectDriveId("/lab", "workflows"));
    expect(seeded.preferredEditor).toBe("workflow-studio");
    expect(seeded.global.name).toBe("Workflows");
    // the composed path never runs the classic implicit seed
    expect(vi.mocked(seedWorkflowsDrive)).not.toHaveBeenCalled();
    // the default drive first, then the contribution
    expect(Object.values(handle.outputs.drives).map((d) => d.url)).toEqual([
      "http://localhost:7599/d/powerhouse",
      "http://localhost:7599/d/workflows",
    ]);
    // the typed outputs: keyed by declared slug, plugin drive included
    expect(switchboardOutputsSchema.parse(handle.outputs)).toEqual({
      origin: "http://localhost:7599",
      endpoints: { graphql: "http://localhost:7599/graphql" },
      drives: {
        powerhouse: {
          id: "powerhouse",
          url: "http://localhost:7599/d/powerhouse",
        },
        workflows: {
          id: hostCore.projectDriveId("/lab", "workflows"),
          url: "http://localhost:7599/d/workflows",
        },
      },
    });
  });

  it("a host declaration with the same slug wins over the contribution", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValue(
      workflowsComposition(),
    );
    const { addDefaultDrive } =
      await import("@powerhousedao/switchboard/utils");
    vi.mocked(addDefaultDrive).mockClear();

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(
      switchboardHost({
        drives: [
          { slug: "sektar", name: "Sektar" },
          {
            slug: "workflows",
            name: "Flows",
            id: "flows-fixed",
            preferredEditor: "workflow-studio",
          },
        ],
      }),
      ctx,
    );
    const seeded = vi
      .mocked(addDefaultDrive)
      .mock.calls.map((call) => call[1] as { slug: string; id: string });
    expect(seeded).toHaveLength(2);
    expect(seeded[0]).toMatchObject({ slug: "sektar", id: "sektar" });
    expect(seeded[1]).toMatchObject({ slug: "workflows", id: "flows-fixed" });
    expect(Object.values(handle.outputs.drives).map((d) => d.url)).toEqual([
      "http://localhost:7599/d/sektar",
      "http://localhost:7599/d/workflows",
    ]);
    // a host declaration replaces the default drive in the outputs too
    expect(handle.outputs.drives).toEqual({
      sektar: { id: "sektar", url: "http://localhost:7599/d/sektar" },
      workflows: {
        id: "flows-fixed",
        url: "http://localhost:7599/d/workflows",
      },
    });
  });

  it("a live drive already serving the slug (under another id) is reused, never re-created", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValue(
      workflowsComposition(),
    );
    const { addDefaultDrive } =
      await import("@powerhousedao/switchboard/utils");
    vi.mocked(addDefaultDrive).mockClear();
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    const resolveIdOrSlug = vi.fn().mockResolvedValue("workflows-other-hash");
    vi.mocked(startSwitchboard).mockResolvedValueOnce({
      workflowsEnabled: true,
      port: 7599,
      reactor: { resolveIdOrSlug },
    } as never);

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(switchboardHost(), ctx);
    expect(resolveIdOrSlug).toHaveBeenCalledWith("workflows");
    expect(vi.mocked(addDefaultDrive)).not.toHaveBeenCalled();
    // the outputs report the id the live drive actually has
    expect(handle.outputs.drives.workflows).toEqual({
      id: "workflows-other-hash",
      url: "http://localhost:7599/d/workflows",
    });
  });

  it("drive: false (no contribution) seeds nothing extra", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValue(
      workflowsComposition(false),
    );
    const { addDefaultDrive } =
      await import("@powerhousedao/switchboard/utils");
    vi.mocked(addDefaultDrive).mockClear();

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(switchboardHost(), ctx);
    expect(vi.mocked(addDefaultDrive)).not.toHaveBeenCalled();
    expect(handle.outputs.drives).toEqual({
      powerhouse: { id: "powerhouse", url: "http://localhost:7599/d/powerhouse" },
    });
  });

  it("without a composition the deprecated reactor.workflows path still seeds the classic drive", async () => {
    const { seedWorkflowsDrive } = await import("../src/services/vetra.js");
    vi.mocked(seedWorkflowsDrive).mockClear();
    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(
      switchboard({
        name: "lab-switchboard",
        runner: {
          module: "@powerhousedao/ph-cli/runners/switchboard",
          port: 7599,
        },
        reactor: { workflows: true },
      }),
      ctx,
    );
    expect(vi.mocked(seedWorkflowsDrive)).toHaveBeenCalledTimes(1);
    expect(Object.values(handle.outputs.drives).map((d) => d.url)).toEqual([
      "http://localhost:7599/d/powerhouse",
      "http://localhost:7599/d/implicit",
    ]);
    expect(handle.outputs.drives.workflows.url).toBe(
      "http://localhost:7599/d/implicit",
    );
  });
});

describe("switchboard runner — signal ownership", () => {
  it("leaves SIGINT/SIGTERM to a supervising compound, keeps them standalone", async () => {
    const hostCore = await import("@powerhousedao/host-core");
    vi.mocked(hostCore.resolveHostPlugins).mockResolvedValue(
      workflowsComposition(),
    );
    const { startSwitchboard } = await import("../src/services/switchboard.js");
    const runner = await import("../src/runners/switchboard.js");
    const argsOf = async (context: RunnerContext) => {
      vi.mocked(startSwitchboard).mockClear();
      await runner.run(switchboardHost(), context);
      return vi.mocked(startSwitchboard).mock.calls[0][0] as Record<
        string,
        unknown
      >;
    };
    expect(
      (await argsOf({ ...ctx, parent: { host: "desktop", verb: "run" } }))
        .signalHandlers,
    ).toBe(false);
    expect("signalHandlers" in (await argsOf(ctx))).toBe(false);
  });
});

describe("connect runner — signal ownership", () => {
  it("drops the exit-on-SIGTERM listener vite installs, only under a compound", async () => {
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    const runner = await import("../src/runners/connect.js");
    const host = connect({
      name: "lab-connect",
      runner: { module: "@powerhousedao/ph-cli/runners/connect" },
    });
    const viteExit = () => undefined;
    const started = vi.mocked(runConnectStudio).getMockImplementation();
    if (!started) throw new Error("runConnectStudio mock has no default");
    const startAddingListener: typeof started = (...args) => {
      process.once("SIGTERM", viteExit);
      return started(...args);
    };
    vi.mocked(runConnectStudio).mockImplementationOnce(startAddingListener);
    await runner.dev(host, { ...ctx, parent: { host: "desktop", verb: "run" } });
    expect(process.listeners("SIGTERM")).not.toContain(viteExit);

    vi.mocked(runConnectStudio).mockImplementationOnce(startAddingListener);
    await runner.dev(host, ctx);
    expect(process.listeners("SIGTERM")).toContain(viteExit);
    process.off("SIGTERM", viteExit);
  });
});

describe("connect runner — workflows drive", () => {
  it("passes a resolved URL through as composition data", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      connect({
        name: "lab-connect",
        runner: {
          module: "@powerhousedao/ph-cli/runners/connect",
          plugins: [
            {
              module: "@powerhousedao/connect/plugins/workflows",
              config: { drive: "http://localhost:7599/d/workflows" },
            },
          ],
        },
      }),
      ctx,
    );
    const override = vi.mocked(runConnectStudio).mock.calls[0][2];
    expect(override?.composition).toEqual([
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: { drive: "http://localhost:7599/d/workflows" },
      },
    ]);
  });
});

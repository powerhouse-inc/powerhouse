import { describe, expect, it, vi } from "vitest";
import type * as HostCore from "@powerhousedao/host-core";
import type {
  HostDefinition,
  ResolvedPlugin,
  RunnerContext,
} from "@powerhousedao/host-core";

/**
 * Workflow-plugins plan — the runners' side of "the drive is a plugin
 * contribution, the link is declared":
 *  - the switchboard runner seeds the drives its composition contributes and
 *    reports them on the handle (a compound hands them to connect), while the
 *    host's own declarations still decide whether the implicit default drive
 *    is replaced;
 *  - the connect runner refuses an unresolved drive reference (nothing
 *    outside a compound can resolve `{ from, slug }`).
 */

vi.mock("../src/services/connect-studio.js", () => ({
  runConnectStudio: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../src/services/switchboard.js", () => ({
  startSwitchboard: vi
    .fn()
    .mockResolvedValue({ workflowsEnabled: true, reactor: { fake: true } }),
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

const switchboardHost = (
  reactor?: Record<string, unknown>,
): HostDefinition => ({
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
    // the handle reports the default drive first, then the contribution
    expect(handle.driveUrls).toEqual([
      "http://localhost:7599/d/powerhouse",
      "http://localhost:7599/d/workflows",
    ]);
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
    expect(handle.driveUrls).toEqual([
      "http://localhost:7599/d/sektar",
      "http://localhost:7599/d/workflows",
    ]);
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
      reactor: { resolveIdOrSlug },
    } as never);

    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(switchboardHost(), ctx);
    expect(resolveIdOrSlug).toHaveBeenCalledWith("workflows");
    expect(vi.mocked(addDefaultDrive)).not.toHaveBeenCalled();
    expect(handle.driveUrls).toContain("http://localhost:7599/d/workflows");
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
    expect(handle.driveUrls).toEqual(["http://localhost:7599/d/powerhouse"]);
  });

  it("without a composition the deprecated reactor.workflows path still seeds the classic drive", async () => {
    const { seedWorkflowsDrive } = await import("../src/services/vetra.js");
    vi.mocked(seedWorkflowsDrive).mockClear();
    const runner = await import("../src/runners/switchboard.js");
    const handle = await runner.run(
      {
        name: "lab-switchboard",
        runner: {
          module: "@powerhousedao/ph-cli/runners/switchboard",
          port: 7599,
        },
        reactor: { workflows: true },
      },
      ctx,
    );
    expect(vi.mocked(seedWorkflowsDrive)).toHaveBeenCalledTimes(1);
    expect(handle.driveUrls).toEqual([
      "http://localhost:7599/d/powerhouse",
      "http://localhost:7599/d/implicit",
    ]);
  });
});

describe("connect runner — drive references", () => {
  it("refuses an unresolved { from, slug } with the compound hint", async () => {
    const runner = await import("../src/runners/connect.js");
    const host: HostDefinition = {
      name: "lab-connect",
      runner: {
        module: "@powerhousedao/ph-cli/runners/connect",
        plugins: [
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: { from: "vetra-switchboard", slug: "workflows" } },
          },
        ],
      },
    };
    await expect(runner.dev(host, ctx)).rejects.toThrow(
      /refers to drive "workflows" of member "vetra-switchboard".*not running inside a compound/s,
    );
  });

  it("passes a resolved URL through as composition data", async () => {
    const runner = await import("../src/runners/connect.js");
    const { runConnectStudio } =
      await import("../src/services/connect-studio.js");
    vi.mocked(runConnectStudio).mockClear();
    await runner.dev(
      {
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
      },
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

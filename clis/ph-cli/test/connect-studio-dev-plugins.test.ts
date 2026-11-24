import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InlineConfig, ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

/** Which Studio gets dev-server plugins. vite, the Connect config and the
 * plugin resolver are mocked; no server starts. */

vi.mock("vite", () => ({
  createServer: vi.fn(),
  mergeConfig: (base: object, over: object) => ({ ...base, ...over }),
}));
vi.mock("@powerhousedao/builder-tools", () => ({
  getConnectBaseViteConfig: vi.fn(() => ({})),
}));
const INSPECTOR = { name: "inspector" };
vi.mock("../src/services/connect-dev-plugins.js", () => ({
  resolveConnectDevPlugins: vi.fn(() => Promise.resolve([INSPECTOR])),
}));

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
});

/** Starts Studio in a project and answers the Vite config it served. */
async function studioConfig(
  options: { devPlugins?: { entries: string[]; where: string } } = {},
): Promise<{ config: InlineConfig; project: string }> {
  const project = mkdtempSync(join(tmpdir(), "studio-dev-plugins-"));
  cleanups.push(() => rmSync(project, { recursive: true, force: true }));
  writeFileSync(
    join(project, "powerhouse.config.json"),
    JSON.stringify({ packages: [] }),
  );
  vi.spyOn(process, "cwd").mockReturnValue(project);

  const { createServer } = await import("vite");
  const { runConnectStudio } =
    await import("../src/services/connect-studio.js");
  const { classicConnectStudioArgs } =
    await import("../src/services/classic-args.js");
  vi.mocked(createServer).mockReset();
  vi.mocked(createServer).mockResolvedValue({
    listen: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    config: { logger: { info: vi.fn(), error: vi.fn() } },
  } as unknown as ViteDevServer);
  await runConnectStudio(
    {
      ...(await classicConnectStudioArgs()),
      printUrls: false,
      bindCLIShortcuts: false,
    },
    undefined,
    undefined,
    options,
  );
  const [config = {}] = vi.mocked(createServer).mock.calls[0];
  return { config: config as InlineConfig, project };
}

describe("Studio's dev-server plugins", () => {
  it("loads none unless it is started as a dev server", async () => {
    const { resolveConnectDevPlugins } =
      await import("../src/services/connect-dev-plugins.js");
    vi.mocked(resolveConnectDevPlugins).mockClear();

    const { config } = await studioConfig();

    expect(config.plugins).toEqual([]);
    expect(resolveConnectDevPlugins).not.toHaveBeenCalled();
  });

  it("serves the plugins of the entries it is given, for the project it runs in", async () => {
    const { resolveConnectDevPlugins } =
      await import("../src/services/connect-dev-plugins.js");
    vi.mocked(resolveConnectDevPlugins).mockClear();

    const { config, project } = await studioConfig({
      devPlugins: { entries: ["acme-inspector"], where: "hosts/lab/host.js" },
    });

    expect(config.plugins).toEqual([INSPECTOR]);
    expect(resolveConnectDevPlugins).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        projectRoot: project,
        entries: ["acme-inspector"],
        where: "hosts/lab/host.js",
      }),
    );
  });
});

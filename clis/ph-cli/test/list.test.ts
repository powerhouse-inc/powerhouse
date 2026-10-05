import type { PowerhousePackage } from "@powerhousedao/shared/clis";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@powerhousedao/config/node");
vi.mock("@powerhousedao/shared/clis", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    getPowerhouseProjectInfo: vi.fn(),
  };
});

import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import { getConfig } from "@powerhousedao/config/node";
import type { ListArgs } from "../src/types.js";
import { list } from "../src/commands/list.js";

const mockGetProjectInfo = vi.mocked(getPowerhouseProjectInfo);
const mockGetConfig = vi.mocked(getConfig);

const BASE_CONFIG = {
  logLevel: "info" as const,
  documentModelsDir: "./document-models",
  editorsDir: "./editors",
  processorsDir: "./processors",
  subgraphsDir: "./subgraphs",
  importScriptsDir: "./scripts",
  skipFormat: false,
};

describe("list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProjectInfo.mockResolvedValue({
      projectPath: "/test/project",
      localProjectPath: "/test/project",
      globalProjectPath: undefined,
      packageManager: "npm",
      isGlobal: false,
    });
  });

  async function runListHandler(packages: PowerhousePackage[] | undefined) {
    mockGetConfig.mockReturnValue({ ...BASE_CONFIG, packages });

    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    let calls: unknown[][];
    try {
      await list.handler({ debug: false } as ListArgs);
    } finally {
      calls = logSpy.mock.calls;
      exitSpy.mockRestore();
      logSpy.mockRestore();
    }

    return calls
      .flat()
      .map((arg) => String(arg))
      .join("\n");
  }

  it("prints each installed package with its recorded version", async () => {
    const output = await runListHandler([
      {
        packageName: "@powerhousedao/paperless-invoice",
        version: "0.0.3",
        provider: "registry",
      },
      { packageName: "qa-test-16", version: "1.0.0" },
    ]);

    expect(output).toContain("@powerhousedao/paperless-invoice@0.0.3");
    expect(output).toContain("qa-test-16@1.0.0");
  });

  it("prints the package name only when no version is recorded", async () => {
    const output = await runListHandler([
      { packageName: "@powerhousedao/legacy-package" },
    ]);

    expect(output).toContain("@powerhousedao/legacy-package");
    expect(output).not.toContain("undefined");
  });

  it("does not print the projectInfo debug log", async () => {
    const output = await runListHandler([
      { packageName: "qa-test-16", version: "1.0.0" },
    ]);

    expect(output).not.toContain(">>> projectInfo");
  });
});

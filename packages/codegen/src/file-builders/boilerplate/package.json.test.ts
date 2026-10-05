import { BOILERPLATE_DEPENDENCY_OVERRIDES } from "@powerhousedao/shared/clis";
import { describe, expect, it, vi } from "vitest";
import {
  pnpmWorkspaceTemplate,
  packageJsonTemplate,
  toYarnResolutions,
} from "templates";
import { buildBoilerplatePackageJson } from "./package.json.js";

vi.mock("@powerhousedao/shared/clis", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  makeVersionedDependenciesMap: () => Promise.resolve({}),
}));

async function generated(packageManager: string): Promise<{
  resolutions?: Record<string, string>;
}> {
  return JSON.parse(
    await buildBoilerplatePackageJson({ name: "test-project", packageManager }),
  ) as { resolutions?: Record<string, string> };
}

describe("boilerplate dependency overrides", () => {
  it("renders the override pins as pnpm overrides in pnpm-workspace.yaml", () => {
    for (const [pkg, version] of Object.entries(
      BOILERPLATE_DEPENDENCY_OVERRIDES,
    )) {
      expect(pnpmWorkspaceTemplate).toContain(`  ${pkg}: "${version}"`);
    }
  });

  it("maps each pin to a **/ yarn resolution key", () => {
    expect(toYarnResolutions(BOILERPLATE_DEPENDENCY_OVERRIDES)).toEqual({
      "**/date-fns": "4.3.0",
      "**/rolldown": "1.0.2",
      "**/vite": "8.0.14",
    });
  });

  it("emits a resolutions block in the generated package.json", () => {
    const out = packageJsonTemplate(
      "test-project",
      {},
      { vitest: "4.1.1" },
      toYarnResolutions(BOILERPLATE_DEPENDENCY_OVERRIDES),
    );

    // The generated manifest stays valid JSON.
    const parsed = JSON.parse(out) as {
      resolutions?: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.devDependencies).toEqual({ vitest: "4.1.1" });
    expect(parsed.resolutions).toEqual({
      "**/date-fns": "4.3.0",
      "**/rolldown": "1.0.2",
      "**/vite": "8.0.14",
    });
  });

  it("omits the resolutions block when none are provided", () => {
    const out = packageJsonTemplate("test-project", {}, { vitest: "4.1.1" });
    expect(JSON.parse(out)).not.toHaveProperty("resolutions");
  });

  it("writes the block for every package manager except pnpm", async () => {
    for (const packageManager of ["npm", "yarn", "bun"]) {
      expect((await generated(packageManager)).resolutions).toEqual(
        toYarnResolutions(BOILERPLATE_DEPENDENCY_OVERRIDES),
      );
    }
    expect(await generated("pnpm")).not.toHaveProperty("resolutions");
  });
});

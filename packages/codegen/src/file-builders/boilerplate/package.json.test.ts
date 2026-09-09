import { BOILERPLATE_DEPENDENCY_OVERRIDES } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import {
  pnpmWorkspaceTemplate,
  packageJsonTemplate,
  toYarnResolutions,
} from "templates";

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
});

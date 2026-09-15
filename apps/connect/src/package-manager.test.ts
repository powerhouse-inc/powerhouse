import { describe, expect, it } from "vitest";
import { sharedDepMismatchWarnings } from "./package-manager.js";

const HOST_VERSIONS = {
  "document-model": "1.4.0",
  "reactor-browser": "3.2.1",
  "design-system": "2.0.0",
};

describe("sharedDepMismatchWarnings", () => {
  it("returns nothing when the host has no version table or the package.json is missing", () => {
    // A dev / vendor-off host has no table to compare against, and an
    // unfetchable package.json means the check cannot run — both are
    // silent, never a warning.
    expect(
      sharedDepMismatchWarnings(
        { peerDependencies: { "reactor-browser": ">=9.0.0" } },
        null,
      ),
    ).toEqual([]);
    expect(sharedDepMismatchWarnings(null, HOST_VERSIONS)).toEqual([]);
  });

  it("flags only the shared-dep ranges the host version does not satisfy", () => {
    const warnings = sharedDepMismatchWarnings(
      {
        // "document-model" is satisfied by the host (>=1.0.0 vs 1.4.0) and
        // "left-pad" is not a shared dep — both must stay out of the output.
        peerDependencies: {
          "reactor-browser": ">=9.0.0",
          "document-model": ">=1.0.0",
        },
        dependencies: { "left-pad": "^1.0.0" },
      },
      HOST_VERSIONS,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("reactor-browser");
    expect(warnings[0]).toContain(">=9.0.0");
    expect(warnings[0]).toContain("3.2.1");
  });
});

import { describe, expect, it } from "vitest";
import {
  type CurrentRelease,
  type ReleaseApproval,
  verifyReleaseApproval,
} from "../src/services/release/approval.js";
import { packageRevision } from "../src/services/release/revision.js";

const hex = (digit: string) => digit.repeat(64);

const FILES = [
  { path: "index.ts", sha256: hex("1") },
  { path: "document-models/ledger/index.ts", sha256: hex("2") },
];

const PUBLISHED = [
  { path: "dist/node/index.mjs", sha256: hex("a") },
  { path: "package.json", sha256: hex("b") },
];

const approval: ReleaseApproval = {
  kind: "powerhouse.release-approval",
  formatVersion: 1,
  phCliVersion: "6.0.0",
  outDir: "dist",
  packageRevision: {
    digest: packageRevision(FILES, { "ph-cli": "6.0.0" }),
    excluded: [],
  },
  publishedFiles: PUBLISHED,
  report: { profile: "release", status: "ok", definitions: [] },
  scalars: [],
  hostValidation: { completed: true, findings: [] },
};

const current: CurrentRelease = {
  phCliVersion: "6.0.0",
  files: FILES,
  publishedFiles: PUBLISHED,
};

describe("verifyReleaseApproval", () => {
  it("names every way the package moved on", () => {
    const published = Array.from({ length: 7 }, (_, index) => ({
      path: `dist/added-${index}.js`,
      sha256: hex("c"),
    }));
    expect(
      verifyReleaseApproval(approval, {
        phCliVersion: "6.1.0",
        files: [{ ...FILES[0], sha256: hex("9") }, FILES[1]],
        publishedFiles: [
          { path: "dist/node/index.mjs", sha256: hex("d") },
          ...published,
        ],
      }),
    ).toEqual({
      decision: "stale",
      reasons: [
        "it was made by ph-cli 6.0.0, and this is ph-cli 6.1.0",
        "the package's files changed since the approval was made",
        "7 published files added since the approval was made: dist/added-0.js, dist/added-1.js, dist/added-2.js, dist/added-3.js, dist/added-4.js and 2 more",
        "1 published file removed since the approval was made: package.json",
        "1 published file changed since the approval was made: dist/node/index.mjs",
      ],
    });
  });

  it("reads a renamed file as a change", () => {
    expect(
      verifyReleaseApproval(approval, {
        ...current,
        files: [{ ...FILES[0], path: "index2.ts" }, FILES[1]],
      }),
    ).toEqual({
      decision: "stale",
      reasons: ["the package's files changed since the approval was made"],
    });
  });

  it("tells a new ph-cli apart from edited files", () => {
    expect(
      verifyReleaseApproval(approval, { ...current, phCliVersion: "6.1.0" }),
    ).toEqual({
      decision: "stale",
      reasons: ["it was made by ph-cli 6.0.0, and this is ph-cli 6.1.0"],
    });
  });

  it("refuses an approval whose check did not pass, before looking at the package", () => {
    expect(
      verifyReleaseApproval(
        {
          ...approval,
          report: { ...approval.report, status: "invalid" },
          hostValidation: {
            completed: false,
            reason: "./scalars/index.ts could not be loaded: boom",
            findings: [
              {
                kind: "scalar-unbound",
                documentType: "example/ledger",
                scalar: "Iban",
              },
              { kind: "definition-invalid", documentType: "example/wallet" },
            ],
          },
        },
        { ...current, phCliVersion: "7.0.0" },
      ),
    ).toEqual({
      decision: "refused",
      reasons: [
        "its release check reported invalid",
        "host validation did not complete: ./scalars/index.ts could not be loaded: boom",
        "host validation found 2 problems: scalar-unbound Iban in example/ledger, definition-invalid in example/wallet",
      ],
    });
  });

  it("approves a package with no models to check", () => {
    expect(
      verifyReleaseApproval(
        { ...approval, report: { ...approval.report, status: "skipped" } },
        current,
      ),
    ).toEqual({ decision: "approved", reasons: [] });
  });
});

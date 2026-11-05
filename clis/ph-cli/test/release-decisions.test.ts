import { describe, expect, it } from "vitest";
import {
  changedWhileBuilt,
  planApproval,
} from "../src/services/release/issuance.js";
import { refusedNpmArguments } from "../src/services/release/npm-args.js";
import { scalarBindings } from "../src/services/release/scalar-bindings.js";

const digest = (path: string, byte: string) => ({
  path,
  sha256: byte.repeat(64),
});

describe("planApproval", () => {
  const build = {
    typesOk: true,
    release: "release report",
    startFiles: [digest("index.ts", "a")],
    outputs: ["dist", "build/out"] as const,
    compilerOutputs: [
      "tsconfig.tsbuildinfo",
      "dist/types",
      "lib",
      "build/out/x.d.ts",
    ],
  };

  it("leaves out the replaced directory and what tsc writes outside the output", () => {
    expect(planApproval(build)).toEqual({
      release: "release report",
      startFiles: [digest("index.ts", "a")],
      excluded: ["build/out", "tsconfig.tsbuildinfo", "lib"],
    });
  });
});

describe("changedWhileBuilt", () => {
  const plan = {
    startFiles: [
      digest("index.ts", "a"),
      digest("lib/index.js", "b"),
      digest("README.md", "c"),
    ],
    excluded: ["lib"],
  };

  it("ignores changes under what the revision leaves out", () => {
    expect(
      changedWhileBuilt(plan, [
        digest("index.ts", "a"),
        digest("README.md", "c"),
      ]),
    ).toBe(undefined);
  });

  it("names the files added, removed or changed since the start", () => {
    expect(
      changedWhileBuilt(plan, [digest("index.ts", "d"), digest("new.ts", "e")]),
    ).toBe(
      "the package's files changed while it was built (README.md, index.ts, new.ts)",
    );
  });
});

describe("refusedNpmArguments", () => {
  it("allows the listed options, each with its value", () => {
    expect(
      refusedNpmArguments([
        "--tag",
        "next",
        "--tag=beta",
        "--access",
        "public",
        "--access=restricted",
        "--otp",
        "123456",
        "--otp=654321",
        "--dry-run",
        "--provenance",
        "--json",
        "--loglevel",
        "verbose",
        "--loglevel=silent",
      ]),
    ).toEqual([]);
  });

  it("refuses what selects another package, under any spelling npm accepts", () => {
    expect(
      refusedNpmArguments([
        "./other",
        "--workspace",
        "a",
        "-ws",
        "--ws",
        "--prefi=../b",
        "--prefix=../b",
        "--prefix",
        "../b",
        "-w=b",
        "--include-workspace-root",
        "--",
        "c.tgz",
      ]),
    ).toEqual([
      "./other",
      "--workspace",
      "a",
      "-ws",
      "--ws",
      "--prefi=../b",
      "--prefix=../b",
      "--prefix",
      "../b",
      "-w=b",
      "--include-workspace-root",
      "--",
      "c.tgz",
    ]);
  });

  it("does not take an option as a value, and refuses a value option left without one", () => {
    expect(refusedNpmArguments(["--tag", "--workspace=other"])).toEqual([
      "--tag",
      "--workspace=other",
    ]);
    expect(refusedNpmArguments(["--otp"])).toEqual(["--otp"]);
    expect(refusedNpmArguments(["--tag="])).toEqual(["--tag="]);
  });

  it("refuses a value its option does not take", () => {
    expect(
      refusedNpmArguments([
        "--access",
        "private",
        "--loglevel=loud",
        "--dry-run=false",
      ]),
    ).toEqual(["--access private", "--loglevel=loud", "--dry-run=false"]);
  });
});

describe("scalarBindings", () => {
  const artifact = (
    version: number,
    specifications: {
      version: number;
      scalars: { name: string; implementation: string }[];
    }[],
  ) => ({ version, definition: { specifications } });

  it("binds the served version's scalars, catalog ones to document-model, sorted by name", () => {
    expect(
      scalarBindings(
        [
          artifact(2, [
            {
              version: 1,
              scalars: [{ name: "Old", implementation: "package#./old" }],
            },
            {
              version: 2,
              scalars: [
                { name: "Ticker", implementation: "package#./ticker" },
                { name: "OID", implementation: "powerhouse.catalog#OID" },
              ],
            },
          ]),
          artifact(1, [
            {
              version: 1,
              scalars: [
                { name: "OID", implementation: "powerhouse.catalog#OID" },
              ],
            },
          ]),
        ],
        { name: "@acme/ledger", version: "1.2.0" },
        "6.2.3",
      ),
    ).toEqual([
      { scalar: "OID", packageName: "document-model", version: "6.2.3" },
      { scalar: "Ticker", packageName: "@acme/ledger", version: "1.2.0" },
    ]);
  });
});

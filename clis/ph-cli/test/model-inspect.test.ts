import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { computePackageRevision } from "../src/services/definitions/package-revision.js";
import {
  runModelInspect,
  runScalarInspect,
} from "../src/services/model-inspect.js";
import type { ModelInspectArgs, ScalarInspectArgs } from "../src/types.js";
import { recordStreams } from "./helpers/streams.js";

type Envelope = {
  readonly kind: string;
  readonly status: string;
  readonly digest?: string;
  readonly definition?: Record<string, unknown>;
  readonly selection: Record<string, unknown>;
  readonly compilerVersion: string;
  readonly source?: Record<string, unknown>;
  readonly diagnostics: { readonly code: string; readonly message: string }[];
};

function treeDigest(root: string): string {
  return computePackageRevision({
    packageRoot: root,
    excludedDirectoryNames: ["node_modules"],
    bindings: {},
  });
}

function inspectArgs(overrides: Partial<ModelInspectArgs>): ModelInspectArgs {
  return {
    selector: "",
    configFile: undefined,
    source: [],
    json: true,
    debug: undefined,
    ...overrides,
  };
}

function scalarArgs(name: string, json: boolean): ScalarInspectArgs {
  return { name, json, debug: undefined };
}

async function inspect(
  fixture: string,
  selector: string,
  configFile = "powerhouse.config.json",
): Promise<{
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly before: string;
  readonly after: string;
  readonly root: string;
}> {
  const materialized = materializeFixturePackage(fixture);
  const io = recordStreams();
  try {
    const before = treeDigest(materialized.root);
    const code = await runModelInspect(
      inspectArgs({
        selector,
        configFile: join(materialized.root, configFile),
      }),
      { streams: io.streams },
    );
    return {
      code,
      stdout: io.stdout,
      stderr: io.stderr,
      before,
      after: treeDigest(materialized.root),
      root: materialized.root,
    };
  } finally {
    materialized.dispose();
  }
}

describe("ph model inspect", () => {
  it("matches the fixture's committed goldens, definition and envelope", async () => {
    const result = await inspect("control", "test/invoice@1");
    const envelope = JSON.parse(result.stdout) as Envelope;
    expect(envelope.compilerVersion).toMatch(/^\d+\.\d+\.\d+/);
    const goldens = join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "packages",
      "document-model",
      "test",
      "tooling",
      "goldens",
    );
    const definitionGolden: unknown = JSON.parse(
      readFileSync(join(goldens, "test-invoice.v1.definition.json"), "utf-8"),
    );
    const { canonicalJson } = await import("document-model");
    expect(canonicalJson(envelope.definition)).toBe(
      canonicalJson(definitionGolden),
    );
    const envelopeGolden: unknown = JSON.parse(
      readFileSync(join(goldens, "test-invoice.v1.inspection.json"), "utf-8"),
    );
    expect(
      canonicalJson({ ...envelope, compilerVersion: "<compiler-version>" }),
    ).toBe(canonicalJson(envelopeGolden));
  }, 60_000);

  it("creates and modifies no file", async () => {
    const result = await inspect("control", "test/invoice@1");
    expect(result.code).toBe(0);
    expect((JSON.parse(result.stdout) as Envelope).status).toBe("ok");
    expect(result.after).toBe(result.before);
  }, 60_000);

  it("exits nonzero for an unknown model and lists what is available", async () => {
    const result = await inspect("control", "test/absent@1");
    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.stdout) as Envelope;
    expect(envelope.status).toBe("invalid");
    expect(envelope.diagnostics[0].message).toContain("test/absent");
    expect(JSON.stringify(envelope.diagnostics)).toContain("test/invoice@1");
  }, 60_000);

  it("exits 2 with one failed envelope when the config file does not exist", async () => {
    const result = await inspect(
      "control",
      "test/invoice@1",
      "nope/powerhouse.config.json",
    );
    expect(result.code).toBe(2);
    expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    const envelope = JSON.parse(result.stdout) as Envelope;
    expect(envelope.kind).toBe("powerhouse.definition-inspection");
    expect(envelope.status).toBe("failed");
    expect(envelope.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-CONFIG-SOURCE-INVALID",
    ]);
  }, 60_000);

  it("rejects a selector that is not documentType@version", async () => {
    const materialized = materializeFixturePackage("control");
    const io = recordStreams();
    try {
      const code = await runModelInspect(
        inspectArgs({
          selector: "test/invoice",
          configFile: join(materialized.root, "powerhouse.config.json"),
        }),
        { streams: io.streams },
      );
      expect(code).toBe(2);
      expect(io.stdout).toBe("");
      expect(io.stderr).toContain("documentType");
    } finally {
      materialized.dispose();
    }
  });

  it("uses the same source selection as check", async () => {
    const materialized = materializeFixturePackage("control");
    const io = recordStreams();
    try {
      const code = await runModelInspect(
        inspectArgs({
          selector: "test/invoice@1",
          configFile: join(materialized.root, "powerhouse.config.json"),
          source: ["./src/invoice.ts#/invoiceV1"],
        }),
        { streams: io.streams },
      );
      expect(code).toBe(0);
      const envelope = JSON.parse(io.stdout) as Envelope & {
        sourceSet: { origin: string };
      };
      expect(envelope.sourceSet.origin).toBe("cli");
      expect(envelope.source).toEqual({
        specifier: "./src/invoice.ts",
        exportPath: ["invoiceV1"],
      });
    } finally {
      materialized.dispose();
    }
  }, 60_000);
});

describe("ph scalar inspect", () => {
  const golden = JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "..",
        "..",
        "..",
        "packages",
        "document-model",
        "test",
        "tooling",
        "goldens",
        "amount-money.scalar-inspection.json",
      ),
      "utf-8",
    ),
  ) as Envelope;

  it("prints the definition the catalog holds", async () => {
    const io = recordStreams();
    const code = runScalarInspect(scalarArgs("Amount_Money", true), {
      streams: io.streams,
    });
    expect(code).toBe(0);
    const envelope = JSON.parse(io.stdout) as Envelope;
    expect(envelope.kind).toBe("powerhouse.scalar-inspection");
    expect(envelope.source).toEqual({ catalog: "powerhouse.catalog" });
    expect(envelope.definition).toMatchObject({
      name: "Amount_Money",
      coercion: { source: "explicit" },
    });
    const { canonicalJson } = await import("document-model");
    expect(
      canonicalJson({ ...envelope, compilerVersion: "<compiler-version>" }),
    ).toBe(canonicalJson(golden));
  });

  it("summarizes the definition on stderr without --json", () => {
    const io = recordStreams();
    const code = runScalarInspect(scalarArgs("Amount_Money", false), {
      streams: io.streams,
    });
    expect(code).toBe(0);
    expect(io.stderr).toBe(
      [
        `Amount_Money ${golden.digest}`,
        "representation number, persistable true",
        "coercion explicit",
        "",
      ].join("\n"),
    );
  });

  it("needs no package, no config, and no definition source", () => {
    const previous = process.cwd();
    process.chdir(tmpdir());
    try {
      const io = recordStreams();
      const code = runScalarInspect(scalarArgs("PHID", true), {
        streams: io.streams,
      });
      expect(code).toBe(0);
      expect((JSON.parse(io.stdout) as Envelope).status).toBe("ok");
    } finally {
      process.chdir(previous);
    }
  });

  it("names the catalog's scalars when asked for one it does not have", () => {
    const io = recordStreams();
    const code = runScalarInspect(scalarArgs("Money", true), {
      streams: io.streams,
    });
    expect(code).toBe(1);
    const envelope = JSON.parse(io.stdout) as Envelope;
    expect(envelope.status).toBe("invalid");
    expect(envelope.diagnostics[0].message).toContain("Money");
  });
});

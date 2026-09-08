import type { DefinitionCheckReport } from "document-model/tooling";
import { DefinitionSourceLoader } from "document-model/tooling";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeRetainedDefinitionCheck,
  retainReleaseDefinitionCheck,
} from "../src/services/definition-release.js";

const created: string[] = [];

function project(): {
  configFile: string;
  helperFile: string;
  root: string;
  sourceFile: string;
  report: DefinitionCheckReport;
} {
  const root = mkdtempSync(join(tmpdir(), "ph-release-report-"));
  created.push(root);
  mkdirSync(join(root, "src"));
  const configFile = join(root, "powerhouse.config.json");
  const helperFile = join(root, "src/helper.ts");
  const sourceFile = join(root, "src/model.ts");
  writeFileSync(helperFile, "export const value = 1;\n");
  writeFileSync(
    sourceFile,
    'import { value } from "./helper.js";\nexport const Model = { value };\n',
  );
  writeFileSync(
    configFile,
    JSON.stringify({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/model.ts" }],
      },
    }),
  );
  const sourceSet = new DefinitionSourceLoader({
    importModule: () => Promise.resolve({}),
  }).resolve({ configFile }).sourceSet;
  const report: DefinitionCheckReport = {
    kind: "powerhouse.definition-check",
    formatVersion: 1,
    profile: "release",
    status: "ok",
    sourceSet,
    definitions: [
      {
        kind: "document-model",
        key: "test/release-model",
        version: 1,
        digest: `sha256:${"b".repeat(64)}`,
        source: sourceSet.sources[0]!,
      },
    ],
    diagnostics: [],
    summary: { errors: 0, warnings: 0 },
  };
  return { configFile, helperFile, root, sourceFile, report };
}

afterEach(() => {
  while (created.length > 0) {
    const path = created.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("retained release definition reports", () => {
  it("accepts the report from the matching build revision", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report: fixture.report,
    });

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed).toEqual(fixture.report);
  });

  it("applies warnings-as-errors when consuming a retained report", async () => {
    const fixture = project();
    const report: DefinitionCheckReport = {
      ...fixture.report,
      diagnostics: [
        {
          code: "PH-TEST-WARNING",
          severity: "warning",
          phase: "definition",
          path: ["definition"],
          message: "Review this definition.",
          repair: "Update the declaration.",
        },
      ],
      summary: { errors: 0, warnings: 1 },
    };
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report,
    });

    expect(
      await consumeRetainedDefinitionCheck({
        configFile: fixture.configFile,
        sources: [],
      }),
    ).toEqual(report);
    expect(
      await consumeRetainedDefinitionCheck({
        configFile: fixture.configFile,
        sources: [],
        warningsAsErrors: true,
      }),
    ).toEqual({ ...report, status: "invalid" });
  });

  it("accepts a retained explicit-legacy skip without treating it as evidence", async () => {
    const fixture = project();
    writeFileSync(
      fixture.configFile,
      JSON.stringify({
        definitionSources: { formatVersion: 1, mode: "legacy" },
      }),
    );
    const sourceSet = new DefinitionSourceLoader({
      importModule: () => Promise.resolve({}),
    }).resolve({ configFile: fixture.configFile }).sourceSet;
    const report: DefinitionCheckReport = {
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: "release",
      status: "skipped",
      skipReason: "explicit-legacy-mode",
      sourceSet,
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    };
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report,
    });

    expect(
      await consumeRetainedDefinitionCheck({
        configFile: fixture.configFile,
        sources: [],
      }),
    ).toEqual(report);
  });

  it("rejects a retained report after a selected source changes", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report: fixture.report,
    });
    writeFileSync(
      fixture.sourceFile,
      "export const Model = { changed: true };\n",
    );

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed?.status).toBe("invalid");
    expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-RELEASE-REPORT-STALE",
    );
  });

  it("rejects a retained report after a transitive source changes", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report: fixture.report,
    });
    writeFileSync(fixture.helperFile, "export const value = 2;\n");

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed?.status).toBe("invalid");
    expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-RELEASE-REPORT-STALE",
    );
  });

  it("ignores bundle output written after the release check", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "custom-output",
      report: fixture.report,
    });
    mkdirSync(join(fixture.root, "custom-output"), { recursive: true });
    writeFileSync(
      join(fixture.root, "custom-output/index.mjs"),
      "export {};\n",
    );

    expect(
      await consumeRetainedDefinitionCheck({
        configFile: fixture.configFile,
        sources: [],
        outDir: "custom-output",
      }),
    ).toEqual(fixture.report);
  });

  it("reports invalid JSON values without throwing", async () => {
    const fixture = project();
    mkdirSync(join(fixture.root, "dist"), { recursive: true });
    writeFileSync(
      join(fixture.root, "dist/definition-check.release.json"),
      "null\n",
    );

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed?.status).toBe("invalid");
    expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-RELEASE-REPORT-INVALID",
    );
  });

  it("rejects inconsistent fields in a retained report", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report: fixture.report,
    });
    const path = join(fixture.root, "dist/definition-check.release.json");
    const retained = JSON.parse(readFileSync(path, "utf8")) as {
      contributesReleaseEvidence: boolean;
    };
    retained.contributesReleaseEvidence = false;
    writeFileSync(path, JSON.stringify(retained));

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed?.status).toBe("invalid");
    expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-RELEASE-REPORT-INVALID",
    );
  });

  it("rejects a successful retained report with no checked definitions", async () => {
    const fixture = project();
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report: fixture.report,
    });
    const path = join(fixture.root, "dist/definition-check.release.json");
    const retained = JSON.parse(readFileSync(path, "utf8")) as {
      report: { definitions: unknown[] };
    };
    retained.report.definitions = [];
    writeFileSync(path, JSON.stringify(retained));

    const consumed = await consumeRetainedDefinitionCheck({
      configFile: fixture.configFile,
      sources: [],
    });

    expect(consumed?.status).toBe("invalid");
    expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
      "PH-PKG-RELEASE-REPORT-INVALID",
    );
  });

  it("rejects fractional and negative diagnostic path indexes", async () => {
    const fixture = project();
    const report: DefinitionCheckReport = {
      ...fixture.report,
      diagnostics: [
        {
          code: "PH-TEST-WARNING",
          severity: "warning",
          phase: "definition",
          path: [1],
          message: "Review this definition.",
          repair: "Update the declaration.",
        },
      ],
      summary: { errors: 0, warnings: 1 },
    };
    await retainReleaseDefinitionCheck({
      configFile: fixture.configFile,
      outDir: "dist",
      report,
    });
    const path = join(fixture.root, "dist/definition-check.release.json");
    const retained = JSON.parse(readFileSync(path, "utf8")) as {
      report: { diagnostics: Array<{ path: number[] }> };
    };
    for (const invalidIndex of [1.5, -1]) {
      retained.report.diagnostics[0]!.path = [invalidIndex];
      writeFileSync(path, JSON.stringify(retained));

      const consumed = await consumeRetainedDefinitionCheck({
        configFile: fixture.configFile,
        sources: [],
      });

      expect(consumed?.status).toBe("invalid");
      expect(consumed?.diagnostics.map(({ code }) => code)).toContain(
        "PH-PKG-RELEASE-REPORT-INVALID",
      );
    }
  });
});

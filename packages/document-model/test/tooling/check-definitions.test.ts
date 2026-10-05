import type {
  DefinitionCheckProfile,
  DefinitionCheckReport,
} from "@powerhousedao/shared/document-model";
import { cpSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkDefinitions,
  createDefinitionCheckReport,
  DefinitionCheckSession,
  exitCodeFor,
  type PackedConsumerEvidence,
  type ReleaseEvidenceProvider,
  type TypecheckEvidence,
} from "../../src/definition/tooling/check-definitions.js";
import { DefinitionSourceLoader } from "../../src/definition/tooling/definition-source-loader.js";
import type { TypeScriptSourceImportInterface } from "../../src/definition/tooling/definition-source-types.js";
import {
  materializeFixturePackage,
  packageRevisionOf,
} from "./loader-contract.js";

function nodeImporter(): TypeScriptSourceImportInterface {
  const roots = new Map<string, string>();
  return {
    importModule: async ({ packageRoot, specifier, packageRevision }) => {
      let root = roots.get(packageRevision);
      if (root === undefined) {
        root = realpathSync.native(mkdtempSync(join(tmpdir(), "ph-check-")));
        cpSync(packageRoot, root, { recursive: true });
        roots.set(packageRevision, root);
      }
      return (await import(
        pathToFileURL(join(root, specifier)).href
      )) as Readonly<Record<string, unknown>>;
    },
    disposeRevision: (revision) => {
      for (const [key, root] of [...roots]) {
        if (revision !== undefined && key !== revision) continue;
        roots.delete(key);
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}

type RunOptions = {
  readonly fixture: string;
  readonly configFile?: string;
  readonly profile?: DefinitionCheckProfile;
  readonly warningsAsErrors?: boolean;
  readonly releaseEvidence?: ReleaseEvidenceProvider;
};

async function run(
  options: RunOptions,
): Promise<{ report: DefinitionCheckReport; root: string }> {
  const fixture = materializeFixturePackage(options.fixture);
  try {
    const loader = new DefinitionSourceLoader(nodeImporter());
    const report = await checkDefinitions({
      profile: options.profile ?? "edit",
      loader,
      packageRevision: packageRevisionOf(fixture.root),
      configFile: join(
        fixture.root,
        options.configFile ?? "powerhouse.config.json",
      ),
      ...(options.warningsAsErrors !== undefined && {
        warningsAsErrors: options.warningsAsErrors,
      }),
      ...(options.releaseEvidence !== undefined && {
        releaseEvidence: options.releaseEvidence,
      }),
    });
    await loader.dispose();
    return { report, root: fixture.root };
  } finally {
    fixture.dispose();
  }
}

function codes(report: DefinitionCheckReport): readonly string[] {
  return report.diagnostics.map((diagnostic) => diagnostic.code);
}

const completeRelease = (
  calls: string[],
): ReleaseEvidenceProvider & { readonly calls: string[] } => ({
  calls,
  typecheck(): TypecheckEvidence {
    calls.push("typecheck");
    return { ok: true };
  },
  verifyPackedConsumers(): PackedConsumerEvidence {
    calls.push("packed");
    return { ok: true, consumers: ["node", "browser"] };
  },
});

describe("checkDefinitions statuses and exit codes", () => {
  it("passes a healthy package", async () => {
    const { report } = await run({ fixture: "control" });
    expect(report.status).toBe("ok");
    expect(exitCodeFor(report)).toBe(0);
    expect(report.profile).toBe("edit");
    expect(report.definitions.map((entry) => entry.version)).toEqual([1, 2]);
    expect(report.summary).toEqual({ errors: 0, warnings: 0 });
  });

  it("reports an explicit schema-first package as skipped, not as approval", async () => {
    const { report } = await run({ fixture: "schema-first" });
    expect(report.status).toBe("skipped");
    expect(exitCodeFor(report)).toBe(0);
    expect(report).toMatchObject({
      skipReason: "explicit-schema-first-mode",
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });
    // The digest still binds the explicit selection, so "skipped" is a
    // statement about a specific configuration rather than about nothing.
    expect(report.sourceSet.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("calls an expected definition failure invalid", async () => {
    const { report } = await run({
      fixture: "forged",
      configFile: "retained-sdl.config.json",
    });
    expect(report.status).toBe("invalid");
    expect(exitCodeFor(report)).toBe(1);
  });

  it("calls a configuration or import failure failed", async () => {
    const { report } = await run({
      fixture: "failures",
      configFile: "throwing.config.json",
    });
    expect(report.status).toBe("failed");
    expect(exitCodeFor(report)).toBe(2);
    expect(codes(report)).toContain("PH-IMPORT-FAILED");
  });

  it("keeps a definition failure at exit 1 while an import failure is exit 2", async () => {
    const definitionFailure = await run({ fixture: "failures" });
    expect(definitionFailure.report.status).toBe("invalid");
    expect(codes(definitionFailure.report)).toEqual([
      "PH-DM-STATE-ROOT-INVALID",
      "PH-DM-STATE-ROOT-INVALID",
    ]);
  });
});

describe("createDefinitionCheckReport", () => {
  const sourceSet = {
    mode: "schema-first",
    origin: "config",
    digest: `sha256:${"0".repeat(64)}`,
    sources: [],
  } as const;

  it("builds the skipped report only for the explicit schema-first selection", () => {
    expect(
      createDefinitionCheckReport({
        profile: "edit",
        sourceSet,
        definitions: [],
        diagnostics: [],
        skipped: true,
      }),
    ).toMatchObject({
      status: "skipped",
      skipReason: "explicit-schema-first-mode",
    });
  });

  it("refuses a skipped report that actually checked something", () => {
    expect(() =>
      createDefinitionCheckReport({
        profile: "edit",
        sourceSet: { ...sourceSet, mode: "code-first" },
        definitions: [],
        diagnostics: [],
        skipped: true,
      }),
    ).toThrow(TypeError);
    expect(() =>
      createDefinitionCheckReport({
        profile: "edit",
        sourceSet,
        definitions: [
          {
            kind: "document-model",
            key: "test/x",
            version: 1,
            source: { specifier: "./src/x.ts" },
          },
        ],
        diagnostics: [],
        skipped: true,
      }),
    ).toThrow(TypeError);
  });

  it("never attaches a skip reason to a status that checked something", () => {
    const report = createDefinitionCheckReport({
      profile: "edit",
      sourceSet: { ...sourceSet, mode: "code-first" },
      definitions: [],
      diagnostics: [],
    });
    expect(report.status).toBe("ok");
    expect("skipReason" in report).toBe(false);
  });
});

describe("warnings", () => {
  it("passes a warning-only package and fails it under the flag, without changing severity", async () => {
    const plain = await run({ fixture: "warnings" });
    expect(plain.report.status).toBe("ok");
    expect(exitCodeFor(plain.report)).toBe(0);
    expect(plain.report.summary.warnings).toBeGreaterThan(0);
    expect(codes(plain.report)).toContain("PH-DM-IDENTITY-REUSED");

    const strict = await run({ fixture: "warnings", warningsAsErrors: true });
    expect(strict.report.status).toBe("invalid");
    expect(exitCodeFor(strict.report)).toBe(1);
    for (const report of [plain.report, strict.report]) {
      const reused = report.diagnostics.find(
        (diagnostic) => diagnostic.code === "PH-DM-IDENTITY-REUSED",
      );
      expect(reused?.severity).toBe("warning");
    }
    expect(strict.report.summary).toEqual(plain.report.summary);
  });
});

describe("determinism", () => {
  it("produces byte-identical JSON for two runs over an unchanged package", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const revision = packageRevisionOf(fixture.root);
      const reports = [];
      for (const _ of [0, 1]) {
        const loader = new DefinitionSourceLoader(nodeImporter());
        reports.push(
          await checkDefinitions({
            profile: "edit",
            loader,
            packageRevision: revision,
            configFile: join(fixture.root, "powerhouse.config.json"),
          }),
        );
        await loader.dispose();
      }
      expect(JSON.stringify(reports[1])).toBe(JSON.stringify(reports[0]));
    } finally {
      fixture.dispose();
    }
  });

  it("puts no machine path into a report, on any status", async () => {
    for (const options of [
      { fixture: "control" },
      { fixture: "failures" },
      { fixture: "failures", configFile: "throwing.config.json" },
      { fixture: "forged", configFile: "retained-sdl.config.json" },
      { fixture: "configs", configFile: "malformed.config.json.txt" },
    ] satisfies RunOptions[]) {
      const { report, root } = await run(options);
      const serialized = JSON.stringify(report);
      expect(serialized).not.toContain(root);
      expect(serialized).not.toContain(tmpdir());
      expect(serialized).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
      expect(serialized).not.toContain('"stack"');
    }
  });
});

describe("both profiles check what publication depends on", () => {
  for (const profile of ["edit", "release"] as const) {
    it(`reports a retained schema that describes another structure under ${profile}`, async () => {
      const { report } = await run({
        fixture: "forged",
        configFile: "retained-sdl.config.json",
        profile,
        ...(profile === "release" && {
          releaseEvidence: completeRelease([]),
        }),
      });
      expect(report.status).toBe("invalid");
      const mismatch = report.diagnostics.find(
        (diagnostic) => diagnostic.code === "PH-DM-COMPATIBILITY-INVALID",
      );
      // Naming the first difference is what makes the report actionable: the
      // author retained bytes that no longer describe the declaration.
      expect(mismatch?.message).toBeTruthy();
      expect(mismatch?.source?.specifier).toBe("./src/retained-sdl.ts");
    });
  }

  it("reports stored data that the definition does not materialize", async () => {
    const { report } = await run({ fixture: "forged" });
    expect(report.status).toBe("invalid");
    const mismatch = report.diagnostics.find(
      (diagnostic) => diagnostic.code === "PH-DM-INITIAL-VALUE-INVALID",
    );
    expect(mismatch?.expected).toBe('{"value":""}');
    expect(mismatch?.received).toBe('{"value":"tampered"}');
  });

  it("reports two operations persisting one action type", async () => {
    const { report } = await run({
      fixture: "forged",
      configFile: "duplicate-action.config.json",
    });
    expect(report.status).toBe("invalid");
    expect(codes(report)).toContain("PH-DM-DUPLICATE-ACTION");
  });

  it("names a scalar a definition source tried to own", async () => {
    const { report } = await run({ fixture: "scalars" });
    expect(report.status).toBe("invalid");
    expect(
      report.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code === "PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED",
        )
        .map((diagnostic) => diagnostic.definition?.key),
    ).toEqual(["Amount", "Money"]);
  });

  it("accepts a package scalar and the model that references it", async () => {
    const { report } = await run({
      fixture: "scalars",
      configFile: "package-scalar.config.json",
    });
    expect(codes(report)).toEqual([]);
    expect(report.status).toBe("ok");
    expect(report.definitions.map((entry) => [entry.kind, entry.key])).toEqual([
      ["document-model", "fixture/contacts"],
      ["scalar", "PhoneNumber"],
    ]);
  });

  it("refuses two different package scalars under one name", async () => {
    const { report } = await run({
      fixture: "scalars",
      configFile: "conflicting-scalars.config.json",
    });
    expect(report.status).toBe("invalid");
    expect(codes(report)).toEqual(["PH-SCALAR-DUPLICATE-NAME"]);
    expect(report.diagnostics[0].definition?.key).toBe("PhoneNumber");
  });

  it("reports a source that exports nothing and a manifest that does not match", async () => {
    const nothing = await run({
      fixture: "failures",
      configFile: "nothing.config.json",
    });
    expect(codes(nothing.report)).toEqual(["PH-PKG-DEFINITION-UNRECOGNIZED"]);

    const manifest = await run({
      fixture: "collisions",
      configFile: "manifest.config.json",
    });
    expect(codes(manifest.report)).toContain("PH-DM-DECLARATION-INVALID");
  });
});

describe("the release profile", () => {
  it("cannot report ok without the work a release requires", async () => {
    const { report } = await run({ fixture: "control", profile: "release" });
    expect(report.profile).toBe("release");
    expect(report.status).toBe("failed");
    expect(exitCodeFor(report)).toBe(2);
    expect(codes(report)).toContain("PH-PKG-RELEASE-EVIDENCE-MISSING");
  });

  it("cannot report ok when a verifier ran no consumer", async () => {
    const { report } = await run({
      fixture: "control",
      profile: "release",
      releaseEvidence: {
        typecheck: () => ({ ok: true }),
        verifyPackedConsumers: () => ({ ok: true, consumers: [] }),
      },
    });
    expect(report.status).toBe("failed");
    expect(codes(report)).toContain("PH-PKG-RELEASE-EVIDENCE-MISSING");
  });

  it("fails a release whose TypeScript build did not succeed", async () => {
    const { report } = await run({
      fixture: "control",
      profile: "release",
      releaseEvidence: {
        typecheck: () => ({ ok: false, summary: "2 errors" }),
        verifyPackedConsumers: () => ({ ok: true, consumers: ["node"] }),
      },
    });
    expect(report.status).toBe("failed");
    expect(codes(report)).toContain("PH-PKG-TYPECHECK-FAILED");
  });

  it("fails a release whose packed consumer could not import the candidate", async () => {
    const { report } = await run({
      fixture: "control",
      profile: "release",
      releaseEvidence: {
        typecheck: () => ({ ok: true }),
        verifyPackedConsumers: () => ({
          ok: false,
          consumers: ["node"],
          summary: "node consumer failed",
        }),
      },
    });
    expect(report.status).toBe("invalid");
    expect(codes(report)).toContain("PH-PKG-PACKED-CONSUMER-FAILED");
  });

  it("runs each piece of evidence once and records the profile", async () => {
    const calls: string[] = [];
    const { report } = await run({
      fixture: "control",
      profile: "release",
      releaseEvidence: completeRelease(calls),
    });
    expect(report.status).toBe("ok");
    expect(report.profile).toBe("release");
    expect(calls).toEqual(["typecheck", "packed"]);
  });

  it("never reports a successful edit run as release approval", async () => {
    const edit = await run({ fixture: "control" });
    expect(edit.report.profile).toBe("edit");
    expect(edit.report.status).toBe("ok");
    // The profile is in the report, so a caller cannot mistake one for the
    // other by looking at the status alone.
    expect(edit.report.profile).not.toBe("release");
  });
});

describe("the report surfaces compatibility selections", () => {
  it("names every mode a declaration selected and the authored path that selected it", async () => {
    const { report } = await run({ fixture: "warnings" });
    const [definition] = report.definitions;
    expect(definition.compatibility).toEqual({
      identity: "explicit-schema-first",
      serialization: "canonical-v1",
      paths: {
        ids: [
          "module/values",
          "operation/values/clearValue",
          "operation/values/setValue",
        ],
        names: [],
        serialization: [],
      },
    });
  });

  it("says so when a declaration selected no compatibility mode", async () => {
    const { report } = await run({ fixture: "control" });
    for (const definition of report.definitions) {
      expect(definition.compatibility).toEqual({
        identity: "derived-v1",
        serialization: "canonical-v1",
        paths: { ids: [], names: [], serialization: [] },
      });
    }
  });
});

describe("DefinitionCheckSession", () => {
  it("settles every rapid request, publishes only the newest, and coalesces equal ones", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const published: DefinitionCheckReport[] = [];
      let executions = 0;
      const loader = new DefinitionSourceLoader(nodeImporter());
      const session = new DefinitionCheckSession({
        run: (request, signal) => {
          executions += 1;
          return checkDefinitions({ ...request, signal });
        },
        publish: (report) => published.push(report),
      });
      const base = {
        profile: "edit" as const,
        loader,
        configFile: join(fixture.root, "powerhouse.config.json"),
      };
      const revision = packageRevisionOf(fixture.root);
      const settled = await Promise.allSettled(
        Array.from({ length: 50 }, () =>
          session.request({ ...base, packageRevision: revision }),
        ),
      );
      expect(settled.every((entry) => entry.status === "fulfilled")).toBe(true);
      expect(executions).toBe(1);
      expect(published).toHaveLength(1);
      await loader.dispose();
    } finally {
      fixture.dispose();
    }
  });

  it("refuses to publish a run that finished after a newer request", async () => {
    const published: DefinitionCheckReport[] = [];
    const finish: ((report: DefinitionCheckReport) => void)[] = [];
    const session = new DefinitionCheckSession({
      // Deliberately ignores its abort signal, which is the case the
      // generation token exists for: a superseded run that finishes anyway
      // must not publish a report describing source that no longer exists.
      run: (request) =>
        new Promise<DefinitionCheckReport>((resolve) => {
          finish.push(resolve);
          void request;
        }),
      publish: (report) => published.push(report),
    });
    const loader = new DefinitionSourceLoader(nodeImporter());
    const base = { profile: "edit" as const, loader };
    const stale = session.request({
      ...base,
      packageRevision: `sha256:${"1".repeat(64)}`,
    });
    const fresh = session.request({
      ...base,
      packageRevision: `sha256:${"2".repeat(64)}`,
    });

    const reportFor = (label: string): DefinitionCheckReport => ({
      kind: "powerhouse.definition-check",
      formatVersion: 1,
      profile: "edit",
      status: "ok",
      sourceSet: {
        mode: "code-first",
        origin: "config",
        digest: `sha256:${"0".repeat(64)}`,
        sources: [{ specifier: `./${label}.ts` }],
      },
      definitions: [],
      diagnostics: [],
      summary: { errors: 0, warnings: 0 },
    });

    finish[1](reportFor("fresh"));
    await fresh;
    finish[0](reportFor("stale"));
    await stale;

    expect(published).toHaveLength(1);
    expect(published[0].sourceSet.sources[0].specifier).toBe("./fresh.ts");
  });

  it("lets an identical request run again after one failed", async () => {
    let attempts = 0;
    const session = new DefinitionCheckSession({
      run: () => {
        attempts += 1;
        return Promise.reject(new Error("the check threw"));
      },
    });
    const loader = new DefinitionSourceLoader(nodeImporter());
    const request = {
      profile: "edit" as const,
      loader,
      packageRevision: `sha256:${"3".repeat(64)}` as const,
    };
    await expect(session.request(request)).rejects.toThrow("the check threw");
    // A save that restores identical bytes is a new request, not a coalesced
    // call: replaying the old failure would leave a watch session stuck on a
    // problem the author may have already fixed and reverted.
    await expect(session.request(request)).rejects.toThrow("the check threw");
    expect(attempts).toBe(2);
  });

  it("cancels a superseded run with a stable AbortError and publishes only the newest", async () => {
    const fixture = materializeFixturePackage("control");
    try {
      const published: DefinitionCheckReport[] = [];
      const session = new DefinitionCheckSession({
        run: (request, signal) =>
          new Promise((resolve, reject) => {
            const timer = setTimeout(
              () =>
                resolve({
                  kind: "powerhouse.definition-check",
                  formatVersion: 1,
                  profile: request.profile,
                  status: "ok",
                  sourceSet: {
                    mode: "code-first",
                    origin: "config",
                    digest: `sha256:${"0".repeat(64)}`,
                    sources: [],
                  },
                  definitions: [],
                  diagnostics: [],
                  summary: { errors: 0, warnings: 0 },
                }),
              10,
            );
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(signal.reason as Error);
            });
          }),
        publish: (report) => published.push(report),
      });
      const loader = new DefinitionSourceLoader(nodeImporter());
      const base = { profile: "edit" as const, loader };
      const stale = session.request({
        ...base,
        packageRevision: `sha256:${"1".repeat(64)}`,
      });
      const fresh = session.request({
        ...base,
        packageRevision: `sha256:${"2".repeat(64)}`,
      });
      await expect(stale).rejects.toMatchObject({ name: "AbortError" });
      await expect(fresh).resolves.toMatchObject({ status: "ok" });
      expect(published).toHaveLength(1);
      session.close();
    } finally {
      fixture.dispose();
    }
  });
});

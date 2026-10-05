import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packageJsonTemplate } from "@powerhousedao/codegen/templates";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { getVersion } from "../src/get-version.js";
import {
  runBuild,
  runPrepack,
  runPublishCheck,
} from "../src/services/build.js";
import {
  directoryDigest,
  GENERATION_DIRECTORY,
  type GenerationPhase,
  type GenerationSteps,
  readRetainedApproval,
} from "../src/services/definitions/generation.js";
import { createTypecheckStep } from "../src/services/definitions/build-steps.js";
import { selectedSourceSetDigest } from "../src/services/definitions/selection.js";
import { writeFixtureTsconfig } from "./helpers/emit-fixture.js";
import { recorder } from "./helpers/recorder.js";

const silent = () => undefined;

function withPriorOutput(fixture: string): {
  readonly root: string;
  readonly priorDigest: string;
  readonly dispose: () => void;
} {
  const materialized = materializeFixturePackage(fixture);
  writeFixtureTsconfig(materialized.root);
  const dist = join(materialized.root, "dist");
  mkdirSync(join(dist, "node"), { recursive: true });
  writeFileSync(join(dist, "node", "index.js"), "export const shipped = 1;\n");
  writeFileSync(join(dist, "index.d.ts"), "export declare const shipped: 1;\n");
  writeFileSync(join(dist, "tsconfig.tsbuildinfo"), '{"version":"prior"}\n');
  return {
    root: materialized.root,
    priorDigest: directoryDigest(dist),
    dispose: materialized.dispose,
  };
}

function buildArgsFor(root: string, configFile = "powerhouse.config.json") {
  return {
    outDir: "dist",
    debug: false,
    configFile: join(root, configFile),
    source: [] as string[],
    warningsAsErrors: false,
    noSharedDeps: false,
    ignoreTypeErrors: false,
  };
}

function retained(
  root: string,
  overrides: Partial<Parameters<typeof readRetainedApproval>[0]> = {},
) {
  return readRetainedApproval({
    packageRoot: root,
    outDir: "dist",
    warningsAsErrors: false,
    sourceSetDigest: selectedSourceSetDigest(buildArgsFor(root)),
    ...overrides,
  });
}

describe("phase order", () => {
  it("compiles, checks, bundles, verifies, and only then promotes", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder();
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.status).toBe("ok");
      expect(result.phases).toEqual([
        "typecheck",
        "definitions",
        "candidate",
        "packed",
        "promote",
      ] satisfies GenerationPhase[]);
      expect(recording.calls).toEqual([
        "typecheck",
        "candidate",
        "packed",
        "promote",
      ]);
      expect(result.report?.profile).toBe("release");
      expect(result.report?.status).toBe("ok");
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

describe("opting into builds with type errors", () => {
  it.each(["control", "schema-first"])(
    "permits the opt-in for %s and otherwise preserves prior output",
    async (name) => {
      const fixture = withPriorOutput(name);
      try {
        writeFileSync(
          join(fixture.root, "src", "type-error.ts"),
          'export const count: number = "invalid";\n',
        );
        const run = async (ignoreTypeErrors: boolean, configFile?: string) => {
          const recording = recorder();
          const result = await runBuild(
            { ...buildArgsFor(fixture.root, configFile), ignoreTypeErrors },
            {
              steps: {
                ...recording.steps,
                typecheck: createTypecheckStep("npm", "dist", {
                  ignoreTypeErrors,
                }),
              },
              log: silent,
            },
          );
          return { result, recording };
        };
        const strict = await run(false);
        expect(strict.result.exitCode).toBe(2);
        expect(strict.recording.candidateWrites).toBe(0);
        expect(directoryDigest(join(fixture.root, "dist"))).toBe(
          fixture.priorDigest,
        );

        const allowed = await run(true);
        expect(allowed.result.exitCode).toBe(0);
        expect(allowed.recording.promotions).toBe(1);
        if (name === "control") {
          expect(allowed.result.phases).toContain("definitions");
          expect(allowed.result.phases).toContain("packed");
          const prior = directoryDigest(join(fixture.root, "dist"));
          const invalid = await run(true, "missing-export.config.json");
          expect(invalid.result.exitCode).not.toBe(0);
          expect(invalid.recording.promotions).toBe(0);
          expect(directoryDigest(join(fixture.root, "dist"))).toBe(prior);
        }
      } finally {
        fixture.dispose();
      }
    },
    60_000,
  );
});

describe("what the promoted tree contains", () => {
  it("publishes the declarations the compiler staged", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder();
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      const declarations = join(fixture.root, "dist", "types", "src");
      expect(existsSync(join(declarations, "invoice.d.ts"))).toBe(true);
      expect(existsSync(join(declarations, "helper.d.ts"))).toBe(true);
      expect(existsSync(join(fixture.root, "dist", "node", "index.js"))).toBe(
        true,
      );
    } finally {
      fixture.dispose();
    }
  }, 120_000);

  it("promotes to the directory --out-dir names", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder();
    try {
      const result = await runBuild(
        { ...buildArgsFor(fixture.root), outDir: "lib" },
        { steps: recording.steps, log: silent },
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(join(fixture.root, "lib", "node", "index.js"))).toBe(
        true,
      );
      expect(directoryDigest(join(fixture.root, "dist"))).toBe(
        fixture.priorDigest,
      );
    } finally {
      fixture.dispose();
    }
  }, 120_000);

  it("refuses an --out-dir that is not a directory inside the package", async () => {
    const fixture = withPriorOutput("control");
    try {
      for (const outDir of [".", "../escape", "/tmp/escape"]) {
        await expect(
          runBuild(
            { ...buildArgsFor(fixture.root), outDir },
            { steps: recorder().steps, log: silent },
          ),
        ).rejects.toThrow(/--out-dir/);
      }
      expect(existsSync(join(fixture.root, "src", "invoice.ts"))).toBe(true);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

describe("what a failure is allowed to touch", () => {
  it("evaluates no definition and writes no candidate when TypeScript fails", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder({ typecheckOk: false });
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(2);
      expect(result.phases).toEqual(["typecheck"]);
      expect(recording.candidateWrites).toBe(0);
      expect(recording.promotions).toBe(0);
      expect(directoryDigest(join(fixture.root, "dist"))).toBe(
        fixture.priorDigest,
      );
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("writes no candidate when the declarations are wrong", async () => {
    const fixture = withPriorOutput("forged");
    const recording = recorder();
    try {
      const result = await runBuild(
        buildArgsFor(fixture.root, "retained-sdl.config.json"),
        { steps: recording.steps, log: silent },
      );
      expect(result.exitCode).toBe(1);
      expect(result.phases).toEqual(["typecheck", "definitions"]);
      expect(recording.candidateWrites).toBe(0);
      expect(recording.promotions).toBe(0);
      expect(directoryDigest(join(fixture.root, "dist"))).toBe(
        fixture.priorDigest,
      );
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("keeps the prior output when a packed consumer fails, and only writes privately", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder({ packedOk: false });
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(1);
      expect(recording.candidateWrites).toBe(1);
      expect(recording.promotions).toBe(0);
      expect(readdirSync(join(fixture.root, GENERATION_DIRECTORY))).toEqual([]);
      expect(directoryDigest(join(fixture.root, "dist"))).toBe(
        fixture.priorDigest,
      );
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("cannot pass a verifier that ran no consumer", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder({ consumers: [] });
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(2);
      expect(recording.promotions).toBe(0);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("fails a build whose source moved while it ran", async () => {
    const fixture = withPriorOutput("control");
    const moving = recorder();
    const steps: GenerationSteps = {
      ...moving.steps,
      verifyPackedConsumers: async (request) => {
        writeFileSync(
          join(fixture.root, "src", "helper.ts"),
          "export const normalizeTitle = (t: string) => t;\n",
        );
        return await moving.steps.verifyPackedConsumers(request);
      },
    };
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps,
        log: silent,
      });
      expect(result.exitCode).toBe(2);
      expect(moving.promotions).toBe(0);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

describe("the compatibility window", () => {
  it("warns and builds a package that has not declared definitionSources", async () => {
    const fixture = withPriorOutput("configs");
    const recording = recorder();
    const logged: string[] = [];
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: (text) => logged.push(text),
      });
      expect(result.exitCode).toBe(0);
      expect(recording.promotions).toBe(1);
      expect(logged.join("")).toContain("declares no definitionSources");
      expect(retained(fixture.root)).toEqual({
        ok: false,
        reason: "no completed release check was retained",
      });
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("builds an explicit schema-first package without release evidence", async () => {
    const fixture = withPriorOutput("schema-first");
    const recording = recorder();
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(recording.promotions).toBe(1);
      expect(retained(fixture.root)).toEqual({
        ok: false,
        reason: "no completed release check was retained",
      });
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("still fails an empty, unsupported, or malformed declared selection", async () => {
    const fixture = withPriorOutput("configs");
    try {
      for (const configFile of [
        "empty.config.json",
        "unsupported.config.json",
        "malformed.config.json.txt",
      ]) {
        const recording = recorder();
        const result = await runBuild(buildArgsFor(fixture.root, configFile), {
          steps: recording.steps,
          log: silent,
        });
        expect(result.exitCode, configFile).toBe(2);
        expect(recording.candidateWrites, configFile).toBe(0);
        expect(recording.promotions, configFile).toBe(0);
        expect(directoryDigest(join(fixture.root, "dist")), configFile).toBe(
          fixture.priorDigest,
        );
      }
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("lets a CLI source replace a declared selection that is missing", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder();
    try {
      rmSync(join(fixture.root, "powerhouse.config.json"));
      writeFileSync(join(fixture.root, "powerhouse.config.json"), "{}\n");
      const args = {
        ...buildArgsFor(fixture.root),
        source: ["./src/invoice.ts#/invoiceV1"],
      };
      const result = await runBuild(args, {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(result.report?.sourceSet.origin).toBe("cli");
      const check = retained(fixture.root, {
        sourceSetDigest: selectedSourceSetDigest(args),
      });
      expect(check.ok && check.approval.report.profile).toBe("release");
      expect(check.ok && check.approval.report.sourceSet.origin).toBe("cli");
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

describe("a warning-only package", () => {
  it("builds normally and fails under --warnings-as-errors", async () => {
    const plain = withPriorOutput("warnings");
    try {
      const result = await runBuild(buildArgsFor(plain.root), {
        steps: recorder().steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(result.report?.summary.warnings).toBeGreaterThan(0);
      expect(
        result.report?.diagnostics.every(
          (diagnostic) => diagnostic.severity === "warning",
        ),
      ).toBe(true);
    } finally {
      plain.dispose();
    }

    const strict = withPriorOutput("warnings");
    const recording = recorder();
    try {
      const result = await runBuild(
        { ...buildArgsFor(strict.root), warningsAsErrors: true },
        { steps: recording.steps, log: silent },
      );
      expect(result.exitCode).toBe(1);
      expect(recording.promotions).toBe(0);
      expect(
        result.report?.diagnostics.every(
          (diagnostic) => diagnostic.severity === "warning",
        ),
      ).toBe(true);
    } finally {
      strict.dispose();
    }
  }, 60_000);
});

describe("the retained release approval", () => {
  it("is reused by prepack when it still covers the tree", async () => {
    const fixture = withPriorOutput("control");
    const build = recorder();
    try {
      await runBuild(buildArgsFor(fixture.root), {
        steps: build.steps,
        log: silent,
      });
      const prepack = recorder();
      const logged: string[] = [];
      const result = await runPrepack(buildArgsFor(fixture.root), {
        steps: prepack.steps,
        log: (text) => logged.push(text),
      });
      expect(result).toMatchObject({ status: "ok", exitCode: 0, phases: [] });
      expect(result.report?.profile).toBe("release");
      expect(prepack.calls).toEqual([]);
      expect(logged).toEqual([
        "✔ Reusing the completed release check for this revision.\n",
      ]);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("is invalidated by a reducer edit that moves no definition digest", async () => {
    const fixture = withPriorOutput("control");
    const build = recorder();
    try {
      const first = await runBuild(buildArgsFor(fixture.root), {
        steps: build.steps,
        log: silent,
      });
      writeFileSync(
        join(fixture.root, "src", "helper.ts"),
        "export const normalizeTitle = (t: string) => t.toUpperCase();\n",
      );
      expect(retained(fixture.root)).toEqual({
        ok: false,
        reason: "the package changed since that check",
      });
      const second = await runBuild(buildArgsFor(fixture.root), {
        steps: recorder().steps,
        log: silent,
      });
      const digests = (result: typeof first) =>
        result.report?.definitions.map((entry) => entry.digest);
      expect(digests(first)?.[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(digests(second)).toEqual(digests(first));
    } finally {
      fixture.dispose();
    }
  }, 120_000);

  it("keeps an approval when only local tool state under .ph changes", async () => {
    const fixture = withPriorOutput("control");
    const build = recorder();
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: build.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(readdirSync(join(fixture.root, GENERATION_DIRECTORY))).toEqual([
        "release-approval.json",
      ]);
      mkdirSync(join(fixture.root, ".ph"), { recursive: true });
      writeFileSync(join(fixture.root, ".ph", "read-model.db"), "rows");
      expect(retained(fixture.root).ok).toBe(true);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

describe("a retained approval with one binding changed", () => {
  let fixture: ReturnType<typeof withPriorOutput>;
  const approvalFile = () =>
    join(fixture.root, GENERATION_DIRECTORY, "release-approval.json");
  const shippedFile = () => join(fixture.root, "dist", "node", "index.js");
  const editApproval = (
    edit: (approval: {
      compilerVersion: string;
      report: { profile: string };
    }) => void,
  ) => {
    const approval = JSON.parse(readFileSync(approvalFile(), "utf-8")) as {
      compilerVersion: string;
      report: { profile: string };
    };
    edit(approval);
    writeFileSync(approvalFile(), JSON.stringify(approval));
  };

  beforeAll(async () => {
    fixture = withPriorOutput("control");
    const result = await runBuild(buildArgsFor(fixture.root), {
      steps: recorder().steps,
      log: silent,
    });
    expect(result.exitCode).toBe(0);
  }, 60_000);
  afterAll(() => fixture.dispose());

  it.each<{
    readonly binding: string;
    readonly change: () => Partial<Parameters<typeof retained>[1]> | void;
    readonly reason: string;
  }>([
    {
      binding: "the published output",
      change: () =>
        writeFileSync(shippedFile(), "export const candidate = 'tampered';\n"),
      reason: "the published output changed since that check",
    },
    {
      binding: "the warning policy",
      change: () => ({ warningsAsErrors: true }),
      reason: "the warning policy changed since that check",
    },
    {
      binding: "the report profile",
      change: () =>
        editApproval((approval) => {
          approval.report.profile = "edit";
        }),
      reason: "the retained check ran the edit profile, which approves nothing",
    },
    {
      binding: "the toolchain",
      change: () =>
        editApproval((approval) => {
          approval.compilerVersion = `${approval.compilerVersion}-next`;
        }),
      reason: "the compiler changed since that check",
    },
    {
      binding: "the selected sources",
      change: () => ({
        sourceSetDigest: selectedSourceSetDigest({
          ...buildArgsFor(fixture.root),
          source: ["./src/invoice.ts#/invoiceV1"],
        }),
      }),
      reason: "the selected definition sources changed since that check",
    },
    {
      binding: "the approval's presence",
      change: () => rmSync(approvalFile()),
      reason: "no completed release check was retained",
    },
    {
      binding: "the approval's syntax",
      change: () => writeFileSync(approvalFile(), "{"),
      reason: "the retained release check is unreadable",
    },
    {
      binding: "the approval's shape",
      change: () => writeFileSync(approvalFile(), '{"kind":"something-else"}'),
      reason: "the retained release check is malformed",
    },
  ])("is rejected when $binding changes", ({ change, reason }) => {
    const saved = [approvalFile(), shippedFile()].map(
      (path) => [path, readFileSync(path)] as const,
    );
    expect(retained(fixture.root).ok).toBe(true);
    try {
      expect(retained(fixture.root, change() ?? {})).toEqual({
        ok: false,
        reason,
      });
    } finally {
      for (const [path, bytes] of saved) writeFileSync(path, bytes);
    }
  });
});

describe("a nested package", () => {
  it("checks, builds, and approves the config it was pointed at", async () => {
    const parent = withPriorOutput("control");
    const child = withPriorOutput("warnings");
    const recording = recorder();
    try {
      const result = await runBuild(buildArgsFor(child.root), {
        steps: recording.steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(result.report?.definitions.map((entry) => entry.key)).toEqual([
        "test/reused",
      ]);
      expect(existsSync(join(child.root, "dist", "node", "index.js"))).toBe(
        true,
      );
      expect(directoryDigest(join(parent.root, "dist"))).toBe(
        parent.priorDigest,
      );
      expect(existsSync(join(parent.root, GENERATION_DIRECTORY))).toBe(false);
    } finally {
      child.dispose();
      parent.dispose();
    }
  }, 120_000);
});

describe("publish", () => {
  const publishArgsFor = (root: string, configFile?: string) => ({
    ...buildArgsFor(root, configFile),
    registry: undefined,
    forwardedArgs: [],
  });

  it("refuses the package before it reaches a registry, and reports the check's exit code", async () => {
    const fixture = withPriorOutput("forged");
    const recording = recorder();
    const logged: string[] = [];
    try {
      const result = await runPublishCheck(
        publishArgsFor(fixture.root, "retained-sdl.config.json"),
        { steps: recording.steps, log: (text) => logged.push(text) },
      );
      expect(result.exitCode).toBe(1);
      expect(result.packageRoot).toBe(fixture.root);
      expect(recording.promotions).toBe(0);
      expect(logged.filter((line) => line.includes("release check"))).toEqual([
        "▶ Running a release check: no completed release check was retained.\n",
      ]);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("reuses a completed release check instead of running another", async () => {
    const fixture = withPriorOutput("control");
    const publish = recorder();
    const logged: string[] = [];
    try {
      await runBuild(buildArgsFor(fixture.root), {
        steps: recorder().steps,
        log: silent,
      });
      const result = await runPublishCheck(publishArgsFor(fixture.root), {
        steps: publish.steps,
        log: (text) => logged.push(text),
      });
      expect(result.exitCode).toBe(0);
      expect(result.packageRoot).toBe(fixture.root);
      expect(publish.calls).toEqual([]);
      expect(logged).toEqual([
        "✔ Reusing the completed release check for this revision.\n",
      ]);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("hands its flags to the prepack hook of the npm process it spawns", async () => {
    const fixture = withPriorOutput("control");
    const hook = recorder();
    const logged: string[] = [];
    try {
      const check = await runPublishCheck(
        { ...publishArgsFor(fixture.root), warningsAsErrors: true },
        { steps: recorder().steps, log: silent },
      );
      expect(check.exitCode).toBe(0);
      for (const [name, value] of Object.entries(check.prepackEnvironment)) {
        vi.stubEnv(name, value);
      }
      const result = await runPrepack(
        {
          outDir: "dist",
          debug: false,
          configFile: undefined,
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
        },
        { steps: hook.steps, log: (text) => logged.push(text) },
      );
      expect(result.exitCode).toBe(0);
      expect(hook.calls).toEqual([]);
      expect(logged).toEqual([
        "✔ Reusing the completed release check for this revision.\n",
      ]);
    } finally {
      vi.unstubAllEnvs();
      fixture.dispose();
    }
  }, 60_000);
});

const REPOSITORY_ROOT = join(import.meta.dirname, "..", "..", "..");

function wireScaffoldedPrepack(root: string): void {
  const scaffolded = JSON.parse(
    packageJsonTemplate("ph-scaffolded", {}, {}),
  ) as {
    scripts: { prepack: string };
  };
  const manifest = JSON.parse(
    readFileSync(join(root, "package.json"), "utf-8"),
  ) as Record<string, unknown>;
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify(
      { ...manifest, scripts: { prepack: scaffolded.scripts.prepack } },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(root, "node_modules", ".bin", "ph-cli"),
    `#!/bin/sh\nexec "${join(REPOSITORY_ROOT, "node_modules", ".bin", "tsx")}" "${join(REPOSITORY_ROOT, "clis", "ph-cli", "src", "cli.ts")}" "$@"\n`,
    { mode: 0o755 },
  );
  // Windows runs lifecycle scripts through cmd.exe, which finds the .cmd shim.
  writeFileSync(
    join(root, "node_modules", ".bin", "ph-cli.cmd"),
    `@"${process.execPath}" "${join(REPOSITORY_ROOT, "node_modules", "tsx", "dist", "cli.mjs")}" "${join(REPOSITORY_ROOT, "clis", "ph-cli", "src", "cli.ts")}" %*\r\n`,
  );
}

function runPackageManager(
  root: string,
  command: readonly string[],
): {
  readonly status: number | null;
  readonly output: string;
  readonly tarballs: string[];
} {
  const destination = mkdtempSync(join(tmpdir(), "ph-pack-out-"));
  try {
    const [manager, ...rest] = command;
    const run = spawnSync(
      manager,
      rest.map((part) => (part === "<destination>" ? destination : part)),
      {
        cwd: root,
        encoding: "utf-8",
        // npm and pnpm are .cmd files on Windows, which only a shell runs.
        shell: process.platform === "win32",
        env: {
          ...process.env,
          PH_NO_TELEMETRY: "1",
          WORKSPACE_VERSION: getVersion(),
        },
      },
    );
    return {
      status: run.status,
      output: `${run.stdout}${run.stderr}`,
      tarballs: readdirSync(destination),
    };
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
}

describe("the scaffolded prepack hook", () => {
  for (const manager of ["npm", "pnpm"] as const) {
    it(`lets ${manager} pack reuse the approval ph build left`, async () => {
      const fixture = withPriorOutput("control");
      try {
        wireScaffoldedPrepack(fixture.root);
        const build = await runBuild(buildArgsFor(fixture.root), {
          steps: recorder().steps,
          log: silent,
        });
        expect(build.exitCode).toBe(0);
        const built = directoryDigest(join(fixture.root, "dist"));
        const packed = runPackageManager(fixture.root, [
          manager,
          "pack",
          "--pack-destination",
          "<destination>",
        ]);
        expect(packed.status, packed.output).toBe(0);
        expect(packed.output).toContain(
          "✔ Reusing the completed release check for this revision.",
        );
        expect(packed.tarballs).toEqual(["ph-fixture-control-0.0.0.tgz"]);
        expect(directoryDigest(join(fixture.root, "dist"))).toBe(built);
      } finally {
        fixture.dispose();
      }
    }, 120_000);

    it(`stops ${manager} pack when the declarations are wrong`, () => {
      const fixture = withPriorOutput("forged");
      try {
        cpSync(
          join(fixture.root, "retained-sdl.config.json"),
          join(fixture.root, "powerhouse.config.json"),
        );
        wireScaffoldedPrepack(fixture.root);
        const packed = runPackageManager(fixture.root, [
          manager,
          "pack",
          "--pack-destination",
          "<destination>",
        ]);
        expect(packed.status, packed.output).toBe(1);
        expect(packed.output).toContain("invalid (release profile");
        expect(packed.tarballs).toEqual([]);
        expect(directoryDigest(join(fixture.root, "dist"))).toBe(
          fixture.priorDigest,
        );
      } finally {
        fixture.dispose();
      }
    }, 120_000);
  }

  it("stops a raw npm publish before it reaches a registry", () => {
    const fixture = withPriorOutput("forged");
    try {
      cpSync(
        join(fixture.root, "retained-sdl.config.json"),
        join(fixture.root, "powerhouse.config.json"),
      );
      wireScaffoldedPrepack(fixture.root);
      const published = runPackageManager(fixture.root, [
        "npm",
        "publish",
        "--dry-run",
        "--registry",
        "http://127.0.0.1:1",
      ]);
      expect(published.status, published.output).toBe(1);
      expect(published.output).toContain("invalid (release profile");
    } finally {
      fixture.dispose();
    }
  }, 120_000);
});

describe("a decoy source", () => {
  it("is imported only when a selection names it", async () => {
    const fixture = withPriorOutput("control");
    const markerRoot = mkdtempSync(join(tmpdir(), "ph-decoy-"));
    const marker = join(markerRoot, "imported");
    try {
      writeFileSync(
        join(fixture.root, "src", "decoy.ts"),
        `// @ts-nocheck\nimport { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "imported");\n`,
      );
      const configured = await runBuild(buildArgsFor(fixture.root), {
        steps: recorder().steps,
        log: silent,
      });
      expect(configured.exitCode).toBe(0);
      expect(existsSync(marker)).toBe(false);
      await runBuild(
        { ...buildArgsFor(fixture.root), source: ["./src/decoy.ts"] },
        { steps: recorder().steps, log: silent },
      );
      expect(readFileSync(marker, "utf-8")).toBe("imported");
    } finally {
      fixture.dispose();
      rmSync(markerRoot, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("release artifact regressions", () => {
  it("rebuilds deleted output before prepack", async () => {
    const fixture = withPriorOutput("control");
    try {
      expect(
        (
          await runBuild(buildArgsFor(fixture.root), {
            steps: recorder().steps,
            log: silent,
          })
        ).exitCode,
      ).toBe(0);
      rmSync(join(fixture.root, "dist"), { recursive: true });
      const rebuild = recorder();
      expect(
        (
          await runPrepack(buildArgsFor(fixture.root), {
            steps: rebuild.steps,
            log: silent,
          })
        ).exitCode,
      ).toBe(0);
      expect(rebuild.promotions).toBe(1);
      expect(existsSync(join(fixture.root, "dist", "node", "index.js"))).toBe(
        true,
      );
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("rejects promotion that did not preserve the verified bytes", async () => {
    const fixture = withPriorOutput("control");
    const recording = recorder();
    try {
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: { ...recording.steps, promote: () => Promise.resolve() },
        log: silent,
      });
      expect(result.exitCode).toBe(2);
      expect(
        existsSync(
          join(fixture.root, GENERATION_DIRECTORY, "release-approval.json"),
        ),
      ).toBe(false);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("loads definitions and stages declarations with rootDir src", async () => {
    const fixture = withPriorOutput("control");
    try {
      const config = JSON.parse(
        readFileSync(join(fixture.root, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.rootDir = "src";
      writeFileSync(
        join(fixture.root, "tsconfig.json"),
        JSON.stringify(config),
      );
      const result = await runBuild(buildArgsFor(fixture.root), {
        steps: recorder().steps,
        log: silent,
      });
      expect(result.exitCode).toBe(0);
      expect(
        existsSync(join(fixture.root, "dist", "types", "invoice.d.ts")),
      ).toBe(true);
      expect(
        existsSync(join(fixture.root, "dist", "types", "src", "invoice.d.ts")),
      ).toBe(false);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("rejects output whose parent links outside the package", async () => {
    const fixture = withPriorOutput("control");
    const outside = withPriorOutput("control");
    try {
      symlinkSync(outside.root, join(fixture.root, "linked"));
      await expect(
        runBuild(
          { ...buildArgsFor(fixture.root), outDir: "linked/dist" },
          { steps: recorder().steps, log: silent },
        ),
      ).rejects.toThrow(/--out-dir/);
      expect(directoryDigest(join(outside.root, "dist"))).toBe(
        outside.priorDigest,
      );
    } finally {
      fixture.dispose();
      outside.dispose();
    }
  }, 60_000);
});

describe("nested published layouts", () => {
  it("reuses approval for nested outDir without hashing its own output", async () => {
    const fixture = withPriorOutput("control");
    try {
      const config = JSON.parse(
        readFileSync(join(fixture.root, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.declarationDir = "./build/dist/types";
      writeFileSync(
        join(fixture.root, "tsconfig.json"),
        JSON.stringify(config),
      );
      const args = { ...buildArgsFor(fixture.root), outDir: "build/dist" };
      const first = await runBuild(args, {
        steps: recorder().steps,
        log: silent,
      });
      expect(first.exitCode).toBe(0);
      const prepack = recorder();
      const result = await runPrepack(args, {
        steps: prepack.steps,
        log: silent,
      });
      expect(result).toMatchObject({ status: "ok", exitCode: 0, phases: [] });
      expect(result.report?.profile).toBe("release");
      expect(prepack.calls).toEqual([]);
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("stages declarations published directly at the output root", async () => {
    const fixture = withPriorOutput("control");
    try {
      const config = JSON.parse(
        readFileSync(join(fixture.root, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.declarationDir = "./dist";
      writeFileSync(
        join(fixture.root, "tsconfig.json"),
        JSON.stringify(config),
      );
      expect(
        (
          await runBuild(buildArgsFor(fixture.root), {
            steps: recorder().steps,
            log: silent,
          })
        ).exitCode,
      ).toBe(0);
      expect(
        existsSync(join(fixture.root, "dist", "src", "invoice.d.ts")),
      ).toBe(true);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

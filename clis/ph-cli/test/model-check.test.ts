import type { DefinitionCheckReport } from "@powerhousedao/shared/document-model";
import fs, {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { syncBuiltinESMExports } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import {
  GENERATION_DIRECTORY,
  type GenerationSteps,
} from "../src/services/definitions/generation.js";
import { emitFixture, writeFixtureTsconfig } from "./helpers/emit-fixture.js";
import { recordStreams } from "./helpers/streams.js";
import {
  createModelCheckWatch,
  processStreams,
  runModelCheck,
  runModelCheckWatch,
  UsageError,
  withCapturedStdout,
} from "../src/services/model-check.js";
import type { ModelCheckArgs } from "../src/types.js";

function checkArgs(overrides: Partial<ModelCheckArgs>): ModelCheckArgs {
  return {
    configFile: undefined,
    source: [],
    outDir: "dist",
    json: false,
    jsonLines: false,
    release: false,
    watch: false,
    warningsAsErrors: false,
    debug: undefined,
    ...overrides,
  };
}

type Captured = {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
};

async function check(
  fixture: string,
  args: Partial<ModelCheckArgs> = {},
): Promise<Captured & { readonly root: string }> {
  const materialized = materializeFixturePackage(fixture);
  const io = recordStreams();
  try {
    const code = await runModelCheck(
      checkArgs({
        ...args,
        configFile: join(
          materialized.root,
          args.configFile ?? "powerhouse.config.json",
        ),
      }),
      { streams: io.streams },
    );
    return {
      stdout: io.stdout,
      stderr: io.stderr,
      code,
      root: materialized.root,
    };
  } finally {
    materialized.dispose();
  }
}

describe("ph model check exit codes", () => {
  it("exits 0 for a healthy package", async () => {
    const result = await check("control", { json: true });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("ok");
    expect(report.sourceSet.sources).toEqual([
      { specifier: "./src/catalog.ts" },
      { specifier: "./src/invoice.ts", exportPath: ["invoiceFamily"] },
    ]);
  }, 60_000);

  it("exits 0 with status skipped for an explicit schema-first package", async () => {
    const result = await check("schema-first", { json: true });
    expect(result.code).toBe(0);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("skipped");
    expect(report.skipReason).toBe("explicit-schema-first-mode");
  }, 60_000);

  it("exits 1 when the declarations are wrong", async () => {
    const result = await check("forged", {
      configFile: "retained-sdl.config.json",
      json: true,
    });
    expect(result.code).toBe(1);
    expect((JSON.parse(result.stdout) as DefinitionCheckReport).status).toBe(
      "invalid",
    );
  }, 60_000);

  it("exits 2 when the check could not run", async () => {
    const result = await check("configs", { json: true });
    expect(result.code).toBe(2);
    expect((JSON.parse(result.stdout) as DefinitionCheckReport).status).toBe(
      "failed",
    );
  }, 60_000);

  it("exits 2 with one failed report when the config file does not exist", async () => {
    const result = await check("control", {
      configFile: "nope/powerhouse.config.json",
      json: true,
    });
    expect(result.code).toBe(2);
    expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("failed");
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "PH-CONFIG-SOURCE-INVALID",
    ]);
  }, 60_000);
});

describe("stream discipline", () => {
  it("keeps a source's own stdout out of the report", async () => {
    const result = await check("noisy", { json: true });
    expect(result.code).toBe(2);
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.status).toBe("failed");
    expect(result.stdout.trimEnd().split("\n")).toHaveLength(1);
    expect(result.stderr).toContain(
      "this source writes to stdout while it is being evaluated",
    );
  }, 60_000);

  it("writes nothing to stdout without --json", async () => {
    const result = await check("control");
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      [
        "ok (edit profile, code-first, 2 sources)",
        "  document-model test/invoice v1",
        "  document-model test/invoice v2",
        "0 error(s), 0 warning(s)",
        "",
      ].join("\n"),
    );
  }, 60_000);
});

describe("warnings", () => {
  it("flips a warning-only package from 0 to 1 under the flag", async () => {
    const plain = await check("warnings", { json: true });
    expect(plain.code).toBe(0);
    const strict = await check("warnings", {
      json: true,
      warningsAsErrors: true,
    });
    expect(strict.code).toBe(1);
    const report = JSON.parse(strict.stdout) as DefinitionCheckReport;
    expect(
      report.diagnostics.every(
        (diagnostic) => diagnostic.severity === "warning",
      ),
    ).toBe(true);
  }, 60_000);
});

describe("source selection through the command", () => {
  it("replaces the configured entries with one --source", async () => {
    const result = await check("control", {
      json: true,
      source: ["./src/invoice.ts#/invoiceV1"],
    });
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.sourceSet.origin).toBe("cli");
    expect(report.sourceSet.sources).toEqual([
      { specifier: "./src/invoice.ts", exportPath: ["invoiceV1"] },
    ]);
    expect(report.definitions).toHaveLength(1);
  }, 60_000);

  it("overrides an explicit schema-first selection", async () => {
    const result = await check("schema-first", {
      json: true,
      source: ["./src/invoice.ts"],
    });
    const report = JSON.parse(result.stdout) as DefinitionCheckReport;
    expect(report.sourceSet.mode).toBe("code-first");
    expect(result.code).toBe(2);
    expect(report.status).toBe("failed");
    expect(
      report.diagnostics.map((diagnostic) => [
        diagnostic.code,
        diagnostic.source,
      ]),
    ).toEqual([["PH-IMPORT-FAILED", { specifier: "./src/invoice.ts" }]]);
  }, 60_000);
});

function releaseSteps(): GenerationSteps {
  return {
    typecheck: async ({ packageRoot, emittedRoot }) =>
      await emitFixture(packageRoot, emittedRoot),
    emitCandidate: ({ candidateRoot }) => {
      mkdirSync(join(candidateRoot, "node"), { recursive: true });
      writeFileSync(
        join(candidateRoot, "node", "index.js"),
        "export const candidate = true;\n",
      );
      return Promise.resolve({ ok: true });
    },
    verifyPackedConsumers: () =>
      Promise.resolve({ ok: true, consumers: ["node", "browser"] }),
    promote: () => {
      throw new Error("a check must never promote");
    },
  };
}

describe("the release profile through the command", () => {
  it.each([false, true])(
    "keeps release source logging out of the real JSON stream (outer capture: %s)",
    async (outerCapture) => {
      const fixture = materializeFixturePackage("control");
      writeFixtureTsconfig(fixture.root);
      const source = join(fixture.root, "src", "invoice.ts");
      writeFileSync(
        source,
        `globalThis["process"].stdout.write("release source log\\n");\n${readFileSync(source, "utf8")}`,
      );
      const written: string[] = [];
      const io = recordStreams();
      const original = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string | Uint8Array) => {
        written.push(chunk.toString());
        return true;
      }) as typeof process.stdout.write;
      try {
        const run = () =>
          runModelCheck(
            checkArgs({
              configFile: join(fixture.root, "powerhouse.config.json"),
              release: true,
              json: true,
            }),
            {
              steps: releaseSteps(),
              streams: { out: processStreams.out, err: io.streams.err },
            },
          );
        const code = outerCapture
          ? await withCapturedStdout(io.streams.err, run)
          : await run();
        expect(code).toBe(0);
        expect(JSON.parse(written.join(""))).toMatchObject({
          profile: "release",
          status: "ok",
        });
        expect(io.stderr).toContain("release source log");
      } finally {
        process.stdout.write = original;
        fixture.dispose();
      }
    },
    60_000,
  );

  it("reports a release typecheck failure as one JSON report", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    const source = join(fixture.root, "src", "invoice.ts");
    writeFileSync(
      source,
      `const invalid: string = 12;\n${readFileSync(source, "utf8")}`,
    );
    const io = recordStreams();
    try {
      const code = await runModelCheck(
        checkArgs({
          configFile: join(fixture.root, "powerhouse.config.json"),
          release: true,
          json: true,
        }),
        { steps: releaseSteps(), streams: io.streams },
      );
      expect(code).toBe(2);
      expect(JSON.parse(io.stdout)).toMatchObject({
        profile: "release",
        status: "failed",
        diagnostics: [
          expect.objectContaining({ code: "PH-PKG-TYPECHECK-FAILED" }),
        ],
      });
    } finally {
      fixture.dispose();
    }
  }, 60_000);

  it("reports a release setup failure as one JSON report", async () => {
    const fixture = materializeFixturePackage("control");
    writeFileSync(
      join(fixture.root, "powerhouse.manifest.json"),
      JSON.stringify({ name: "wrong-package" }),
    );
    const io = recordStreams();
    try {
      expect(
        await runModelCheck(
          checkArgs({
            configFile: join(fixture.root, "powerhouse.config.json"),
            release: true,
            json: true,
          }),
          { steps: releaseSteps(), streams: io.streams },
        ),
      ).toBe(2);
      const report = JSON.parse(io.stdout) as DefinitionCheckReport;
      expect(report.status).toBe("failed");
      expect(report.diagnostics[0]?.message).toContain("Package name mismatch");
    } finally {
      fixture.dispose();
    }
  });

  it("runs the work a release requires and never replaces the output", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    mkdirSync(join(fixture.root, "dist"), { recursive: true });
    writeFileSync(
      join(fixture.root, "dist", "shipped.js"),
      "export const a = 1;\n",
    );
    const io = recordStreams();
    try {
      const code = await runModelCheck(
        checkArgs({
          configFile: join(fixture.root, "powerhouse.config.json"),
          json: true,
          release: true,
        }),
        {
          streams: io.streams,
          steps: releaseSteps(),
        },
      );
      const report = JSON.parse(io.stdout) as DefinitionCheckReport;
      expect(report.profile).toBe("release");
      expect(report.status).toBe("ok");
      expect(code).toBe(0);
      expect(readdirSync(join(fixture.root, "dist"))).toEqual(["shipped.js"]);
      expect(
        existsSync(
          join(fixture.root, GENERATION_DIRECTORY, "release-approval.json"),
        ),
      ).toBe(false);
    } finally {
      fixture.dispose();
    }
  }, 180_000);
});

describe("flag validation", () => {
  it.each([
    { watch: true, json: true },
    { json: true, jsonLines: true },
    { jsonLines: true },
  ])("rejects %o, which would put two answers on one stream", async (flags) => {
    await expect(runModelCheck(checkArgs(flags))).rejects.toThrow(UsageError);
  });
});

describe("watch stream discipline", () => {
  it("puts a machine-readable report on the real stdout, not on stderr", async () => {
    const fixture = materializeFixturePackage("control");
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      written.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stdout.write;
    const controller = createModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        jsonLines: true,
      }),
    );
    try {
      await controller.check();
      const reports = written.filter((text) => text.startsWith("{"));
      expect(reports).toHaveLength(1);
      expect((JSON.parse(reports[0]) as DefinitionCheckReport).status).toBe(
        "ok",
      );
    } finally {
      await controller.close();
      process.stdout.write = original;
      fixture.dispose();
    }
  }, 60_000);
});

describe("watch", () => {
  it("reacts to real source edits without watching its own release artifacts", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    const published: DefinitionCheckReport[] = [];
    const steps = releaseSteps();
    let compilations = 0;
    const signalListeners = process.listenerCount("SIGINT");
    let stopped = false;
    const originalWatch = fs.watch;
    let emitUnknownChange: (() => void) | undefined;
    const watchSpy = vi
      .spyOn(fs, "watch")
      .mockImplementation((...args: Parameters<typeof fs.watch>) => {
        const listener = args.at(-1);
        if (typeof listener === "function") {
          emitUnknownChange = () => listener("change", null);
        }
        return originalWatch(...args);
      });
    syncBuiltinESMExports();
    const watching = runModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        release: true,
        jsonLines: true,
        outDir: "build/dist",
      }),
      {
        steps: {
          ...steps,
          typecheck: async (request) => {
            compilations += 1;
            return await steps.typecheck(request);
          },
        },
        streams: {
          out: (text) => {
            published.push(JSON.parse(text) as DefinitionCheckReport);
          },
          err: () => undefined,
        },
      },
    );
    try {
      await vi.waitFor(
        () => {
          expect(process.listenerCount("SIGINT")).toBe(signalListeners + 1);
          expect(published.map((report) => report.status)).toEqual(["ok"]);
        },
        { timeout: 30_000 },
      );
      mkdirSync(join(fixture.root, "build", "dist"), { recursive: true });
      writeFileSync(join(fixture.root, "build", "dist", "noise.js"), "");
      writeFileSync(join(fixture.root, GENERATION_DIRECTORY, "noise.txt"), "");
      emitUnknownChange?.();
      await delay(200);
      expect(compilations).toBe(1);
      expect(published.map((report) => report.status)).toEqual(["ok"]);
      const source = join(fixture.root, "src", "invoice.ts");
      writeFileSync(
        source,
        `const invalid: string = 12;\n${readFileSync(source, "utf8")}`,
      );
      await vi.waitFor(
        () => {
          expect(published.map((report) => report.status)).toEqual([
            "ok",
            "failed",
          ]);
        },
        { timeout: 30_000 },
      );
      process.emit("SIGINT");
      expect(await watching).toBe(0);
      stopped = true;
      writeFileSync(
        source,
        readFileSync(source, "utf8").replace(
          "const invalid: string = 12;\n",
          "",
        ),
      );
      await delay(200);
      expect(compilations).toBe(2);
      expect(published.map((report) => report.status)).toEqual([
        "ok",
        "failed",
      ]);
    } finally {
      if (!stopped) {
        await vi.waitFor(
          () => {
            expect(process.listenerCount("SIGINT")).toBe(signalListeners + 1);
          },
          { timeout: 30_000 },
        );
        process.emit("SIGINT");
        await watching;
      }
      watchSpy.mockRestore();
      syncBuiltinESMExports();
      fixture.dispose();
    }
    expect(process.listenerCount("SIGINT")).toBe(signalListeners);
  }, 60_000);

  it("serializes superseded release generations and publishes only the newest report", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    const firstCandidate = Promise.withResolvers<void>();
    const finishFirst = Promise.withResolvers<void>();
    const steps = releaseSteps();
    const published: string[] = [];
    let candidates = 0;
    let active = 0;
    let maximumActive = 0;
    const controller = createModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        release: true,
        jsonLines: true,
      }),
      {
        steps: {
          ...steps,
          emitCandidate: async (request) => {
            candidates += 1;
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            if (candidates === 1) {
              firstCandidate.resolve();
              await finishFirst.promise;
            }
            try {
              return await steps.emitCandidate(request);
            } finally {
              active -= 1;
            }
          },
        },
        streams: {
          out: (text) => {
            published.push(text);
          },
          err: () => undefined,
        },
      },
    );
    try {
      const first = controller.check();
      const firstResult = first.catch((error: unknown) => error);
      await firstCandidate.promise;
      const source = join(fixture.root, "src", "helper.ts");
      writeFileSync(
        source,
        `${readFileSync(source, "utf8")}\nexport const changed = true;\n`,
      );
      const latest = controller.check();
      finishFirst.resolve();
      expect(await firstResult).toMatchObject({ name: "AbortError" });
      expect(await latest).toMatchObject({ profile: "release", status: "ok" });
      expect(candidates).toBe(2);
      expect(maximumActive).toBe(1);
      expect(
        published.map(
          (text) => (JSON.parse(text) as DefinitionCheckReport).status,
        ),
      ).toEqual(["ok"]);
    } finally {
      finishFirst.resolve();
      await controller.close();
      fixture.dispose();
    }
  }, 60_000);

  it("runs release evidence for each changed revision without publishing outputs", async () => {
    const fixture = materializeFixturePackage("control");
    writeFixtureTsconfig(fixture.root);
    const published: string[] = [];
    const controller = createModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        release: true,
        jsonLines: true,
      }),
      {
        steps: releaseSteps(),
        streams: {
          out: (text) => {
            published.push(text);
          },
          err: () => undefined,
        },
      },
    );
    try {
      expect(await controller.check()).toMatchObject({
        profile: "release",
        status: "ok",
      });
      const source = join(fixture.root, "src", "invoice.ts");
      writeFileSync(
        source,
        `const invalid: string = 12;\n${readFileSync(source, "utf8")}`,
      );
      expect(await controller.check()).toMatchObject({
        profile: "release",
        status: "failed",
      });
      expect(
        published.map(
          (text) => (JSON.parse(text) as DefinitionCheckReport).status,
        ),
      ).toEqual(["ok", "failed"]);
      expect(existsSync(join(fixture.root, "dist"))).toBe(false);
      expect(
        existsSync(
          join(fixture.root, GENERATION_DIRECTORY, "release-approval.json"),
        ),
      ).toBe(false);
    } finally {
      await controller.close();
      fixture.dispose();
    }
  }, 60_000);

  it("coalesces equal requests into one published report", async () => {
    const fixture = materializeFixturePackage("control");
    const published: string[] = [];
    const controller = createModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        jsonLines: true,
      }),
      {
        streams: {
          out: (text) => published.push(text),
          err: () => undefined,
        },
      },
    );
    try {
      const reports = await Promise.all([
        controller.check(),
        controller.check(),
        controller.check(),
      ]);
      expect(reports[1]).toBe(reports[0]);
      expect(published).toHaveLength(1);
      expect((JSON.parse(published[0]) as DefinitionCheckReport).status).toBe(
        "ok",
      );
    } finally {
      await controller.close();
      fixture.dispose();
    }
  }, 60_000);

  it("settles a pending request on close and publishes nothing afterwards", async () => {
    const fixture = materializeFixturePackage("control");
    const published: string[] = [];
    const controller = createModelCheckWatch(
      checkArgs({
        configFile: join(fixture.root, "powerhouse.config.json"),
        watch: true,
        jsonLines: true,
      }),
      {
        streams: { out: (text) => published.push(text), err: () => undefined },
      },
    );
    try {
      await controller.check();
      const source = join(fixture.root, "src", "helper.ts");
      writeFileSync(
        source,
        `${readFileSync(source, "utf8")}\nexport const changed = true;\n`,
      );
      const pending = controller.check();
      await controller.close();
      expect(await pending.catch((error: unknown) => error)).toMatchObject({
        name: "AbortError",
      });
      await delay(50);
      expect(
        published.map(
          (text) => (JSON.parse(text) as DefinitionCheckReport).status,
        ),
      ).toEqual(["ok"]);
    } finally {
      fixture.dispose();
    }
  }, 60_000);
});

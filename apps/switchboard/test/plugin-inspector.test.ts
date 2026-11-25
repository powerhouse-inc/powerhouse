/**
 * The inspector plugin: what it reports (every loaded document model module,
 * all specification versions), when (ready, each package reload), where (a
 * file, gone at shutdown).
 */
import type { HostPlugin, ResolvedPlugin } from "@powerhousedao/host-core";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type ILogger,
} from "document-model";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitchboardHostContext } from "../src/plugin-host.mjs";
import {
  createInspectorPlugin,
  inspectorPluginConfigSchema,
  inspectorReportOf,
  type InspectorReport,
} from "../src/plugins/inspector.mjs";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

/** A module of another type or version, shaped like the base one. */
function moduleOf(
  id: string,
  name: string,
  version?: number,
): DocumentModelModule {
  const base =
    documentModelDocumentModelModule as unknown as DocumentModelModule;
  return {
    ...base,
    ...(version === undefined ? {} : { version }),
    documentModel: {
      ...base.documentModel,
      global: { ...base.documentModel.global, id, name },
    },
  };
}

const readReport = (file: string) =>
  JSON.parse(readFileSync(file, "utf8")) as InspectorReport;

let tempRoot: string;
let reportFile: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "switchboard-inspector-"));
  reportFile = join(tempRoot, "preview", "inspector.json");
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("inspector config", () => {
  it("needs a report file and rejects a typo'd key", () => {
    expect(inspectorPluginConfigSchema.safeParse({}).success).toBe(false);
    expect(
      inspectorPluginConfigSchema.safeParse({ reportFile: "a.json" }).success,
    ).toBe(true);
    expect(
      inspectorPluginConfigSchema.safeParse({ reportFile: "a.json", file: "b" })
        .success,
    ).toBe(false);
    expect(() => createInspectorPlugin({})).toThrow();
  });
});

describe("inspectorReportOf", () => {
  it("lists every module with its specifications, the project marked local", () => {
    const report = inspectorReportOf(
      [
        [
          tempRoot,
          [
            moduleOf("acme/invoice", "Invoice", 2),
            moduleOf("acme/contact", "Contact"),
            moduleOf("acme/invoice", "Invoice", 1),
          ],
        ],
        ["@acme/other", [moduleOf("other/thing", "Thing")]],
      ],
      {
        sequence: 3,
        localPackage: tempRoot,
        now: new Date("2026-01-02T03:04:05.000Z"),
      },
    );

    expect(report).toMatchObject({
      version: 1,
      sequence: 3,
      writtenAt: "2026-01-02T03:04:05.000Z",
      pid: process.pid,
    });
    expect(report.packages.map((p) => [p.name, p.local])).toEqual(
      [
        ["@acme/other", false],
        [tempRoot, true],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
    const local = report.packages.find((p) => p.local)!;
    expect(
      local.models.map((m) => [m.documentType, m.name, m.version]),
    ).toEqual([
      ["acme/contact", "Contact", undefined],
      ["acme/invoice", "Invoice", 1],
      ["acme/invoice", "Invoice", 2],
    ]);
    expect(local.models[0]).not.toHaveProperty("version");
    expect(
      local.models[1]!.documentModel.specifications.length,
    ).toBeGreaterThan(0);
    expect(local.models[1]!.documentModel.id).toBe("acme/invoice");
  });

  it("marks nothing local when the project is not loaded", () => {
    const report = inspectorReportOf([[tempRoot, []]], { sequence: 1 });
    expect(report.packages).toEqual([
      { name: tempRoot, local: false, models: [] },
    ]);
  });
});

describe("inspector hooks", () => {
  function stubContext(
    initial: Map<string, DocumentModelModule[]>,
    options: Record<string, unknown> = {},
  ) {
    const handlers: ((
      models: Record<string, DocumentModelModule[]>,
    ) => unknown)[] = [];
    const logger = stubLogger();
    const ctx = {
      logger,
      options,
      renown: null,
      contributions: {},
      api: {
        packageManager: {
          getDocumentModels: () => new Map(initial),
          onDocumentModelsChange: (
            handler: (models: Record<string, DocumentModelModule[]>) => unknown,
          ) => {
            handlers.push(handler);
          },
        },
      },
    } as unknown as SwitchboardHostContext;
    return {
      ctx,
      logger,
      reload: (models: Record<string, DocumentModelModule[]>) =>
        handlers.forEach((handler) => handler(models)),
    };
  }

  it("reports at ready and on every reload, and removes the file at shutdown", () => {
    const plugin = createInspectorPlugin({ reportFile });
    const cwd = process.cwd();
    const { ctx, reload } = stubContext(
      new Map([[cwd, [moduleOf("acme/contact", "Contact")]]]),
    );

    plugin.hooks!.onReactorReady!(ctx);
    const first = readReport(reportFile);
    expect(first.sequence).toBe(1);
    expect(first.packages).toHaveLength(1);
    expect(first.packages[0]).toMatchObject({ name: cwd, local: true });
    expect(first.packages[0]!.models.map((m) => m.documentType)).toEqual([
      "acme/contact",
    ]);

    reload({
      [cwd]: [
        moduleOf("acme/contact", "Contact"),
        moduleOf("acme/invoice", "Invoice", 1),
      ],
    });
    const second = readReport(reportFile);
    expect(second.sequence).toBe(2);
    expect(second.packages[0]!.models.map((m) => m.documentType)).toEqual([
      "acme/contact",
      "acme/invoice",
    ]);
    // Only the report: the temp file it was written through is gone.
    expect(readdirSync(join(tempRoot, "preview"))).toEqual(["inspector.json"]);

    plugin.hooks!.onShutdown!(ctx);
    expect(existsSync(reportFile)).toBe(false);
    // A reload that lands after the stop writes nothing.
    reload({ [cwd]: [] });
    expect(existsSync(reportFile)).toBe(false);
  });

  it("marks no package local on a switchboard that does not load the project", () => {
    const plugin = createInspectorPlugin({ reportFile });
    const { ctx } = stubContext(new Map([[process.cwd(), []]]), {
      disableLocalPackages: true,
    });
    plugin.hooks!.onReactorReady!(ctx);
    expect(readReport(reportFile).packages[0]!.local).toBe(false);
  });

  it("warns and carries on when the report cannot be written", () => {
    // A folder in the file's place: the rename fails.
    const plugin = createInspectorPlugin({ reportFile: tempRoot });
    const { ctx, logger } = stubContext(new Map());
    expect(() => plugin.hooks!.onReactorReady!(ctx)).not.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it("accepts the retired codegen setting and changes no server option", () => {
    for (const codegen of [undefined, false, true]) {
      const plugin = createInspectorPlugin({ reportFile, codegen });
      expect(plugin.hooks).not.toHaveProperty("transformServerOptions");
    }
  });
});

describe("a switchboard with the inspector in its composition", () => {
  it("writes the report once ready and removes it at shutdown", async () => {
    const names = ["PH_REACTOR_DATABASE_URL", "MCP_ENABLED"];
    const previous = names.map((name) => [name, process.env[name]] as const);
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    delete process.env.MCP_ENABLED;
    const composition: ResolvedPlugin[] = [
      {
        plugin: createInspectorPlugin({ reportFile }) as HostPlugin,
        provenance: "built-in",
        entry: {
          enabled: true,
          verbs: "*",
          config: { reportFile },
          module: "@powerhousedao/switchboard/plugins/inspector",
        },
      },
    ];
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;
    try {
      switchboard = await bootSwitchboard(
        {
          server: { port: 0 },
          storage: { readModel: { url: join(tempRoot, "read-model") } },
          features: { workflows: false },
          packages: { disableLocal: true },
          identity: { keypairPath: join(tempRoot, "identity.json") },
          drive: { slug: "default-drive", global: { name: "Default Drive" } },
        },
        { logger: stubLogger(), pluginComposition: composition },
      );
      const report = readReport(reportFile);
      expect(report).toMatchObject({
        version: 1,
        sequence: 1,
        pid: process.pid,
      });
      expect(Array.isArray(report.packages)).toBe(true);
      expect(report.packages.every((p) => !p.local)).toBe(true);

      await switchboard.shutdown();
      switchboard = undefined;
      expect(existsSync(reportFile)).toBe(false);
    } finally {
      await switchboard?.shutdown();
      for (const [name, value] of previous) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  }, 60_000);
});

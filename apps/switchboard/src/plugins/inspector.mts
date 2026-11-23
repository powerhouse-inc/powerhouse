import type { HostPlugin } from "@powerhousedao/host-core";
import type { DocumentModelModule, ILogger } from "document-model";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { SwitchboardHostContext } from "../plugin-host.mjs";

export const inspectorPluginConfigSchema = z.strictObject({
  /** Where the report is written: an absolute path, or one relative to the
   * working directory. */
  reportFile: z.string().min(1),
  /**
   * Whether a dev switchboard keeps the Vetra codegen processor, which
   * rewrites the project's code from documents on `vetra` drives. Off: a
   * switchboard that reports its runtime only reads the project.
   */
  codegen: z.boolean().default(false),
});

export type InspectorPluginConfig = z.infer<typeof inspectorPluginConfigSchema>;

/** What a host.js entry writes. */
export type InspectorPluginConfigInput = z.input<
  typeof inspectorPluginConfigSchema
>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/switchboard/plugins/inspector": InspectorPluginConfigInput;
  }
}

export const INSPECTOR_REPORT_VERSION = 1;

/** One loaded document model module: one version of one document type. */
export interface InspectorModelReport {
  documentType: string;
  name: string;
  /** The module's version; absent on a model that is not versioned. */
  version?: number;
  /** The module's `documentModel` global state: every specification. */
  documentModel: DocumentModelModule["documentModel"]["global"];
}

export interface InspectorPackageReport {
  /** The package as the package manager keys it: a name, or a folder. */
  name: string;
  /** The project itself: the working directory, loaded as a package. */
  local: boolean;
  models: InspectorModelReport[];
}

export interface InspectorReport {
  version: typeof INSPECTOR_REPORT_VERSION;
  /** Counts the reports of this process: 1 at ready, +1 per reload. */
  sequence: number;
  writtenAt: string;
  pid: number;
  packages: InspectorPackageReport[];
}

export type InspectorPlugin = HostPlugin<
  {
    transformServerOptions: (
      options: Record<string, unknown>,
      ctx: SwitchboardHostContext,
    ) => Record<string, unknown>;
    onReactorReady: (ctx: SwitchboardHostContext) => void;
    onShutdown: (ctx: SwitchboardHostContext) => void;
  },
  InspectorPluginConfig
>;

/** What the plugin reads of the started API. */
interface InspectedApi {
  packageManager: {
    getDocumentModels(): Map<string, DocumentModelModule[]>;
    onDocumentModelsChange(
      handler: (packages: Record<string, DocumentModelModule[]>) => unknown,
    ): void;
  };
}

const samePath = (a: string, b: string) => {
  const [left, right] = [path.resolve(a), path.resolve(b)];
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
};

/** The report of what the package manager holds, packages and models sorted. */
export function inspectorReportOf(
  packages: Iterable<readonly [string, readonly DocumentModelModule[]]>,
  meta: { sequence: number; localPackage?: string; now?: Date },
): InspectorReport {
  const reported = Array.from(packages, ([name, modules]) => ({
    name,
    local: meta.localPackage ? samePath(name, meta.localPackage) : false,
    models: modules
      .map((module) => ({
        documentType: module.documentModel.global.id,
        name: module.documentModel.global.name,
        ...(module.version === undefined ? {} : { version: module.version }),
        documentModel: module.documentModel.global,
      }))
      .sort(
        (a, b) =>
          a.documentType.localeCompare(b.documentType) ||
          (a.version ?? 0) - (b.version ?? 0),
      ),
  })).sort((a, b) => a.name.localeCompare(b.name));
  return {
    version: INSPECTOR_REPORT_VERSION,
    sequence: meta.sequence,
    writtenAt: (meta.now ?? new Date()).toISOString(),
    pid: process.pid,
    packages: reported,
  };
}

/** Readers never see half a report: written beside the file, then renamed. */
export function writeInspectorReport(
  file: string,
  report: InspectorReport,
): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(report));
  try {
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

/**
 * The inspector: reports the runtime this switchboard loaded to whoever
 * started it. Once the reactor is ready, and again each time a package
 * reloads, it writes every loaded document model module's `documentModel`
 * (all specification versions) to `reportFile`. A file, as the run record
 * is: the reader needs no address, and either side restarts alone. The file
 * goes when the switchboard stops.
 */
export function createInspectorPlugin(rawConfig: unknown): InspectorPlugin {
  const config = inspectorPluginConfigSchema.parse(rawConfig ?? {});
  const file = path.resolve(config.reportFile);
  let sequence = 0;
  let stopped = false;
  return {
    name: "switchboard-inspector",
    appliesTo: "switchboard",
    configSchema: inspectorPluginConfigSchema,
    hooks: {
      transformServerOptions: (options) =>
        config.codegen ? options : { ...options, codegenProcessor: false },
      onReactorReady: (ctx) => {
        const { packageManager } = ctx.api as InspectedApi;
        const logger = ctx.logger as ILogger;
        const { disableLocalPackages } = ctx.options as {
          disableLocalPackages?: boolean;
        };
        const localPackage = disableLocalPackages ? undefined : process.cwd();
        const report = (
          packages: Iterable<readonly [string, readonly DocumentModelModule[]]>,
        ) => {
          if (stopped) return;
          try {
            writeInspectorReport(
              file,
              inspectorReportOf(packages, {
                sequence: ++sequence,
                localPackage,
              }),
            );
          } catch (error) {
            logger.warn(
              "The inspector could not write its report to @file: @error",
              file,
              error,
            );
          }
        };
        report(packageManager.getDocumentModels());
        packageManager.onDocumentModelsChange((packages) =>
          report(Object.entries(packages)),
        );
      },
      onShutdown: () => {
        stopped = true;
        rmSync(file, { force: true });
      },
    },
  };
}

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default createInspectorPlugin;

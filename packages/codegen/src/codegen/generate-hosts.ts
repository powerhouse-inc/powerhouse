import {
  describeHostOutputs,
  OUTPUTS_FILE,
  probeHostsFolder,
  RunnerError,
  scanHostImports,
  type HostOutputsDescription,
} from "@powerhousedao/host-core";
import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildConfigJsonDeclaration,
  buildHostsTypesDts,
  buildOutputsFiles,
  CONFIG_JSON_DECLARATION_FILE,
  declaredDependencies,
} from "file-builders";
import { formatSafe } from "utils";

export interface GenerateHostsResult {
  /** Project-relative paths written. */
  written: string[];
  /** Hosts that produce no outputs file, and why (not an error). */
  skipped: { host: string; reason: string }[];
  /** Hosts whose outputs could not be described. */
  failed: { host: string; error: string }[];
}

/** Producers whose outputs.js the host's import graph needs but which do not
 * exist yet: the host cannot be imported (so not described) before them. */
function missingOutputs(hostsDir: string, host: string): string[] {
  const missing = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const file = join(hostsDir, name, "host.js");
    if (!existsSync(file)) return;
    const imports = scanHostImports(readFileSync(file, "utf8"), file);
    for (const producer of imports.outputs) {
      if (!existsSync(join(hostsDir, producer, OUTPUTS_FILE))) {
        missing.add(producer);
      }
    }
    imports.hosts.forEach(visit);
  };
  visit(host);
  return [...missing];
}

async function writeOutputsFiles(
  hostsDir: string,
  description: HostOutputsDescription,
): Promise<string[]> {
  const { js, dts } = buildOutputsFiles(description);
  const dir = join(hostsDir, description.host);
  await writeFileEnsuringDir(
    join(dir, OUTPUTS_FILE),
    await formatSafe(js, "babel"),
  );
  await writeFileEnsuringDir(
    join(dir, "outputs.d.ts"),
    await formatSafe(dts, "typescript"),
  );
  return [
    `hosts/${description.host}/${OUTPUTS_FILE}`,
    `hosts/${description.host}/outputs.d.ts`,
  ];
}

/** Writes the codegen-owned typing files from the project's declared
 * dependencies: `hosts/types.d.ts` and `powerhouse.config.d.json.ts`.
 * Returns the project-relative paths written. */
export async function writeHostsTypesDts(
  projectRoot: string,
): Promise<string[]> {
  const pkgPath = join(projectRoot, "package.json");
  const pkg: unknown = existsSync(pkgPath)
    ? JSON.parse(readFileSync(pkgPath, "utf8"))
    : {};
  const dependencies = declaredDependencies(pkg);
  await writeFileEnsuringDir(
    join(projectRoot, "hosts", "types.d.ts"),
    await formatSafe(buildHostsTypesDts(dependencies), "typescript"),
  );
  const written = ["hosts/types.d.ts"];
  const configDeclaration = buildConfigJsonDeclaration(dependencies);
  if (configDeclaration) {
    await writeFileEnsuringDir(
      join(projectRoot, CONFIG_JSON_DECLARATION_FILE),
      configDeclaration,
    );
    written.push(CONFIG_JSON_DECLARATION_FILE);
  }
  return written;
}

/**
 * `ph generate hosts`: refreshes `hosts/types.d.ts` and writes
 * `hosts/<name>/outputs.js` + `outputs.d.ts` for every host whose runner
 * exports an `outputsSchema`. A host that imports another's outputs.js is
 * described after it (it cannot be imported before the file exists).
 */
export async function generateHostsFiles(
  projectRoot: string,
): Promise<GenerateHostsResult> {
  const probe = probeHostsFolder(projectRoot);
  const result: GenerateHostsResult = { written: [], skipped: [], failed: [] };
  if (probe.kind !== "present") return result;

  result.written.push(...(await writeHostsTypesDts(projectRoot)));

  let pending = [...probe.hosts];
  while (pending.length > 0) {
    const ready = pending.filter(
      (host) => missingOutputs(probe.dir, host).length === 0,
    );
    if (ready.length === 0) break;
    pending = pending.filter((host) => !ready.includes(host));
    for (const host of ready) {
      try {
        const description = await describeHostOutputs(projectRoot, host);
        if (!description) {
          result.skipped.push({
            host,
            reason: "its runner exports no outputsSchema",
          });
          continue;
        }
        result.written.push(
          ...(await writeOutputsFiles(probe.dir, description)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof RunnerError && /Cannot resolve/.test(message)) {
          result.skipped.push({ host, reason: message });
        } else {
          result.failed.push({ host, error: message });
        }
      }
    }
  }
  for (const host of pending) {
    result.failed.push({
      host,
      error: `hosts/${host} imports outputs.js of ${missingOutputs(
        probe.dir,
        host,
      )
        .map((producer) => `hosts/${producer}`)
        .join(
          ", ",
        )}, which could not be generated (a producer failed, produces no outputs, or the outputs imports form a cycle).`,
    });
  }
  return result;
}

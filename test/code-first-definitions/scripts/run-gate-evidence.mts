#!/usr/bin/env node
import { access, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { publishArtifactSet } from "../src/evidence/artifact-set.js";
import {
  cancelledReport,
  evidenceExitCode,
  GATE_IDS,
  runGateEvidence,
  type GateId,
} from "../src/evidence/run-gate-evidence.js";

type Options = {
  gate?: GateId;
  manifest?: string;
  out?: string;
  dependencyReports: string[];
  json: boolean;
};

function parseOptions(args: readonly string[]): Options {
  const options: Options = { json: false, dependencyReports: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--json") {
      options.json = true;
      continue;
    }
    const next = args[index + 1];
    if (next === undefined) throw new Error(`${value} requires a value.`);
    if (value === "--gate") {
      if (!GATE_IDS.includes(next as GateId)) {
        throw new Error(`Unsupported gate: ${next}`);
      }
      options.gate = next as GateId;
    } else if (value === "--manifest") {
      options.manifest = next;
    } else if (value === "--out") {
      options.out = next;
    } else if (value === "--dependency-report") {
      options.dependencyReports.push(next);
    } else {
      throw new Error(`Unknown option: ${value}`);
    }
    index += 1;
  }
  return options;
}

const directDependencyGates: Partial<Record<GateId, readonly GateId[]>> = {
  B1: ["B9"],
  B3: ["B1", "B9"],
  B4: ["B1", "B9"],
  B6: ["B1", "B9"],
  B2: ["B1", "B3", "B9"],
  B7: ["B6", "B9"],
  B8: ["B1", "B9"],
  B5: ["B8", "B9"],
  B14: ["B1", "B6", "B9"],
  B10: ["B2", "B3", "B5", "B8", "B9"],
  B12: ["B4", "B5", "B7", "B8", "B9"],
  B11: ["B1", "B6", "B7", "B10"],
  B13: ["B4", "B5", "B8", "B9", "B12"],
};

async function inferredDependencyReports(
  gate: GateId,
  out: string,
): Promise<string[]> {
  const parent = resolve(process.cwd(), out, "..");
  const paths: string[] = [];
  for (const dependency of directDependencyGates[gate] ?? []) {
    const path = resolve(parent, dependency, "report.json");
    try {
      await access(path);
      paths.push(path);
    } catch {
      // The evidence Module will report the missing dependency deterministically.
    }
  }
  return paths;
}

const controller = new AbortController();
process.once("SIGINT", () =>
  controller.abort(new DOMException("Interrupted", "AbortError")),
);

async function main(): Promise<number> {
  const rawArgs = process.argv.slice(2);
  const options = parseOptions(rawArgs);
  if (!options.gate || !options.manifest || !options.out) {
    throw new Error("--gate, --manifest, and --out are required.");
  }

  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const repositoryRoot = resolve(packageRoot, "../..");
  const dependencyReports = options.dependencyReports.length
    ? options.dependencyReports.map((path) => resolve(process.cwd(), path))
    : await inferredDependencyReports(options.gate, options.out);
  let report = await runGateEvidence({
    gate: options.gate,
    repositoryRoot,
    fixtureManifest: resolve(process.cwd(), options.manifest),
    commandArgs: rawArgs,
    dependencyReports,
    signal: controller.signal,
  });

  if (report.evidence.outcome !== "cancelled") {
    try {
      await publishArtifactSet({
        destination: resolve(process.cwd(), options.out),
        signal: controller.signal,
        write: async (stagingDirectory) => {
          await writeFile(
            resolve(stagingDirectory, "report.json"),
            `${JSON.stringify(report, null, 2)}\n`,
            "utf8",
          );
        },
      });
    } catch (error) {
      if (!controller.signal.aborted) throw error;
      report = cancelledReport(report);
    }
  }

  if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
  else process.stderr.write(`${options.gate}: ${report.evidence.outcome}\n`);
  return evidenceExitCode(report.evidence.outcome);
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = controller.signal.aborted ? 130 : 2;
}

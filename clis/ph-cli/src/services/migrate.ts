import {
  fetchPackageVersionFromNpmRegistry,
  injectPnpmAllowBuilds,
} from "@powerhousedao/shared/clis";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detect, resolveCommand } from "package-manager-detector";
import type { MigrateArgs } from "../types.js";

function getBundledPhCliVersion(): string | undefined {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      const pkg = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8"),
      ) as { name?: string; version?: string };
      if (pkg.name === "@powerhousedao/ph-cli") return pkg.version;
    } catch {
      // keep walking
    }
    dir = dirname(dir);
  }
}

export function resolveCodegenVersion(
  codegenMod: Record<string, unknown>,
): string | undefined {
  const getter = codegenMod.getCodegenVersion;
  if (typeof getter === "function") {
    const v = (getter as () => unknown)();
    if (typeof v === "string") return v;
  }
  return undefined;
}

export function assertCodegenMatchesBundled(args: {
  codegenVersion: string | undefined;
  bundledVersion: string | undefined;
  force: boolean;
}): void {
  const { codegenVersion, bundledVersion, force } = args;
  if (force) return;
  if (!codegenVersion) {
    throw new Error(
      `@powerhousedao/codegen is older than this ph-cli expects (no version export). ` +
        `Reinstall ph-cli to bring a matching codegen, or re-run with --force.`,
    );
  }
  if (bundledVersion && codegenVersion !== bundledVersion) {
    throw new Error(
      `@powerhousedao/codegen@${codegenVersion} does not match ph-cli@${bundledVersion}. ` +
        `Reinstall to align versions, or re-run with --force.`,
    );
  }
}

export async function startMigrate({
  versionPositional,
  version,
  force,
  debug,
}: MigrateArgs) {
  const requested = versionPositional ?? version;
  if (debug) console.log(`[migrate] requested version: ${requested}`);

  let targetVersion: string | undefined;
  try {
    targetVersion = await fetchPackageVersionFromNpmRegistry(
      `@powerhousedao/ph-cli@${requested}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!force) {
      throw new Error(
        `Failed to resolve "${requested}" from the npm registry: ${reason}\nRe-run with --force to migrate using the installed version.`,
      );
    }
    if (debug) {
      console.log(
        `[migrate] failed to resolve target version, --force is set, falling back to bundled codegen: ${reason}`,
      );
    }
  }

  const bundledVersion = getBundledPhCliVersion();
  if (debug) {
    console.log(
      `[migrate] resolved target version: ${targetVersion ?? "(unknown)"}`,
    );
    console.log(
      `[migrate] current ph-cli version: ${bundledVersion ?? "(unknown)"}`,
    );
  }

  if (!targetVersion || force || targetVersion === bundledVersion) {
    if (debug) console.log(`[migrate] running migrate from bundled codegen`);
    const codegenMod = await import("@powerhousedao/codegen");
    const codegenVersion = resolveCodegenVersion(
      codegenMod as unknown as Record<string, unknown>,
    );
    assertCodegenMatchesBundled({
      codegenVersion,
      bundledVersion,
      force: Boolean(force),
    });
    console.log(
      `Running migrate with @powerhousedao/codegen@${codegenVersion ?? "unknown"}`,
    );
    await codegenMod.migrate(targetVersion ?? requested);
    return;
  }

  const agent = (await detect())?.agent ?? "npm";
  const resolved = resolveCommand(agent, "execute", [
    `@powerhousedao/ph-cli@${targetVersion}`,
    "migrate",
    "--version",
    targetVersion,
    ...(debug ? ["--debug"] : []),
  ]);
  if (!resolved) {
    throw new Error(
      `Failed to resolve execute command for package manager "${agent}".`,
    );
  }

  injectPnpmAllowBuilds(agent, resolved);

  const command = `${resolved.command} ${resolved.args.join(" ")}`;
  if (debug) {
    console.log(`[migrate] detected package manager: ${agent}`);
    console.log(`[migrate] re-executing: ${command}`);
  }
  execSync(command, { stdio: "inherit" });
}

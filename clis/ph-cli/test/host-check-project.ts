import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNNER_SOURCE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "runners",
  "switchboard.ts",
);
export const POSTGRES = "postgres://u:p@localhost:5432/reactor";

const temporary: string[] = [];
export function cleanupProjects(): void {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The real runner via a shim outside node_modules, so vitest transforms it. */
export function makeProject(hosts: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-check-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const shim = path.join(dir, "_shim", "ph-cli");
  mkdirSync(shim, { recursive: true });
  writeFileSync(
    path.join(shim, "package.json"),
    JSON.stringify({
      name: "@powerhousedao/ph-cli",
      type: "module",
      exports: { "./runners/switchboard": "./switchboard.ts" },
    }),
  );
  writeFileSync(
    path.join(shim, "switchboard.ts"),
    `export * from ${JSON.stringify(RUNNER_SOURCE)};\n`,
  );
  const scope = path.join(dir, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  symlinkSync(shim, path.join(scope, "ph-cli"), "dir");
  for (const [name, host] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return dir;
}

import { buildHostsTemplates } from "@powerhousedao/codegen/templates";
import {
  copyFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const VETRA_STUDIO = path.resolve(here, "../../../packages/vetra-studio");
const LEGACY_VETRA_HOST = path.resolve(
  here,
  "../../../packages/host-core/test/fixtures/hosts/legacy-vetra/hosts/vetra/host.js",
);
const linkType = process.platform === "win32" ? "junction" : "dir";

/**
 * Gives a test project the host files `ph init` writes for it: the
 * switchboard, connect and dev hosts of the scaffold templates. `ph dev`,
 * `ph connect` and `ph switchboard` run these hosts.
 */
export function writeScaffoldHosts(dir: string, projectName: string): void {
  const templates = buildHostsTemplates(projectName);
  const hosts: [string, string][] = [
    ["switchboard", templates.switchboardHost],
    ["connect", templates.connectHost],
    ["dev", templates.devHost],
  ];
  for (const [name, source] of hosts) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  }
}

/**
 * The hosts of a project made before the dev host: switchboard, connect and
 * a `vetra` compound with the Vetra Studio plugins, which `ph dev` runs
 * there. Its plugins resolve from the project: see `linkVetraStudio`.
 */
export function writeLegacyVetraHosts(dir: string, projectName: string): void {
  writeScaffoldHosts(dir, projectName);
  rmSync(path.join(dir, "hosts", "dev"), { recursive: true });
  mkdirSync(path.join(dir, "hosts", "vetra"), { recursive: true });
  copyFileSync(LEGACY_VETRA_HOST, path.join(dir, "hosts", "vetra", "host.js"));
}

/**
 * A legacy vetra host's Studio plugins resolve from the project. A project
 * under this folder resolves the rest from ph-cli's own dependencies, which
 * do not include @powerhousedao/vetra-studio: link the workspace's.
 */
export function linkVetraStudio(dir: string): void {
  const scope = path.join(dir, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  symlinkSync(VETRA_STUDIO, path.join(scope, "vetra-studio"), linkType);
}

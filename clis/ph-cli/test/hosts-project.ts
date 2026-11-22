import { buildHostsTemplates } from "@powerhousedao/codegen/templates";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const VETRA_STUDIO = path.resolve(here, "../../../packages/vetra-studio");
const linkType = process.platform === "win32" ? "junction" : "dir";

/**
 * Gives a test project the host files `ph init` and `ph migrate` write for
 * it: the switchboard, connect and vetra hosts of the scaffold templates.
 * `ph dev`, `ph connect` and `ph switchboard` run these hosts.
 */
export function writeScaffoldHosts(dir: string, projectName: string): void {
  const templates = buildHostsTemplates(projectName);
  const hosts: [string, string][] = [
    ["switchboard", templates.switchboardHost],
    ["connect", templates.connectHost],
    ["vetra", templates.vetraHost],
  ];
  for (const [name, source] of hosts) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  }
}

/**
 * The vetra host's Studio plugins resolve from the project, and the scaffold
 * lists @powerhousedao/vetra-studio in its devDependencies. A project under
 * this folder resolves the rest from ph-cli's own dependencies, which do not
 * include it: link the workspace's.
 */
export function linkVetraStudio(dir: string): void {
  const scope = path.join(dir, "node_modules", "@powerhousedao");
  mkdirSync(scope, { recursive: true });
  symlinkSync(VETRA_STUDIO, path.join(scope, "vetra-studio"), linkType);
}

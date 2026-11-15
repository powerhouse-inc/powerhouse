import {
  POWERHOUSE_CONFIG_FILE,
  projectFiles,
} from "@powerhousedao/shared/clis";
import { writeGeneratedHostsFiles } from "file-builders";
import type { HostsTemplateOptions } from "templates";
import { basename, join, resolve } from "node:path";
import { isPlainObject } from "remeda";

/**
 * The switchboard plugins a project without hosts/ runs today, as the classic
 * `ph switchboard` and `ph vetra` mount them, in the order of
 * `builtinSwitchboardPlugins`:
 *
 * - mcp: on by default; only MCP_ENABLED=false turns it off.
 * - attachments: always mounted.
 * - privacy: always mounted; it enforces only with PH_PRIVACY_ENABLED and a
 *   secret, which the plugin keeps reading.
 * - workflows: mounted when powerhouse.config.json sets `workflows.enabled`.
 *
 * Document-model subgraphs and inspection are server features, not plugins:
 * they get no entry and their config and env switches keep applying. A
 * switch set only in the environment (MCP_ENABLED, PH_WORKFLOWS_ENABLED) is
 * not read here: the list follows the project's files.
 */
export function classicSwitchboardPlugins(config: unknown): string[] {
  const workflows = isPlainObject(config) ? config.workflows : undefined;
  const workflowsEnabled =
    isPlainObject(workflows) && workflows.enabled === true;
  return [
    "@powerhousedao/switchboard/plugins/mcp",
    "@powerhousedao/switchboard/plugins/attachments",
    "@powerhousedao/switchboard/plugins/privacy",
    ...(workflowsEnabled
      ? ["@powerhousedao/switchboard/plugins/workflows"]
      : []),
  ];
}

/** The name the host files show: package.json `name` without its scope, else
 * the folder name. */
export function hostsProjectName(
  projectDir: string,
  packageName: string | undefined,
): string {
  const name = packageName?.replace(/^@[^/]+\//, "");
  return name ? name : basename(resolve(projectDir));
}

function readConfig(projectDir: string): unknown {
  try {
    return JSON.parse(
      projectFiles.read(join(projectDir, POWERHOUSE_CONFIG_FILE)) ?? "{}",
    );
  } catch {
    // Hand-broken: the author's to fix; the hosts get the base composition.
    return {};
  }
}

// The project's hosts: the folders of hosts/ that hold a host.js.
function hostNames(projectDir: string): string[] {
  const hostsDir = join(projectDir, "hosts");
  return projectFiles
    .list(hostsDir)
    .filter((name) => projectFiles.exists(join(hostsDir, name, "host.js")));
}

/** Whether addHostsFolder adds the hosts: see there. */
export function getsHostsFolder(projectDir: string): boolean {
  return (
    hostNames(projectDir).length === 0 &&
    projectFiles.exists(join(projectDir, POWERHOUSE_CONFIG_FILE))
  );
}

/** Whether the project has the host `name` once migrate has run: its own, or
 * one of the hosts addHostsFolder adds. */
export function hasHostAfterMigration(
  projectDir: string,
  name: string,
): boolean {
  return getsHostsFolder(projectDir) || hostNames(projectDir).includes(name);
}

/**
 * Adds hosts/ (and the agents/ stub) to a project that has none, through the
 * `ph init` writer, composed from what the project runs today. A project
 * that has a host (a hosts/<name>/host.js) gets none added, and neither does
 * one without a powerhouse.config.json, which every host file imports; true
 * when the hosts were added. A hosts/ folder alone does not count: the theme
 * migration writes hosts/connect/style.css into every project. `moved` holds
 * the settings this run took out of powerhouse.config.json for the hosts.
 */
export async function addHostsFolder(
  projectDir: string,
  packageName: string | undefined,
  moved: HostsTemplateOptions = {},
): Promise<boolean> {
  if (!getsHostsFolder(projectDir)) return false;
  await writeGeneratedHostsFiles(
    projectDir,
    hostsProjectName(projectDir, packageName),
    {
      ...moved,
      switchboardPlugins: classicSwitchboardPlugins(readConfig(projectDir)),
    },
  );
  return true;
}

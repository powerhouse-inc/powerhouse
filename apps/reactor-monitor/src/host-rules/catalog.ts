// The folders `ph init` scaffolds, for a host that starts blank. Browser-safe.
import type { HostExport } from "@powerhousedao/host-core/schema";

export type TemplateFolder = "switchboard" | "connect";

export const BLANK_FOLDER = "blank";

/** Not a path: a blank host has no project until it starts in one. */
export const BLANK_ROOT = "blank:";

const BLANK_PROJECT = "powerhouse";

const COMPOUND_RUNNER = "@powerhousedao/host-core/runners/compound";

const PROTOCOL = {
  featureFlags: {
    documentDecisions: false,
    authEnforcement: false,
    authGroups: false,
    authConditions: false,
  },
  createSignaturePolicy: "v2-required",
  unsupportedStoredDocuments: "refuse",
};

const SECTIONS = {
  remote: { enabled: true, allowAdd: true, allowDelete: true },
  local: { enabled: true, allowAdd: true, allowDelete: true },
};

function switchboard(project: string): Record<string, unknown> {
  return {
    name: `${project}-switchboard`,
    runner: {
      module: "@powerhousedao/ph-cli/runners/switchboard",
      port: 7491,
      plugins: [
        "@powerhousedao/switchboard/plugins/mcp",
        "@powerhousedao/switchboard/plugins/attachments",
        "@powerhousedao/switchboard/plugins/workflows",
      ],
    },
    reactor: {
      protocol: PROTOCOL,
      drives: [{ slug: "powerhouse", name: project }],
    },
  };
}

function connect(project: string): Record<string, unknown> {
  return {
    name: `${project}-connect`,
    runner: {
      module: "@powerhousedao/ph-cli/runners/connect",
      port: 6491,
      plugins: [
        {
          module: "@powerhousedao/connect/plugins/generic",
          config: {
            allowAddDrive: true,
            sections: SECTIONS,
            icons: null,
            homeBackground: null,
          },
        },
      ],
    },
    config: {
      branding: { appName: "Powerhouse Connect", icon: null, loader: null },
      home: { background: null },
      app: {
        logLevel: "info",
        basePath: "/",
        offline: true,
        studioMode: false,
      },
      ai: { assistantEnabled: false },
      packages: { externalEnabled: true, liveReload: false },
      drives: {
        allowAddDrive: true,
        defaultDrives: [],
        sections: SECTIONS,
        icons: null,
      },
      renown: {
        url: "https://www.renown.id",
        networkId: "eip155",
        chainId: 1,
      },
      sentry: { dsn: null, env: "dev", tracing: false },
      openPanel: { clientId: "", trackUiEvents: true, trackOperations: true },
      instance: { namespace: null, reactorWorker: false, multiReactor: false },
      reactor: PROTOCOL,
    },
    profile: {
      appId: `inc.powerhouse.connect.${project}`,
      name: project,
    },
    reactor: {
      protocol: PROTOCOL,
      backends: { main: { kind: "worker" } },
      drives: [{ slug: "powerhouse", name: project }],
    },
  };
}

const TEMPLATES: Record<
  TemplateFolder,
  (project: string) => Record<string, unknown>
> = { switchboard, connect };

/** A compound host with no reactors, outside any project. */
export function blankExport(): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: BLANK_PROJECT, root: BLANK_ROOT },
    name: BLANK_FOLDER,
    host: {
      name: BLANK_FOLDER,
      runner: { module: COMPOUND_RUNNER },
      children: {},
    },
    members: {},
  };
}

export function isBlank(envelope: unknown): boolean {
  const project = (envelope as { project?: { root?: unknown } } | undefined)
    ?.project;
  return project?.root === BLANK_ROOT;
}

/** Every catalog folder as a blank host would write it. */
export function catalogFolders(): Record<
  TemplateFolder,
  Record<string, unknown>
> {
  return {
    switchboard: TEMPLATES.switchboard(BLANK_PROJECT),
    connect: TEMPLATES.connect(BLANK_PROJECT),
  };
}

/** Folders a blank host may add from the catalog; none for any other host. */
export function templateFolders(envelope: unknown): TemplateFolder[] {
  return isBlank(envelope) ? ["switchboard", "connect"] : [];
}

/** The folder `ph init` writes for `folder`, if this host may add it. */
export function folderTemplate(
  envelope: unknown,
  folder: string,
): Record<string, unknown> | undefined {
  if (!templateFolders(envelope).includes(folder as TemplateFolder)) {
    return undefined;
  }
  const { project } = envelope as HostExport;
  return TEMPLATES[folder as TemplateFolder](project.name);
}

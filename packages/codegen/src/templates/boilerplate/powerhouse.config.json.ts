import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/registry";

const {
  instance: _instance,
  app: { cookieBanner: _cookieBanner, ...scaffoldedApp } = {},
  ...scaffoldedConnect
} = DEFAULT_CONNECT_CONFIG;
const { appName, icon, ...branding } = scaffoldedConnect.branding ?? {};
const SCAFFOLDED_CONNECT_CONFIG = {
  ...scaffoldedConnect,
  // A build input the runtime defaults leave out; listed so the key shows.
  branding: { appName, icon, favicon: null, ...branding },
  app: scaffoldedApp,
};

type BuildPowerhouseConfigTemplateArgs = {
  /** Project name, hashed to assign this project's dev-server ports. */
  name: string;
  tag?: string;
  version?: string;
  remoteDrive?: string;
};

/**
 * Render the `powerhouse.config.json` scaffolded into newly-created projects
 * by `ph init`.
 *
 * The `connect` block is populated from `DEFAULT_CONNECT_CONFIG` so every
 * runtime field is present in the scaffolded file. Dev consumers that read
 * the source config directly (notably `ph run dev`, which has no dist file)
 * see fully-defined values instead of `undefined`. `connect.instance` and
 * `connect.app.cookieBanner` are the exceptions: unset, the dev host picks
 * its own reactor client and turns the cookie banner off.
 */
// Kept `async` for callsite signature compatibility (callers already
// `await` the result). The body is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function buildPowerhouseConfigTemplate(
  args: BuildPowerhouseConfigTemplateArgs,
): Promise<string> {
  // Ports are assigned per project rather than fixed at 3000/4001, so two
  // projects can run at once. Overridable via PH_SWITCHBOARD_PORT in
  // .env.local, or the CLI flags.
  const ports = deriveProjectPorts(args.name);

  const config: Record<string, unknown> = {
    $schema:
      "https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/packages/shared/clis/source-config.schema.json",
    documentModelsDir: "./document-models",
    editorsDir: "./editors",
    processorsDir: "./processors",
    subgraphsDir: "./subgraphs",
    studio: { port: ports.studioPort },
    reactor: { port: ports.switchboardPort },
    packages: [],
    packageRegistryUrl: DEFAULT_REGISTRY_URL,
    connect: SCAFFOLDED_CONNECT_CONFIG,
  };

  if (args.remoteDrive) {
    config.vetra = { driveUrl: args.remoteDrive };
  }
  // The assistant host (hosts/assistant/host.js) reads its port from here.
  // Fixed rather than name-derived: one agent API per machine is the norm,
  // and the mastra runner defaults to the same port.
  config.assistant = { port: 4910 };

  return `${JSON.stringify(config, null, 2)}\n`;
}

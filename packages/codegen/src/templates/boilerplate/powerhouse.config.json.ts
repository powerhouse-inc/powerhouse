import { deriveProjectPorts } from "@powerhousedao/shared/clis/project-ports";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/registry";

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
 * the source config directly (notably `ph vetra`, which has no dist file)
 * see fully-defined values instead of `undefined`.
 */
// Kept `async` for callsite signature compatibility (callers already
// `await` the result). The body is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function buildPowerhouseConfigTemplate(
  args: BuildPowerhouseConfigTemplateArgs,
): Promise<string> {
  // Ports are assigned per project rather than fixed at 3000/4001, so two
  // projects can run at once and an agent's MCP URL can be baked into
  // .mcp.json before its session starts. Overridable via PH_SWITCHBOARD_PORT /
  // PH_VETRA_CONNECT_PORT in .env.local, or the CLI flags.
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
    connect: DEFAULT_CONNECT_CONFIG,
  };

  const vetra: Record<string, unknown> = {
    connectPort: ports.vetraConnectPort,
  };
  if (args.remoteDrive) {
    vetra.driveId = args.remoteDrive.split("/").pop() ?? "";
    vetra.driveUrl = args.remoteDrive;
  }
  config.vetra = vetra;

  return `${JSON.stringify(config, null, 2)}\n`;
}

import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/registry";

type BuildPowerhouseConfigTemplateArgs = {
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
 * see fully-defined values instead of `undefined`. The constant is the
 * single source of truth — task 6's dist emitter and this template merge
 * the same defaults.
 */
// Kept `async` for callsite signature compatibility (callers already
// `await` the result). The body is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function buildPowerhouseConfigTemplate(
  args: BuildPowerhouseConfigTemplateArgs,
): Promise<string> {
  const config: Record<string, unknown> = {
    $schema:
      "https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/packages/shared/clis/source-config.schema.json",
    documentModelsDir: "./document-models",
    editorsDir: "./editors",
    processorsDir: "./processors",
    subgraphsDir: "./subgraphs",
    studio: { port: 3000 },
    reactor: { port: 4001 },
    packages: [],
    packageRegistryUrl: DEFAULT_REGISTRY_URL,
    connect: DEFAULT_CONNECT_CONFIG,
  };

  if (args.remoteDrive) {
    const driveId = args.remoteDrive.split("/").pop() ?? "";
    config.vetra = { driveId, driveUrl: args.remoteDrive };
  }

  return `${JSON.stringify(config, null, 2)}\n`;
}

import { childLogger } from "document-drive";
import {
  DEFAULT_RENOWN_URL,
  NodeKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
  type IRenown,
} from "@renown/sdk/node";

const logger = childLogger(["switchboard", "renown"]);

export interface RenownOptions {
  /** Path to the keypair file. Defaults to .ph/.keypair.json in cwd */
  keypairPath?: string;
  /** If true, won't generate a new keypair if none exists */
  requireExisting?: boolean;
  /** Base url of the Renown instance to use */
  baseUrl?: string;
}

/**
 * Initialize Renown for the Switchboard instance.
 * This allows Switchboard to authenticate with remote services
 * using the same identity established during `ph login`.
 */
export async function initRenown(
  options: RenownOptions = {},
): Promise<IRenown | null> {
  const {
    keypairPath,
    requireExisting = false,
    baseUrl = DEFAULT_RENOWN_URL,
  } = options;

  const keyStorage = new NodeKeyStorage(keypairPath, {
    logger,
  });

  // Check if we have an existing keypair
  const existingKeyPair = await keyStorage.loadKeyPair();

  if (!existingKeyPair && requireExisting) {
    throw new Error(
      "No existing keypair found and requireExisting is true. " +
        'Run "ph login" to create one.',
    );
  }

  if (!existingKeyPair) {
    logger.info("No existing keypair found. A new one will be generated.");
  }

  const renownCrypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(keyStorage)
    .build();

  const renown = await new RenownBuilder("switchboard", {})
    .withCrypto(renownCrypto)
    .withBaseUrl(baseUrl)
    .build();

  logger.info("Switchboard identity initialized: @did", renownCrypto.did);

  return renown;
}

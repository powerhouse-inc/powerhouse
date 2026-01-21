import type { ILogger } from "@powerhousedao/reactor";
import {
  ConnectCrypto,
  NodeKeyStorage,
  type IConnectCrypto,
} from "@renown/sdk/node";
import { childLogger } from "document-drive";

const logger = childLogger(["switchboard", "connect-crypto"]);

// Singleton instance of ConnectCrypto for the switchboard
let connectCryptoInstance: IConnectCrypto | null = null;

export interface ConnectCryptoOptions {
  /** Path to the keypair file. Defaults to .keypair.json in cwd */
  keypairPath?: string;
  /** If true, won't generate a new keypair if none exists */
  requireExisting?: boolean;
}

/**
 * Initialize ConnectCrypto for the switchboard.
 * This allows the switchboard to authenticate with remote services
 * using the same identity established during `ph login`.
 */
export async function initConnectCrypto(
  options: ConnectCryptoOptions = {},
): Promise<IConnectCrypto | null> {
  const { keypairPath, requireExisting = false } = options;

  const keyStorage = new NodeKeyStorage(keypairPath, {
    logger: logger as unknown as ILogger,
  });

  // Check if we have an existing keypair
  const existingKeyPair = await keyStorage.loadKeyPair();

  if (!existingKeyPair && requireExisting) {
    logger.warn(
      "No existing keypair found and requireExisting is true. " +
        'Run "ph login" to create one.',
    );
    return null;
  }

  if (!existingKeyPair) {
    logger.info("No existing keypair found. A new one will be generated.");
  }

  connectCryptoInstance = new ConnectCrypto(keyStorage);

  const did = await connectCryptoInstance.did();
  logger.info(`Switchboard identity initialized: ${did}`);

  return connectCryptoInstance;
}

/**
 * Get the current ConnectCrypto instance.
 * Returns null if not initialized.
 */
export function getConnectCrypto(): IConnectCrypto | null {
  return connectCryptoInstance;
}

/**
 * Get the DID of the current ConnectCrypto instance.
 * Returns null if not initialized.
 */
export async function getConnectDid(): Promise<string | null> {
  if (!connectCryptoInstance) {
    return null;
  }
  return connectCryptoInstance.did();
}

/**
 * Get a bearer token for authenticating with remote services.
 * Returns null if ConnectCrypto is not initialized.
 */
export async function getBearerToken(
  driveUrl: string,
  address?: string,
  refresh = false,
): Promise<string | null> {
  if (!connectCryptoInstance) {
    return null;
  }
  return connectCryptoInstance.getBearerToken(driveUrl, address, refresh);
}

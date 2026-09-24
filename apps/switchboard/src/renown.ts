import type { FactorySpec, SignerConfig } from "@powerhousedao/reactor";
import {
  createRenownTrustPolicy,
  DEFAULT_KEYPAIR_PATH,
  DEFAULT_RENOWN_URL,
  NodeKeyStorage,
  RenownBuilder,
  RenownCryptoBuilder,
  resolveSwitchboardEndpoint,
  type IRenown,
  type RenownTrustPolicyOptions,
  type SwitchboardRequestFn,
} from "@renown/sdk/node";
import { childLogger } from "document-model";
import { createRequire } from "node:module";
import { resolve } from "node:path";

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

/**
 * Get the signer config for the given renown instance.
 *
 * @param renown - The renown instance
 * @param keypairPath - Where `initRenown` loaded the key from
 */
export function getRenownSignerConfig(
  renown: IRenown,
  keypairPath?: string,
): SignerConfig {
  return {
    signer: renown.signer,
    workerSigner: getRenownWorkerSignerSpec(renown, keypairPath),
  };
}

/**
 * What a pooled executor worker imports to sign as this switchboard: it
 * reloads the key `initRenown` stored, and takes the user known at boot.
 */
export function getRenownWorkerSignerSpec(
  renown: IRenown,
  keypairPath?: string,
): FactorySpec {
  const { signer } = renown;
  const user = signer.user;
  return {
    module: {
      filePath: createRequire(import.meta.url).resolve("@renown/sdk/node"),
      exportName: "createNodeRenownSigner",
    },
    initArgs: {
      appName: signer.app?.name ?? "switchboard",
      keypairPath: resolve(keypairPath ?? DEFAULT_KEYPAIR_PATH),
      ...(signer.app?.key ? { did: signer.app.key } : {}),
      ...(user
        ? {
            user: {
              address: user.address,
              networkId: user.networkId,
              chainId: user.chainId,
            },
          }
        : {}),
    },
  };
}

/** Where switchboard reads the credentials binding keys to wallets. */
export type RenownTrustSource =
  | { source: "remote"; renownUrl?: string; switchboardUrl?: string }
  | { source: "self"; request: SwitchboardRequestFn };

/** Admits a key as a signer for an address a Renown credential binds it to; a `self` source has no worker spec. */
export async function getRenownTrustPolicyConfig(
  trustSource: RenownTrustSource,
  renown: IRenown | null,
): Promise<Pick<SignerConfig, "trustPolicy" | "workerTrustPolicy">> {
  const self = ownIdentity(renown);
  if (trustSource.source === "self") {
    return {
      trustPolicy: createRenownTrustPolicy({
        switchboard: trustSource.request,
        self,
      }),
    };
  }

  const switchboardUrl = await resolveSwitchboardEndpoint({
    switchboardUrl: trustSource.switchboardUrl,
    baseUrl: trustSource.renownUrl,
  });
  const options = {
    ...(switchboardUrl ? { switchboard: switchboardUrl } : {}),
    ...(trustSource.renownUrl ? { renownUrl: trustSource.renownUrl } : {}),
    ...(self ? { self } : {}),
  } satisfies RenownTrustPolicyOptions;
  return {
    trustPolicy: createRenownTrustPolicy(options),
    workerTrustPolicy: {
      module: {
        filePath: createRequire(import.meta.url).resolve("@renown/sdk/node"),
        exportName: "createRenownTrustPolicy",
      },
      initArgs: options,
    },
  };
}

function ownIdentity(
  renown: IRenown | null,
): RenownTrustPolicyOptions["self"] | undefined {
  const key = renown?.signer.app?.key;
  if (!key) {
    return undefined;
  }
  const user = renown.signer.user;
  return {
    key,
    user: {
      address: user?.address ?? "",
      networkId: user?.networkId ?? "",
      chainId: user?.chainId ?? 0,
    },
  };
}

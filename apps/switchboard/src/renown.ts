import type { FactorySpec, SignerConfig } from "@powerhousedao/reactor";
import {
  BaseRenownBuilder,
  createRenownTrustPolicy,
  DEFAULT_KEYPAIR_PATH,
  DEFAULT_RENOWN_URL,
  NodeKeyStorage,
  RENOWN_PRIVATE_KEY_ENV,
  RenownCryptoBuilder,
  resolveSwitchboardEndpoint,
  type IRenown,
  type RenownTrustPolicyOptions,
  type SwitchboardRequestFn,
} from "@renown/sdk/node";
import {
  legacyIdentityPaths,
  resolvePhDir,
} from "@powerhousedao/shared/clis/ph-dir";
import { childLogger } from "document-model";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const logger = childLogger(["switchboard", "renown"]);

export interface RenownOptions {
  /** Path to the keypair file. Defaults to .ph/.keypair.json in cwd */
  keypairPath?: string;
  /** If true, won't generate a new keypair if none exists */
  requireExisting?: boolean;
  /** Base url of the Renown instance to use */
  baseUrl?: string;
  /** No longer read (warned): the instance signs with no user. */
  storagePath?: string;
  /** The relocated `.ph` root (PH_USER_DATA_DIR at the edge). */
  userDataDir?: string;
}

/** A Renown login file a switchboard used to sign as: one that names a user. */
function holdsLogin(file: string): boolean {
  try {
    const stored = JSON.parse(readFileSync(file, "utf8")) as {
      user?: { address?: string };
    };
    return !!stored.user?.address;
  } catch {
    return false;
  }
}

/**
 * Initialize Renown for the Switchboard instance: its key (`.ph/.keypair.json`,
 * or `PH_RENOWN_PRIVATE_KEY`) signs the host's own work, as the instance and
 * no user. A Renown login is never read: no host signs as a person.
 */
export async function initRenown(
  options: RenownOptions = {},
): Promise<IRenown | null> {
  const {
    keypairPath,
    requireExisting = false,
    baseUrl = DEFAULT_RENOWN_URL,
    userDataDir,
    storagePath,
  } = options;

  if (storagePath !== undefined) {
    logger.warn(
      "identity.storagePath is no longer read: this switchboard signs as its instance key only, never as a Renown login. Remove the setting.",
    );
  }
  const phDir = resolvePhDir(
    process.cwd(),
    userDataDir ? { PH_USER_DATA_DIR: userDataDir } : {},
  );
  const loginFile = storagePath ?? join(phDir, ".renown.json");
  if (holdsLogin(loginFile)) {
    logger.warn(
      "@file holds a Renown login from before Powerhouse 6.4. This switchboard no longer reads it and signs as its instance key only. Run `ph migrate` to withdraw and remove it.",
      loginFile,
    );
  }
  // The rest of what came before 6.4 (the owner claim is reactor-api's to
  // name): said, never withdrawn or removed here.
  const legacy = legacyIdentityPaths(phDir);
  const leftovers = [
    legacy.agent,
    ...legacy.trustedKeys,
    legacy.unsignedWrites,
  ].filter((file) => existsSync(file));
  if (leftovers.length > 0) {
    logger.warn(
      "@files are from before Powerhouse 6.4 and no longer read; this switchboard withdraws and removes nothing. Run `ph migrate` to withdraw and remove them.",
      leftovers.join(", "),
    );
  }
  if (process.env[RENOWN_PRIVATE_KEY_ENV]) {
    logger.info(
      `${RENOWN_PRIVATE_KEY_ENV} is this switchboard's instance key: it signs the host's own work, never as a user.`,
    );
  }

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

  // No user storage: the instance signs as itself, with no user.
  const renown = await new BaseRenownBuilder("switchboard")
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

/**
 * What a host with `authEnforcement` off installs: a delegated signer is
 * verified from what it carries, and every other signer is accepted as the
 * default would. No lookup, so it needs no network, at boot or after.
 */
export function getDelegationTrustPolicyConfig(
  renown: IRenown | null,
): Pick<SignerConfig, "trustPolicy" | "workerTrustPolicy"> {
  const ownSigner = renown?.signer;
  const self = ownIdentity(renown);
  return {
    trustPolicy: createRenownTrustPolicy({ delegationOnly: true, ownSigner }),
    workerTrustPolicy: {
      module: {
        filePath: createRequire(import.meta.url).resolve("@renown/sdk/node"),
        exportName: "createRenownTrustPolicy",
      },
      initArgs: { delegationOnly: true, ...(self ? { self } : {}) },
    },
  };
}

/** Where switchboard reads the credentials binding keys to wallets. */
export type RenownTrustSource =
  | { source: "remote"; renownUrl?: string; switchboardUrl?: string }
  | { source: "self"; request: SwitchboardRequestFn };

/**
 * Admits a key as a signer for an address a Renown credential binds it to; a
 * `self` source has no worker spec. In process, the switchboard's own key is
 * matched against its current user; the worker spec carries the user known now.
 */
export async function getRenownTrustPolicyConfig(
  trustSource: RenownTrustSource,
  renown: IRenown | null,
): Promise<Pick<SignerConfig, "trustPolicy" | "workerTrustPolicy">> {
  const ownSigner = renown?.signer;
  if (trustSource.source === "self") {
    return {
      trustPolicy: createRenownTrustPolicy({
        switchboard: trustSource.request,
        ownSigner,
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
  } satisfies RenownTrustPolicyOptions;
  const self = ownIdentity(renown);
  return {
    trustPolicy: createRenownTrustPolicy({ ...options, ownSigner }),
    workerTrustPolicy: {
      module: {
        filePath: createRequire(import.meta.url).resolve("@renown/sdk/node"),
        exportName: "createRenownTrustPolicy",
      },
      initArgs: { ...options, ...(self ? { self } : {}) },
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

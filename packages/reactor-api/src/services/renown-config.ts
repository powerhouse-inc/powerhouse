import type { PHReactorRenown } from "@powerhousedao/shared/clis";
import type { ILogger } from "document-model";

/** Where the credential check reads from: a remote Renown or Switchboard
 * instance, or this switchboard's own renown read model. */
export type RenownSource = NonNullable<PHReactorRenown["source"]>;

/** The `auth.renown` config block: which Renown instance to authenticate
 * against, before env overrides are applied. */
export type RenownConfig = PHReactorRenown;

/** Resolved renown coordinates. `url` also drives this reactor's own identity,
 * so it stays meaningful when `source` is "self". */
export type ResolvedRenownConfig = {
  source: RenownSource;
  url: string | undefined;
  switchboardUrl: string | undefined;
};

/** Reading credentials from this reactor's own read model needs a host-supplied
 * verifier: core has no idea which subgraph serves that read model. */
export function assertCredentialVerifierForSource(
  source: RenownSource,
  hasVerifier: boolean,
): void {
  if (source !== "self" || hasVerifier) {
    return;
  }
  throw new Error(
    'Renown credential verification is set to "self" (auth.renown.source or ' +
      "RENOWN_SOURCE) but no verifyCredential was provided. A host that reads " +
      "its own read model must pass one — see apps/switchboard, which builds " +
      "it from @renown/sdk createLocalCredentialVerifier — or set " +
      "RENOWN_SOURCE=remote to verify against a Renown instance.",
  );
}

// Treat a blank env var as unset so `RENOWN_URL=` cannot blank out the config.
function envOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolve `auth.renown`; RENOWN_SOURCE / RENOWN_URL / SWITCHBOARD_URL win
 * over the config file, which wins over the SDK defaults. */
export function resolveRenownConfig(
  configured: RenownConfig | undefined,
  env: NodeJS.ProcessEnv,
  logger: ILogger,
): ResolvedRenownConfig {
  return {
    source: resolveRenownSource(
      envOverride(env.RENOWN_SOURCE) ?? configured?.source,
      logger,
    ),
    url: envOverride(env.RENOWN_URL) ?? configured?.url,
    switchboardUrl:
      envOverride(env.SWITCHBOARD_URL) ?? configured?.switchboardUrl,
  };
}

// `null` is reachable despite the types: it is what `"source": null` in the
// config file deserialises to, and counts as unset like a blank env var.
function resolveRenownSource(
  value: string | null | undefined,
  logger: ILogger,
): RenownSource {
  if (value === undefined || value === null) {
    return "remote";
  }
  if (value === "self" || value === "remote") {
    return value;
  }
  logger.warn(
    `Ignoring invalid renown source "${value}" (expected "self" or "remote") — using "remote"`,
  );
  return "remote";
}

import type { PHReactorRenown } from "@powerhousedao/shared/clis";
import type { ILogger } from "document-model";

/** The former credential sources. No longer read: a host checks its records,
 * then Renown, and finds an in-process Renown (its read model) itself. */
export type RenownSource = NonNullable<PHReactorRenown["source"]>;

/** The `auth.renown` config block: which Renown instance to authenticate
 * against, before env overrides are applied. */
export type RenownConfig = PHReactorRenown;

/** Resolved renown coordinates; `url` also drives this reactor's own identity. */
export type ResolvedRenownConfig = {
  url: string | undefined;
  switchboardUrl: string | undefined;
};

/** What the log says of a source setting that is still set. */
export const RENOWN_SOURCE_IGNORED =
  "RENOWN_SOURCE (auth.renown.source) is no longer read: a host checks a credential's record in its data folder, then Renown, and asks its own renown read model when it serves one. Remove the setting.";

// Treat a blank env var as unset so `RENOWN_URL=` cannot blank out the config.
function envOverride(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolve `auth.renown`; RENOWN_URL / SWITCHBOARD_URL win over the config
 * file, which wins over the SDK defaults. A source setting is warned of. */
export function resolveRenownConfig(
  configured: RenownConfig | undefined,
  env: NodeJS.ProcessEnv,
  logger: ILogger,
): ResolvedRenownConfig {
  // `null` is what `"source": null` in the config file deserialises to.
  const source = envOverride(env.RENOWN_SOURCE) ?? configured?.source;
  if (source !== undefined && source !== null) {
    logger.warn(RENOWN_SOURCE_IGNORED);
  }
  return {
    url: envOverride(env.RENOWN_URL) ?? configured?.url,
    switchboardUrl:
      envOverride(env.SWITCHBOARD_URL) ?? configured?.switchboardUrl,
  };
}

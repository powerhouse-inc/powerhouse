import { errorUtils } from "@verdaccio/core";
import bcrypt from "bcryptjs";
import { type AuthStore } from "./auth-store.js";
import { createPgPool, createPgStore } from "./pg-store.js";
import { markStoreLoaded, takeAuthStore } from "./store-handoff.js";
import {
  createRenownVerifier,
  renownApiJwtMiddleware,
  type JwtMiddlewareHelpers,
  type RenownVerifier,
} from "./renown-verifier.js";

/**
 * Postgres-backed Verdaccio auth plugin.
 *
 * Replaces htpasswd with a shared, persistent store so accounts survive
 * redeploys and are consistent across the registry's replicas, and adds
 * npm-style package ownership (first publisher owns the name; others get 403).
 * Active only when a database URL is configured; otherwise the registry keeps
 * the built-in htpasswd path.
 */
export interface RegistryAuthPluginConfig {
  databaseUrl?: string;
  /** Token for a store stashed via store-handoff. Never a `store` key: verdaccio
   *  merges the app config (incl. the S3 `store` block) into every plugin config. */
  storeToken?: string;
  /** Renown audience (this registry's public URL). Enables renown auth. */
  publicUrl?: string;
  /** Renown service base URL (defaults to the SDK default). */
  renownUrl?: string;
}

const BCRYPT_ROUNDS = 10;

type AuthCallback = (err: Error | null, groups?: string[] | false) => void;
type AuthUserCallback = (err: Error | null, ok?: boolean | string) => void;
type AuthAccessCallback = (err: Error | null, ok?: boolean) => void;
type AccessCallback = (err: Error | null, ok?: boolean) => void;
type RemoteUserLike = { name?: string | null; groups?: string[] };
type PackageLike = { name?: string };

function internal(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return errorUtils.getInternalError(msg);
}

/**
 * Pure plugin factory over an injected store — the unit-testable core.
 * `registryAuthPlugin` below wires it to a real Postgres store.
 */
export function createRegistryAuthPlugin(
  store: AuthStore,
  renownVerifier?: RenownVerifier,
) {
  // Ensure the schema exists before any op; init() is idempotent + memoized.
  const ready = store.init();

  return {
    authenticate(user: string, password: string, cb: AuthCallback): void {
      ready
        .then(() => store.getUser(user))
        .then((rec) => {
          if (!rec) return cb(null, false); // unknown user → not authenticated
          if (!bcrypt.compareSync(password, rec.passwordHash)) {
            return cb(errorUtils.getUnauthorized("bad username or password"));
          }
          return cb(null, [user]);
        })
        .catch((err) => cb(internal(err)));
    },

    adduser(user: string, password: string, cb: AuthUserCallback): void {
      ready
        .then(() =>
          store.createUser(user, bcrypt.hashSync(password, BCRYPT_ROUNDS)),
        )
        .then((created) => {
          // createUser is atomic: false means the name is taken — reject
          // rather than silently overwrite (the htpasswd 201 hole).
          if (!created) {
            return cb(errorUtils.getConflict("username already registered"));
          }
          return cb(null, true);
        })
        .catch((err) => cb(internal(err)));
    },

    // Reads stay open ($all) — anonymous install works.
    allow_access(
      _user: RemoteUserLike,
      _pkg: PackageLike,
      cb: AccessCallback,
    ): void {
      cb(null, true);
    },

    allow_publish(
      user: RemoteUserLike,
      pkg: PackageLike,
      cb: AuthAccessCallback,
    ): void {
      const name = pkg.name ?? "";
      const username = user.name;
      if (!username) {
        return cb(
          errorUtils.getForbidden("authentication required to publish"),
        );
      }
      ready
        .then(() => store.claimOwner(name, username))
        .then((owners) => {
          // Atomic claim already ran: if we're in the owner set, allow.
          if (owners.includes(username)) return cb(null, true);
          return cb(
            errorUtils.getForbidden(
              `not authorized to publish "${name}" (owned by another user)`,
            ),
          );
        })
        .catch((err) => cb(internal(err)));
    },

    allow_unpublish(
      user: RemoteUserLike,
      pkg: PackageLike,
      cb: AuthAccessCallback,
    ): void {
      const name = pkg.name ?? "";
      const username = user.name;
      if (!username) {
        return cb(
          errorUtils.getForbidden("authentication required to unpublish"),
        );
      }
      ready
        .then(() => store.getOwners(name))
        .then((owners) => {
          if (owners && owners.includes(username)) return cb(null, true);
          return cb(
            errorUtils.getForbidden(`not authorized to unpublish "${name}"`),
          );
        })
        .catch((err) => cb(internal(err)));
    },

    // Present only with renown configured — replaces verdaccio's default JWT
    // handling to authenticate renown tokens into remote_user (the owner DID).
    ...(renownVerifier
      ? {
          apiJWTmiddleware(helpers: JwtMiddlewareHelpers) {
            return renownApiJwtMiddleware(renownVerifier, helpers);
          },
        }
      : {}),
  };
}

/** Verdaccio plugin entry. The loader calls this factory (or `new`s the
 *  default export — both return the plugin object). */
export default function registryAuthPlugin(config: RegistryAuthPluginConfig) {
  const store =
    (config.storeToken ? takeAuthStore(config.storeToken) : undefined) ??
    createPgStore(
      createPgPool(
        config.databaseUrl ??
          (() => {
            throw new Error(
              "registry-auth plugin requires a databaseUrl (or a store token)",
            );
          })(),
      ),
    );
  const renownVerifier = config.publicUrl
    ? createRenownVerifier({
        publicUrl: config.publicUrl,
        renownUrl: config.renownUrl,
      })
    : undefined;
  const plugin = createRegistryAuthPlugin(store, renownVerifier);
  // Signal a successful load so the launcher can fail fast if the plugin never
  // engaged (a configured DB but no auth is worse than not starting).
  if (config.storeToken) markStoreLoaded(config.storeToken);
  return plugin;
}

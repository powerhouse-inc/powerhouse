import { errorUtils } from "@verdaccio/core";
import bcrypt from "bcryptjs";
import type { S3Config } from "../types.js";
import { createS3Store, type S3ObjectStore } from "./s3-store.js";

/**
 * S3-backed Verdaccio auth plugin.
 *
 * Closes two holes in the default htpasswd setup:
 *  - **accounts** live in S3 (shared across replicas, survive redeploys), and
 *    `adduser` rejects an existing username instead of the htpasswd
 *    wrong-password-201 auto-create — so usernames can't be impersonated.
 *  - **ownership** (npm-style TOFU): the first publisher of a name owns it;
 *    anyone else gets 403. Self-registration stays open.
 *
 * Object layout (keys prefixed with the s3 keyPrefix, e.g. `vetra/`):
 *  - `…auth/users/<username>.json`  → { name, passwordHash, createdAt }
 *  - `…auth/owners/<enc(pkg)>.json` → { owners: string[], claimedAt }
 */
export interface S3AuthPluginConfig {
  s3: S3Config;
}

interface UserRecord {
  name: string;
  passwordHash: string;
  createdAt: string;
}

/** Owners is a list (single-owner today) so co-maintainers / orgs can be added
 *  later without a storage redesign. */
interface OwnerRecord {
  owners: string[];
  claimedAt: string;
}

const BCRYPT_ROUNDS = 10;

function usersKey(prefix: string, name: string): string {
  return `${prefix}auth/users/${name}.json`;
}

function ownersKey(prefix: string, pkgName: string): string {
  return `${prefix}auth/owners/${encodeURIComponent(pkgName)}.json`;
}

// The verdaccio callback types (loose here to avoid a hard @verdaccio/types dep):
type AuthCallback = (err: Error | null, groups?: string[] | false) => void;
type AuthUserCallback = (err: Error | null, ok?: boolean | string) => void;
type AuthAccessCallback = (err: Error | null, ok?: boolean) => void;
type AccessCallback = (err: Error | null, ok?: boolean) => void;
type RemoteUserLike = { name?: string | null; groups?: string[] };
type PackageLike = { name?: string };

function pkgName(pkg: PackageLike): string {
  return pkg.name ?? "";
}

function internal(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  return errorUtils.getInternalError(msg);
}

/**
 * Pure plugin factory over an injected store — the unit-testable core.
 * `s3AuthPlugin` below wires it to a real S3 store.
 */
export function createS3AuthPlugin(store: S3ObjectStore, keyPrefix: string) {
  return {
    authenticate(user: string, password: string, cb: AuthCallback): void {
      store
        .getJSON<UserRecord>(usersKey(keyPrefix, user))
        .then((rec) => {
          if (!rec) return cb(null, false); // unknown user → not authenticated
          if (!bcrypt.compareSync(password, rec.passwordHash)) {
            return cb(errorUtils.getUnauthorized("bad username or password"));
          }
          return cb(null, [user]); // group set; verdaccio adds $authenticated/$all
        })
        .catch((err) => cb(internal(err)));
    },

    adduser(user: string, password: string, cb: AuthUserCallback): void {
      store
        .exists(usersKey(keyPrefix, user))
        .then(async (exists) => {
          // Existence checked against the SHARED store → an existing name with a
          // wrong password can't silently re-create the account (the emptyDir
          // pod-lottery 201 hole). Registration of a NEW name stays open.
          if (exists)
            return cb(errorUtils.getConflict("username already registered"));
          const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
          await store.putJSON(usersKey(keyPrefix, user), {
            name: user,
            passwordHash,
            createdAt: new Date().toISOString(),
          } satisfies UserRecord);
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
      const name = pkgName(pkg);
      const username = user.name;
      if (!username)
        return cb(
          errorUtils.getForbidden("authentication required to publish"),
        );
      store
        .getJSON<OwnerRecord>(ownersKey(keyPrefix, name))
        .then(async (rec) => {
          if (!rec) {
            // Free name → claim it for this publisher (npm-style TOFU).
            await store.putJSON(ownersKey(keyPrefix, name), {
              owners: [username],
              claimedAt: new Date().toISOString(),
            } satisfies OwnerRecord);
            return cb(null, true);
          }
          if (rec.owners.includes(username)) return cb(null, true);
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
      const name = pkgName(pkg);
      const username = user.name;
      if (!username)
        return cb(
          errorUtils.getForbidden("authentication required to unpublish"),
        );
      store
        .getJSON<OwnerRecord>(ownersKey(keyPrefix, name))
        .then((rec) => {
          // No auto-claim on unpublish; only the recorded owner may remove.
          if (rec && rec.owners.includes(username)) return cb(null, true);
          return cb(
            errorUtils.getForbidden(`not authorized to unpublish "${name}"`),
          );
        })
        .catch((err) => cb(internal(err)));
    },
  };
}

/** Verdaccio plugin entry. The loader calls this factory (or `new`s the
 *  default export — both return the plugin object). */
export default function s3AuthPlugin(pluginConfig: S3AuthPluginConfig) {
  const s3 = pluginConfig.s3;
  const store = createS3Store(s3);
  return createS3AuthPlugin(store, s3.keyPrefix ?? "");
}

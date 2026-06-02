import type { User } from "@renown/sdk";

/**
 * Builds the OpenPanel identity traits from a renown User.
 *
 * Canonical trait schema (shared with Renown and Vetra — each app sends every
 * field it has data for, under these names):
 * - `address`, `did`, `networkId`, `chainId`, `caip2` — wallet/chain facts.
 * - `ensName`, `ensAvatar` — raw ENS facts.
 * - `username`, `userImage`, `profileDocumentId`, `profileCreatedAt` — raw
 *   Renown profile facts.
 * - `accountType` — wallet-adapter concept; only Renown has it.
 *
 * Rules:
 * - `credential` (contains a JWT) is **never** forwarded.
 * - Traits carry raw facts only; resolved presentation values (avatar,
 *   display name) go in OpenPanel's native identify fields — see
 *   {@link buildIdentifyPayload}.
 * - Optional fields (`ens`, `profile`) are only included when their value is
 *   non-nullish (guards against `null` from `RenownProfile` fields as well
 *   as plain `undefined`).
 *
 * Mirror the Sentry pattern in `store/user.ts`: destructure off `credential`
 * first, then assemble the trait payload from the remainder.
 */
export function buildTraits(user: User): Record<string, unknown> {
  // Destructure credential off so it can never accidentally make it into the
  // returned object.
  const { credential: _credential, ...rest } = user;

  const traits: Record<string, unknown> = {
    address: rest.address,
    did: rest.did,
    networkId: rest.networkId,
    chainId: rest.chainId,
    caip2: `${rest.networkId}:${rest.chainId}`,
  };

  // ens fields — optional on the User type
  if (rest.ens?.name != null) {
    traits.ensName = rest.ens.name;
  }
  if (rest.ens?.avatarUrl != null) {
    traits.ensAvatar = rest.ens.avatarUrl;
  }

  // profile fields — optional on InternalUser; RenownProfile members can be
  // null, so guard with != null (catches both null and undefined)
  if (rest.profile?.username != null) {
    traits.username = rest.profile.username;
  }
  if (rest.profile?.userImage != null) {
    traits.userImage = rest.profile.userImage;
  }
  if (rest.profile?.documentId != null) {
    traits.profileDocumentId = rest.profile.documentId;
  }
  if (rest.profile?.createdAt != null) {
    traits.profileCreatedAt = rest.profile.createdAt;
  }

  return traits;
}

/**
 * Builds the full `identify()` payload:
 * - `profileId` is the wallet address — the cross-app profile key shared with
 *   Renown and Vetra.
 * - `avatar` / `firstName` are OpenPanel's native profile fields (they drive
 *   the picture and name in the dashboard UI), resolved as
 *   `userImage ?? ensAvatar` and `ensName ?? username`.
 * - `properties` are the raw traits from {@link buildTraits}.
 */
export function buildIdentifyPayload(user: User): {
  profileId: string;
  avatar?: string;
  firstName?: string;
  properties: Record<string, unknown>;
} {
  const avatar = user.profile?.userImage ?? user.ens?.avatarUrl;
  const firstName = user.ens?.name ?? user.profile?.username;

  return {
    profileId: user.address,
    ...(avatar != null ? { avatar } : {}),
    ...(firstName != null ? { firstName } : {}),
    properties: buildTraits(user),
  };
}

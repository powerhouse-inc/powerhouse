import type { User } from "@renown/sdk";

/**
 * Builds the OpenPanel identity traits from a renown User.
 *
 * Rules:
 * - `credential` (contains a JWT) is **never** forwarded.
 * - The wallet `address` is sent as the top-level `profileId` key in the
 *   `client.identify()` call — the cross-app key shared with Renown and
 *   Vetra. It also stays in traits (Vetra does the same).
 * - The `did` travels as a trait so the DID is preserved on the profile.
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
  };

  // ens fields — optional on the User type
  if (rest.ens?.name != null) {
    traits.ensName = rest.ens.name;
  }
  if (rest.ens?.avatarUrl != null) {
    traits.avatarUrl = rest.ens.avatarUrl;
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

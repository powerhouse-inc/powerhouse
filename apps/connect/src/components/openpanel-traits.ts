import type { User } from "@renown/sdk";

/**
 * Builds the OpenPanel identity traits from a renown User.
 *
 * Rules:
 * - `credential` (contains a JWT) is **never** forwarded.
 * - `did` / `profileId` is sent as the top-level `profileId` key in the
 *   `client.identify()` call — it is **not** duplicated inside traits.
 * - Optional fields (`ens`, `profile`) are only included when their value is
 *   non-nullish (guards against `null` from `RenownProfile` fields as well
 *   as plain `undefined`).
 *
 * Mirror the Sentry pattern in `store/user.ts`: destructure off `credential`
 * first, then assemble the trait payload from the remainder.
 *
 * @see Brief: OpenPanel Analytics in Connect — *Identity Traits* table.
 */
export function buildTraits(user: User): Record<string, unknown> {
  // Destructure credential off so it can never accidentally make it into the
  // returned object.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { credential: _credential, ...rest } = user;

  const traits: Record<string, unknown> = {
    address: rest.address,
    networkId: rest.networkId,
    chainId: rest.chainId,
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

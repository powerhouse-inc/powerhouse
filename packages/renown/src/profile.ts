import type { ProfileFetcher, RenownProfile } from "./types.js";

export const fetchRenownProfile: ProfileFetcher = async (user, baseUrl) => {
  try {
    const response = await fetch(`${baseUrl}/api/profile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ethAddress: user.address,
      }),
    });

    if (!response.ok) {
      return undefined;
    }

    const result = (await response.json()) as {
      profile?: RenownProfile;
    };

    return result.profile ?? undefined;
  } catch {
    return undefined;
  }
};

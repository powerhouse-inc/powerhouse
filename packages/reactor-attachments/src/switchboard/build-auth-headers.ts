import type { JwtHandler } from "@powerhousedao/reactor";

export async function buildAuthHeaders(
  url: string,
  jwtHandler: JwtHandler | undefined,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (jwtHandler) {
    const token = await jwtHandler(url);
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

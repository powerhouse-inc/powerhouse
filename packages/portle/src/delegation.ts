import { promises as dns } from "node:dns";

/**
 * Whether a customer zone is delegated to the relay's nameservers, as the
 * machine's resolver sees it. Vendored from site-relay
 * (`packages/site-agent/src/delegation.ts` at df26ab8).
 *
 * Caddy asks the CA for the wildcard the moment it starts; before the
 * delegation exists the CA's resolvers answer NXDOMAIN and cache it for the
 * parent's negative TTL, so a site started too early loses an hour per
 * attempt and burns its authorization-failure budget. Any resolver error
 * (NXDOMAIN, no data, SERVFAIL, timeout) counts as "not yet".
 */
export interface Delegation {
  zone: string;
  nameservers: string[];
}

export type ResolveNs = (zone: string) => Promise<string[]>;

const canonical = (name: string) =>
  name.trim().toLowerCase().replace(/\.$/, "");

export async function isDelegated(
  delegation: Delegation,
  resolveNs: ResolveNs = (zone) => dns.resolveNs(zone),
): Promise<boolean> {
  const expected = new Set(delegation.nameservers.map(canonical));
  let found: string[];
  try {
    found = await resolveNs(delegation.zone);
  } catch {
    return false;
  }
  return found.some((ns) => expected.has(canonical(ns)));
}

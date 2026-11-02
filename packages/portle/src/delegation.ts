import { promises as dns } from "node:dns";

/**
 * Whether a customer zone is delegated to the relay's nameservers, as the
 * machine's resolver sees it. Vendored from site-relay
 * (`packages/site-agent/src/delegation.ts` at df26ab8).
 *
 * Caddy asks the CA for the wildcard the moment it starts; before the
 * delegation exists the CA's resolvers answer NXDOMAIN and cache it for the
 * parent's negative TTL, so a site started too early loses an hour per
 * attempt and burns its authorization-failure budget. NXDOMAIN and no data
 * count as "not yet"; a resolver that cannot answer is retried, then reported
 * as such.
 */
export interface Delegation {
  zone: string;
  nameservers: string[];
}

export type ResolveNs = (zone: string) => Promise<string[]>;

/** The resolver could not answer at all (timeout, refused, SERVFAIL), so
 * whether the zone is delegated is unknown, which is not "not delegated". */
export class DelegationCheckError extends Error {
  constructor(zone: string, cause: unknown) {
    super(
      `could not check whether ${zone} is delegated: the resolver failed (${errorText(cause)})`,
      { cause },
    );
    this.name = "DelegationCheckError";
  }
}

const canonical = (name: string) =>
  name.trim().toLowerCase().replace(/\.$/, "");

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" && !error.message.includes(code)
      ? `${code}: ${error.message}`
      : error.message;
  }
  return String(error);
}

/** Answers that mean the zone has no NS records yet: NXDOMAIN or no data. */
const NOT_DELEGATED = ["ENOTFOUND", "ENODATA", "NXDOMAIN"];

function isNotDelegatedAnswer(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const text = `${typeof code === "string" ? code : ""} ${error instanceof Error ? error.message : ""}`;
  return NOT_DELEGATED.some((answer) => text.includes(answer));
}

export type DelegationCheckOptions = {
  /** Resolver attempts before a failure is reported; default 4. */
  attempts?: number;
  /** First retry delay, doubled per attempt; default 1000 ms. */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

/**
 * True once the resolver lists one of the relay's nameservers; false when it
 * answers that the zone has none (NXDOMAIN, no data, other nameservers).
 * A resolver that cannot answer is retried with backoff, then reported as a
 * {@link DelegationCheckError}: a DNS blip at boot is not a missing delegation.
 */
export async function isDelegated(
  delegation: Delegation,
  resolveNs: ResolveNs = (zone) => dns.resolveNs(zone),
  options: DelegationCheckOptions = {},
): Promise<boolean> {
  const expected = new Set(delegation.nameservers.map(canonical));
  const attempts = Math.max(1, options.attempts ?? 4);
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let delay = options.delayMs ?? 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      const found = await resolveNs(delegation.zone);
      return found.some((ns) => expected.has(canonical(ns)));
    } catch (error) {
      if (isNotDelegatedAnswer(error)) return false;
      if (attempt >= attempts) {
        throw new DelegationCheckError(delegation.zone, error);
      }
      await sleep(delay);
      delay *= 2;
    }
  }
}

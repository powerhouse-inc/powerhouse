import type { ZoneKind } from "./hostnames.js";

/**
 * What the control plane answers to `POST /v1/enroll`. Vendored from
 * site-relay (`packages/shared/src/types.ts` at df26ab8); the secrets in it
 * live only in the plugin's state directory, mode 600.
 */
export interface EnrollmentResponse {
  siteId: string;
  siteSecret: string;
  /** The DNS name the site lives under: `*.<siteZone>` is its wildcard. */
  siteZone: string;
  zoneKind: ZoneKind;
  /**
   * For a customer zone: the delegation the customer must create at their DNS
   * provider (`<zone> NS <nameserver>` for each nameserver). Null for shared.
   */
  delegation: { zone: string; nameservers: string[] } | null;
  frp: {
    serverAddr: string;
    serverPort: number;
    token: string;
    /** PEM bundle the site must trust for the frps control connection. */
    caPem: string;
    serverName: string;
  };
  dns: {
    tsigKeyName: string;
    tsigAlgorithm: string;
    tsigSecret: string;
    /** host:port of the authoritative server that accepts RFC2136 updates. */
    server: string;
    /** Resolvers Caddy should use to check that the challenge TXT is visible. */
    resolvers: string[];
  };
  /** HTTPS fallback for DNS-01 (acme-dns protocol served by the control plane). */
  acmeDns: {
    baseUrl: string;
    username: string;
    password: string;
    fullDomain: string;
    subdomain: string;
  };
  acme: {
    caUrl?: string;
    caRootPem?: string;
    email: string;
  };
}

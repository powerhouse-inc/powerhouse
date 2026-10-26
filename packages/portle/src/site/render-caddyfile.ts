import {
  LABEL_RE,
  isSiteId,
  isSiteZone,
  isWellFormedHostname,
  siteWildcard,
} from "./hostnames.js";

/**
 * Renders the site's Caddyfile. Vendored from site-relay
 * (`packages/site-agent/src/render/caddyfile.ts` at df26ab8). Caddy holds
 * the private key and the wildcard certificate, obtained by DNS-01 through
 * the relay's PowerDNS (TSIG) or the acme-dns fallback on the control plane.
 */
export type Dns01 =
  | {
      mode: "rfc2136";
      keyName: string;
      keyAlg: string;
      secret: string;
      server: string;
    }
  | {
      mode: "acmedns";
      username: string;
      password: string;
      subdomain: string;
      serverUrl: string;
    };

export interface CaddyRenderInput {
  siteId: string;
  /** The site's zone: the wildcard block is `*.<siteZone>`. */
  siteZone: string;
  email: string;
  acmeCaUrl?: string | undefined;
  /** Path of the ACME directory's TLS root as Caddy will read it (staging CAs). */
  acmeCaRootFile?: string | undefined;
  /** Caddy's PROXY-protocol `allow`: who may send PROXY headers (frpc). */
  proxyAllowCidr: string;
  /** host:port every name in the zone proxies to unless `upstreams` names its label. */
  appUpstream: string;
  /**
   * Per-label upstreams inside the zone: `{ api: "127.0.0.1:7540" }` sends
   * `api.<siteZone>` there and every other name (other labels, dashed LAN
   * names, vanity domains) to `appUpstream`.
   */
  upstreams?: Record<string, string> | undefined;
  vanityDomains: string[];
  askUrl: string;
  resolvers: string[];
  dns01: Dns01;
  /** Local listen ports; 443/80 unless the machine cannot bind them. */
  listen?: { https: number; http: number } | undefined;
  /**
   * Send the upstream's own host:port as the Host header instead of the
   * public name, for dev servers that check it (Vite's allowedHosts).
   */
  rewriteHostHeader?: boolean | undefined;
}

function port(value: number, what: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`invalid ${what}: ${JSON.stringify(value)}`);
  }
  return value;
}

/** Caddyfile quoted string: backslash and double quote escaped. */
function q(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error("newline in Caddyfile value");
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function token(value: string, what: string): string {
  if (!/^[A-Za-z0-9.:/_\-@+=]+$/.test(value)) {
    throw new Error(`invalid ${what}: ${JSON.stringify(value)}`);
  }
  return value;
}

export function renderCaddyfile(input: CaddyRenderInput): string {
  if (!isSiteId(input.siteId))
    throw new Error(`invalid siteId ${input.siteId}`);
  if (!isSiteZone(input.siteZone))
    throw new Error(`invalid siteZone ${input.siteZone}`);
  for (const v of input.vanityDomains) {
    if (!isWellFormedHostname(v) || v.includes("*"))
      throw new Error(`invalid vanity domain ${v}`);
  }
  if (input.resolvers.length === 0)
    throw new Error("at least one resolver is required");
  const wildcard = siteWildcard(input.siteZone);
  const upstream = token(input.appUpstream, "app upstream");
  const labelled = Object.entries(input.upstreams ?? {})
    .map(([label, target]) => {
      if (!LABEL_RE.test(label) || label !== label.toLowerCase()) {
        throw new Error(`invalid upstream label: ${JSON.stringify(label)}`);
      }
      return { label, target: token(target, `upstream for ${label}`) };
    })
    .sort((a, b) => (a.label < b.label ? -1 : 1));
  const allow = token(input.proxyAllowCidr, "PROXY allow CIDR");
  const resolvers = input.resolvers.map((r) => token(r, "resolver")).join(" ");

  const dns =
    input.dns01.mode === "rfc2136"
      ? `		dns rfc2136 {
			key_name ${q(input.dns01.keyName)}
			key_alg ${q(input.dns01.keyAlg)}
			key ${q(input.dns01.secret)}
			server ${q(input.dns01.server)}
		}`
      : `		dns acmedns {
			username ${q(input.dns01.username)}
			password ${q(input.dns01.password)}
			subdomain ${q(input.dns01.subdomain)}
			server_url ${q(input.dns01.serverUrl)}
		}`;

  /** One reverse_proxy directive at the given tab depth. */
  const proxy = (target: string, depth: number): string => {
    const t = "\t".repeat(depth);
    return input.rewriteHostHeader
      ? `${t}reverse_proxy ${target} {\n${t}\theader_up Host {upstream_hostport}\n${t}}`
      : `${t}reverse_proxy ${target}`;
  };

  const https = port(input.listen?.https ?? 443, "HTTPS port");
  const http = port(input.listen?.http ?? 80, "HTTP port");
  if (https === http) throw new Error("HTTPS and HTTP ports must differ");

  const globals = [
    `	email ${token(input.email, "email")}`,
    // Non-default ports: Caddy's automatic HTTPS (and its HTTP→HTTPS redirect)
    // then serves the site blocks there instead of 443/80.
    https !== 443 ? `	https_port ${https}` : "",
    http !== 80 ? `	http_port ${http}` : "",
    input.acmeCaUrl ? `	acme_ca ${token(input.acmeCaUrl, "ACME CA URL")}` : "",
    input.acmeCaRootFile
      ? // A local path, quoted: Windows paths carry backslashes and may carry
        // spaces, and Go accepts forward slashes on every platform.
        `	acme_ca_root ${q(input.acmeCaRootFile.replace(/\\/g, "/"))}`
      : "",
    `
	# PROXY protocol v2 from frpc only; plain LAN clients pass through unchanged
	# (ignore = a spoofed header from anyone else is parsed and discarded).
	servers :${https} {
		listener_wrappers {
			proxy_protocol {
				timeout 5s
				allow ${allow}
				fallback_policy ignore
			}
			tls
		}
	}`,
    input.vanityDomains.length > 0
      ? `
	# Vanity domains are issued on demand, only when the control plane approves the name.
	on_demand_tls {
		ask ${token(input.askUrl, "ask URL")}
	}`
      : "",
    `
	log {
		output stdout
		level INFO
	}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const vanity =
    input.vanityDomains.length > 0
      ? `
# Vanity domains (${input.vanityDomains.join(", ")}): validated by http-01 or
# tls-alpn-01 through the relay. No DNS config here, so those stay enabled.
https:// {
	tls {
		on_demand
	}
${proxy(upstream, 1)}
}
`
      : "";

  // With per-label upstreams the wildcard block routes by host: one matcher
  // per label, first match wins, and the bare `handle` takes everything else.
  const routing =
    labelled.length === 0
      ? proxy(upstream, 1)
      : [
          ...labelled.map(
            ({ label, target }) => `	@${label} host ${label}.${input.siteZone}
	handle @${label} {
${proxy(target, 2)}
	}`,
          ),
          `	handle {
${proxy(upstream, 2)}
	}`,
        ].join("\n");

  return `# Generated by @powerhousedao/portle for site ${input.siteId} (${input.siteZone}). Do not edit; the plugin rewrites it.
{
${globals}
}

# Wildcard only, never the zone apex: one certificate per site. DNS-01 is
# configured only inside this block so other challenge types stay available.
${wildcard} {
	tls {
${dns}
		resolvers ${resolvers}
		propagation_delay 2s
	}
${routing}
}
${vanity}`;
}

export function rfc2136Dns(
  keyName: string,
  secret: string,
  server: string,
  keyAlg = "hmac-sha256",
): Dns01 {
  return { mode: "rfc2136", keyName, keyAlg, secret, server };
}

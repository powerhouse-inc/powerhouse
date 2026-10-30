# @powerhousedao/portle

Publish a Powerhouse project through [Portle](https://portle.host), the
TLS-passthrough relay for sites that run on a machine behind NAT. EXPERIMENTAL.

The package is a switchboard host plugin. List it in the project's switchboard
host file and it is active; it takes no config:

```js
// hosts/switchboard/host.js
runner: {
  plugins: [
    "@powerhousedao/switchboard/plugins/mcp",
    "@powerhousedao/portle/switchboard",
  ],
},
```

## What runs where

Portle hosts the relay (frps), the authoritative DNS for every site zone and
the control plane. This plugin runs the site side on the machine next to the
switchboard: **frpc** keeps one outbound tunnel to the relay, **Caddy** holds
the private key and the wildcard certificate (obtained by DNS-01 through the
relay's DNS) and terminates TLS locally, forwarding `app.<zone>` to Connect and
`api.<zone>` to the Switchboard. The relay never decrypts anything.

## The publication gate

The plugin brings the tunnel up only for a host that is locked down, and only
for one of its admins. `portleReadiness` reports the gate check by check:

| Check | Passes when |
|---|---|
| `identity` | the host verifies bearer tokens (`RESOLVE_CALLER_IDENTITY`) |
| `floor` | anonymous callers are refused (`REQUIRE_AUTHENTICATED_CALLER`) |
| `policy` | the policy is `ADMIN_ONLY`, or `DOCUMENT_PERMISSIONS` with default protection |
| `protection` | under `DOCUMENT_PERMISSIONS`, `DEFAULT_PROTECTION` is on |
| `admins` | `ADMINS` lists at least one address |
| `caller` | the caller is one of those addresses |

Every failing check carries the setting to change. The report also carries
warnings no setting can clear, such as the project's own subgraphs having to
guard their resolvers themselves. The gate is judged on the host's resolved
settings, not on environment variable names, so a setting that is inert under
the active policy never counts.

It is an interlock, not security: what makes it meaningful is that the same
plugin owns the tunnel, so "published" implies "locked down" for as long as the
plugin is the thing publishing. At boot the tunnel comes back only when the
operator left it running **and** the host still passes the gate.

## The `portle` subgraph

Under an `OPEN` policy `portleReadiness` answers everyone (there is no admin to
tell apart) and everything else is refused. Under any other policy every field
is for listed admins only.

```graphql
query { portleReadiness { publishable checks { id ok detail fix } me { address isAdmin } } }
query { portleStatus { enrolled siteZone delegation { zone nameservers } settings { upstreams { label target } autostart } binaries { frpc caddy } tunnel { state frpc { running pid restarts } caddy { running } } urls } }

mutation { portleEnrol(controlPlaneUrl: "https://cp.portle.host", token: "…") { siteZone delegation { nameservers } } }
mutation { portleConfigure(appUpstream: "127.0.0.1:2540", upstreams: [{ label: "api", target: "127.0.0.1:7540" }]) { urls } }
mutation { portleStart { tunnel { state } } }   # refused unless every readiness check passes for the caller
mutation { portleStop { tunnel { state } } }
```

## On disk

Everything lives under the project's `.ph/portle/`: `enrollment.json` (the
site's identity and secrets, mode 600), `site.json` (the operator's choices and
`autostart`), the rendered `frpc.toml`, `Caddyfile` and `certs/`, Caddy's data
directory `caddy/` (the certificate, which must persist) and `logs/`.

The two executables are looked up in this order: `PORTLE_FRPC_BIN` /
`PORTLE_CADDY_BIN`, then `~/.ph/portle/bin/`, then the PATH. The Caddy must
be Portle's build with the `rfc2136` and `acmedns` DNS modules; a stock Caddy
starts but cannot obtain the certificate. Fetching them from the control
plane's release endpoint is the next step.

## For a customer zone

The zone (`dev.example.com`) must be delegated to the relay's nameservers
before Caddy's first start, or the CA caches a negative answer for an hour.
`portleStatus.delegation` names the records to create. The relay's site agent
waits for the delegation on its own; this plugin reports it and the studio
UI will poll it.

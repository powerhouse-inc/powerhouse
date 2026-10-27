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

## What it does today

It mounts the `portle` subgraph with one query, `portleReadiness`, which
reports the **publication gate** check by check:

| Check | Passes when |
|---|---|
| `identity` | the host verifies bearer tokens (`RESOLVE_CALLER_IDENTITY`) |
| `floor` | anonymous callers are refused (`REQUIRE_AUTHENTICATED_CALLER`) |
| `policy` | the policy is `ADMIN_ONLY`, or `DOCUMENT_PERMISSIONS` with default protection |
| `protection` | under `DOCUMENT_PERMISSIONS`, `DEFAULT_PROTECTION` is on |
| `admins` | `ADMINS` lists at least one address |
| `caller` | the caller is one of those addresses |

Every check carries the setting to change when it fails. The report also
carries warnings that no setting can clear, such as the project's own
subgraphs having to guard their resolvers themselves.

The gate is judged on the host's resolved authorization settings, not on
environment variable names, so a setting that is inert under the active
policy never counts for or against.

Under an `OPEN` policy the query answers everyone (there is no admin to tell
apart); under any other policy only a listed admin may ask.

## What follows

Enrolment with the relay, and the site tunnel (frpc and Caddy under the
plugin's supervision) that comes up only while the gate passes. See the plan
in the Powerhouse workspace.

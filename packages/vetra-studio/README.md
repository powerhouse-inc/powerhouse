# @powerhousedao/vetra-studio

Vetra Studio as host plugins, composed onto a project's switchboard and
Connect by the `vetra` host (verb `dev`):

- `@powerhousedao/vetra-studio/switchboard` turns on dev mode (Vite-loaded
  local document models with HMR) and serves studio sign-in.
- `@powerhousedao/vetra-studio/connect` turns on Connect's studio mode and runs
  studio sign-in in the browser. Its browser code lives in Connect
  (`apps/connect/src/plugins/vetra-studio*`); this module is the plugin's
  server-resolvable identity.

## Studio sign-in: logging an agent's browser in with an access token

An agent (Playwright, a test run) signs the studio Connect in without a wallet:

```sh
TOKEN=$(ph access-token --expiry 2h)   # in the project directory
# open in the agent's browser:
#   http://localhost:<connect port>/#studio-sign-in=$TOKEN
```

The page sends the bearer to the studio switchboard (`/graphql` on its own
origin, which the studio proxies), receives the studio's Renown identity, the
project's CLI key pair and the user `ph login` delegated it to, installs the key
pair as the browser's Renown key and reloads with `?user=<did>`. Connect then
logs in the normal way: a full Renown session, bearers and signed actions
included, as the studio's user.

- `#studio-sign-in=<token>&switchboard=<graphql url>` names the switchboard
  when the studio does not proxy it.
- `#studio-sign-out` drops the installed key pair and the session.
- The bearer travels in the URL fragment, so it reaches no server log, and the
  page removes it from the address bar first.

The switchboard answers `studioSignIn` only on a studio (dev verb) host, to a
bearer whose address is a listed admin (`AUTH_ENABLED=true`, address in
`ADMINS`), and only when the studio has a signed-in identity (`ph login`).

The browser then holds the project's CLI private key: use it in agent
profiles, and sign out when done. Browser and studio share one key, so a grant
the host holds by key covers the agent's browser too.

# @powerhousedao/vetra-studio

Vetra Studio as host plugins, composed onto a project's switchboard and
Connect by the `vetra` host (verb `dev`):

- `@powerhousedao/vetra-studio/switchboard` turns on dev mode (Vite-loaded
  local document models with HMR).
- `@powerhousedao/vetra-studio/connect` turns on Connect's studio mode. Its
  browser code lives in Connect (`apps/connect/src/plugins/vetra-studio.ts`);
  this module is the plugin's server-resolvable identity.

## Signing the Studio's tab in

The Studio's Connect signs its tab in by link: `ph vetra` prints
`Sign in: <url>#ph-sign-in=<code>` and opens it. The page exchanges the
one-time code at the loopback endpoint of the server that serves it for a
credential that names the tab's own session key, signed by the person's
identity on this computer (their pseudonym). The key never reaches the
browser. A second `ph vetra` prints a fresh link; `#ph-sign-out` drops the
tab's sign-in.

An agent's browser (Playwright) signs in the same way: read the link from the
Studio's output, or mint a code from the secret in the stack's run record
(`signInLinksOf` in `@powerhousedao/host-core`).

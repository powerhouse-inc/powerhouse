# @powerhousedao/devtools

DevTools for Powerhouse projects: a dock over the running app that shows the project's document
models, editors, drive apps, subgraphs and processors, as its code has them.

DevTools is for development only. It is a dev-server plugin: only a dev server loads it, and
nothing a build resolves refers to it. The design is in
[ADR 0009](../../docs/adr/0009-devtools.md).

## Connect dev servers

`ph vetra`, `ph connect studio` and `ph run <host> dev` load DevTools as a default dev-server
plugin. A project changes nothing.

To turn it off for one run, set `PH_DEVTOOLS=0`. It is also off under `NODE_ENV=production`. To
turn it off for a host, add this to its `host.js`:

```js
runner: {
  devPlugins: [{ module: "@powerhousedao/devtools/connect", enabled: false }],
}
```

## A Connect project with its own Vite config

Add DevTools' Vite plugin. It applies to the dev server only.

```ts
import { getConnectBaseViteConfig } from "@powerhousedao/builder-tools";
import { devtoolsVitePlugin } from "@powerhousedao/devtools/server";
import { defineConfig, mergeConfig } from "vite";

export default defineConfig(({ mode }) =>
  mergeConfig(getConnectBaseViteConfig({ mode, dirname: import.meta.dirname }), {
    plugins: [devtoolsVitePlugin({ client: "connect" })],
  }),
);
```

## Any other dev server

The server answers the API and puts a tag in the page. The page mounts DevTools.

On the server, in development only:

```ts
import { createDevtoolsServer } from "@powerhousedao/devtools/server";

const { handler, tokenTag } = createDevtoolsServer({ projectRoot: process.cwd() });
// 1. Run `handler(req, res, next)` ahead of the app's own routes.
// 2. Put `tokenTag` in the <head> of every page.
```

DevTools reads the project itself. A server that knows more of the run passes it: `appUrl` for
where the app answers, and `run` for the tool that started it and the addresses of its other
services.

In the page:

```ts
if (import.meta.env.DEV) {
  const { mountDevtools } = await import("@powerhousedao/devtools/mount");
  mountDevtools();
}
```

A Vite app that is not Connect uses `devtoolsVitePlugin()` from
`@powerhousedao/devtools/server` in place of both steps. The plugin's own module mounts DevTools
before the app's code runs.

A page has one DevTools. A second `mountDevtools(options)` lays its options over the one that is
mounted and returns the same handle, so an app passes its `target`, `appSource` or `app` whenever
its code runs.

`mountDevtools` renders in a shadow root with its own stylesheet and its own React, so the page
needs neither React nor Tailwind, and the two sides' styles do not mix. It does nothing on a page
without the tag.

On a page of a Powerhouse app, DevTools reads what the app knows from `window.ph`: the modules it
has loaded, its notifications and its router. Another kind of app gives its own `appSource`, or
passes `app` and later changes through the `update` of the handle.

The API answers only a browser on the same machine, on the origin that served the page. Behind a
forwarded port, a proxy or a tunnel, in a container, or on a page loaded from `file://`, DevTools
shows without project data. A page the Vite plugin sends to another machine has no DevTools.

## Writing another dev-server plugin

A dev-server plugin is a module that default-exports a host plugin with a `devServer` hook. The
hook gets the project's folder and what the CLI knows of the run, and returns Vite plugins.

```ts
import type { ConnectDevPlugin } from "@powerhousedao/host-core";
import type { Plugin } from "vite";

const inspector: ConnectDevPlugin<Plugin> = {
  name: "inspector",
  appliesTo: "connect",
  hooks: {
    devServer: ({ projectRoot, run }) => [inspectorVitePlugin({ projectRoot, run })],
  },
};

export default inspector;
```

A host lists it in `runner.devPlugins`. The CLI keeps every Vite plugin the hook returns to a dev
server, so nothing it adds reaches a build. This package's own plugin, in `src/connect/`, is the
example to follow.

## Entries

| Entry | For |
| --- | --- |
| `./connect` | The dev-server plugin of a Connect host |
| `./server` | `devtoolsVitePlugin`, `createDevtoolsServer`, `createDevtoolsApiHandler`, `createProjectReader` and the API's types |
| `./mount` | `mountDevtools`, self-contained |

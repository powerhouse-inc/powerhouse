import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { build, createLogger, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APP_SHELLS_FILE,
  appShellVariant,
  appShellVariantOf,
  connectAppShellPlugin,
  injectAppShell,
  readShellPlugins,
  SHELL_PLUGINS_FILE,
  swapAppShell,
  withShellAppName,
  type AppShells,
  type ShellPlugins,
} from "./app-shell.js";

const shell = {
  body: `<div data-ph-shell style="display:contents"><div class="h-screen"></div></div>`,
  head: `<style data-ph-shell>.h-screen{height:100vh}</style>`,
};

// A plugin Connect ships a shell for, as its manifest declares it.
const SHELL_PLUGIN = "@acme/connect-shell/plugin";
const manifest: ShellPlugins = { [SHELL_PLUGIN]: "generic" };

const NAME = "<!--ph-shell:app-name-->Connect<!--/ph-shell:app-name-->";

const html = [
  `<!doctype html><html><head>`,
  `<link rel="stylesheet" crossorigin href="/assets/index-abc.css">`,
  `</head><body><div id="root"></div></body></html>`,
].join("");

describe("injectAppShell", () => {
  it("fills #root, inlines the critical CSS and defers the stylesheet", () => {
    const out = injectAppShell(html, shell);
    expect(out).toContain(`<div id="root">`);
    expect(out).toMatch(/<div id="root"><!--ph-shell:body-->.*<\/div><\/div>/);
    expect(out).toContain(shell.body);
    // Ahead of the stylesheet, so the full CSS wins equal-specificity rules.
    expect(out.indexOf(shell.head)).toBeGreaterThan(0);
    expect(out.indexOf(shell.head)).toBeLessThan(out.indexOf("index-abc.css"));
    expect(out).toContain(
      `<link rel="preload" as="style" crossorigin href="/assets/index-abc.css" onload="this.onload=null;this.rel='stylesheet'">`,
    );
    expect(out).toContain(
      `<noscript><link rel="stylesheet" crossorigin href="/assets/index-abc.css"></noscript>`,
    );
  });

  it("keeps the stylesheets blocking when asked", () => {
    const out = injectAppShell(html, shell, "/", { deferStyles: false });
    expect(out).toContain(shell.body);
    expect(out).toContain(
      `<link rel="stylesheet" crossorigin href="/assets/index-abc.css">`,
    );
    expect(out).not.toContain("preload");
  });

  it("applies once and leaves a page without an empty root alone", () => {
    const once = injectAppShell(html, shell);
    expect(injectAppShell(once, shell)).toBe(once);
    const filled = html.replace(
      `<div id="root"></div>`,
      `<div id="root">x</div>`,
    );
    expect(injectAppShell(filled, shell)).toBe(filled);
  });
});

const generic = {
  body: `<div data-ph-shell="generic"><a href="/settings">G</a><nav id="sidebar"></nav></div>`,
  head: `<style data-ph-shell="generic">#sidebar{}</style><script data-ph-shell="generic"></script>`,
};
const core = {
  body: `<div data-ph-shell="core"><header><a href="/"><!--ph-shell:app-name-->Connect<!--/ph-shell:app-name--></a><a href="/settings">C</a></header></div>`,
  head: `<style data-ph-shell="core">header{}</style><script data-ph-shell="core"></script>`,
};

describe("the shell variants", () => {
  it("picks the shell of the composition's first plugin that has one, else core's", () => {
    expect(appShellVariant([{ module: SHELL_PLUGIN }], manifest)).toBe(
      "generic",
    );
    expect(
      appShellVariant(
        [{ module: "./plugins/mine.js" }, { module: SHELL_PLUGIN }],
        manifest,
      ),
    ).toBe("generic");
    expect(appShellVariant([], manifest)).toBe("core");
    expect(appShellVariant([{ module: "./plugins/mine.js" }], manifest)).toBe(
      "core",
    );
    expect(appShellVariant([{ module: "constructor" }], manifest)).toBe("core");
    const both: ShellPlugins = { "./a.js": "core", [SHELL_PLUGIN]: "generic" };
    expect(
      appShellVariant([{ module: SHELL_PLUGIN }, { module: "./a.js" }], both),
    ).toBe("generic");
  });

  it("picks any manifest plugin's shell for no composition, as every built-in is active", () => {
    expect(appShellVariant(undefined, manifest)).toBe("generic");
    expect(appShellVariant(null, manifest)).toBe("generic");
    expect(appShellVariant(undefined, {})).toBe("core");
  });

  it("without a manifest, picks core for a composition and generic for none", () => {
    expect(appShellVariant(undefined, undefined)).toBe("generic");
    expect(appShellVariant([{ module: SHELL_PLUGIN }], undefined)).toBe("core");
    expect(appShellVariant([], undefined)).toBe("core");
  });

  it("swaps one variant for the other, rebased, and back", () => {
    const withGeneric = injectAppShell(html, generic, "/connect/");
    expect(appShellVariantOf(withGeneric)).toBe("generic");
    const withCore = swapAppShell(withGeneric, core, "/connect/");
    expect(appShellVariantOf(withCore)).toBe("core");
    expect(withCore).toContain(`<a href="/connect/settings">C</a>`);
    expect(withCore).not.toContain("sidebar");
    // The deferred stylesheet and the recovery script stay as they were.
    expect(withCore).toContain(`rel="preload" as="style"`);
    expect(withCore).toContain("data-ph-boot-recover");
    expect(swapAppShell(withCore, generic, "/connect/")).toBe(withGeneric);
  });

  it("leaves a page without a shell alone", () => {
    expect(appShellVariantOf(html)).toBeUndefined();
    expect(swapAppShell(html, core)).toBe(html);
  });
});

// A project whose installed Connect ships both shells. Inside cwd: Vite's
// build-html rejects an index.html outside it (see pwa.e2e.test.ts).
let root: string;
beforeAll(() => {
  root = mkdtempSync(join(process.cwd(), "node_modules", ".app-shell-"));
  const connect = join(root, "node_modules/@powerhousedao/connect");
  mkdirSync(join(connect, "dist"), { recursive: true });
  writeFileSync(
    join(connect, "package.json"),
    `{"name":"@powerhousedao/connect"}`,
  );
  writeFileSync(join(connect, "dist/shell.html"), generic.body);
  writeFileSync(join(connect, "dist/shell-head.html"), generic.head);
  writeFileSync(join(connect, "dist/shell-core.html"), core.body);
  writeFileSync(join(connect, "dist/shell-core-head.html"), core.head);
  writeFileSync(
    join(connect, "dist", SHELL_PLUGINS_FILE),
    JSON.stringify(manifest),
  );
  writeFileSync(
    join(root, "index.html"),
    `<!doctype html><html><head></head><body><div id="root"></div><script type="module" src="/main.js"></script></body></html>`,
  );
  writeFileSync(join(root, "main.js"), `console.log("app");`);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function buildWith(composition?: { module: string }[], appName?: string) {
  const outDir = join(
    root,
    `dist-${composition ? composition.length : "none"}-${appName ?? ""}`,
  );
  await build({
    root,
    logLevel: "silent",
    build: { outDir, emptyOutDir: true },
    plugins: [connectAppShellPlugin(root, { composition, appName })],
  });
  return {
    html: readFileSync(join(outDir, "index.html"), "utf8"),
    shells: JSON.parse(
      readFileSync(join(outDir, APP_SHELLS_FILE), "utf8"),
    ) as AppShells,
    plugins: existsSync(join(outDir, SHELL_PLUGINS_FILE))
      ? (JSON.parse(
          readFileSync(join(outDir, SHELL_PLUGINS_FILE), "utf8"),
        ) as ShellPlugins)
      : undefined,
  };
}

async function devIndex(composition?: { module: string }[], appName?: string) {
  const server = await createServer({
    root,
    logLevel: "silent",
    server: { middlewareMode: true, ws: false },
    plugins: [connectAppShellPlugin(root, { composition, appName })],
  });
  try {
    return await server.transformIndexHtml(
      "/",
      readFileSync(join(root, "index.html"), "utf8"),
    );
  } finally {
    await server.close();
  }
}

describe("connectAppShellPlugin", () => {
  it("builds the composition's shell into index.html and ships both", async () => {
    const classic = await buildWith();
    expect(appShellVariantOf(classic.html)).toBe("generic");
    expect(classic.shells).toEqual({ generic, core });

    expect(classic.plugins).toEqual(manifest);

    const withGeneric = await buildWith([{ module: SHELL_PLUGIN }]);
    expect(appShellVariantOf(withGeneric.html)).toBe("generic");

    const coreOnly = await buildWith([]);
    expect(appShellVariantOf(coreOnly.html)).toBe("core");
    expect(coreOnly.html).toContain("<header>");
    expect(coreOnly.html).not.toContain("sidebar");
  });

  it("builds without the manifest of an older Connect: core for a composition, generic for none", async () => {
    const file = join(
      root,
      "node_modules/@powerhousedao/connect/dist",
      SHELL_PLUGINS_FILE,
    );
    rmSync(file);
    try {
      expect(readShellPlugins(root)).toBeUndefined();
      const classic = await buildWith();
      expect(appShellVariantOf(classic.html)).toBe("generic");
      expect(classic.plugins).toBeUndefined();
      const declared = await buildWith([{ module: SHELL_PLUGIN }]);
      expect(appShellVariantOf(declared.html)).toBe("core");
    } finally {
      writeFileSync(file, JSON.stringify(manifest));
    }
    expect(readShellPlugins(root)).toEqual(manifest);
  });

  it("injects core's shell in dev for a core-only composition, and none otherwise", async () => {
    const coreOnly = await devIndex([{ module: "./plugins/mine.js" }]);
    expect(appShellVariantOf(coreOnly)).toBe("core");
    expect(coreOnly).toContain("data-ph-boot-recover");

    expect(appShellVariantOf(await devIndex())).toBeUndefined();
    expect(
      appShellVariantOf(await devIndex([{ module: SHELL_PLUGIN }])),
    ).toBeUndefined();
  });

  it("titles core's shell with the served app name, as the app does", async () => {
    const named = await buildWith([], "Acme <Docs>");
    expect(named.html).toContain(
      "<!--ph-shell:app-name-->Acme &lt;Docs&gt;<!--/ph-shell:app-name-->",
    );
    // No branding name: the app's own fallback.
    const unnamed = await buildWith([], "");
    expect(unnamed.html).toContain(NAME);
    expect(await devIndex([], "Acme")).toContain(
      "<!--ph-shell:app-name-->Acme<!--/ph-shell:app-name-->",
    );
  });

  it("renders a project's shells from its routes and stylesheet, in build and dev", async () => {
    // Connect's renderer: each variant's nav, and the stylesheet it was given.
    const connect = join(root, "node_modules/@powerhousedao/connect");
    writeFileSync(
      join(connect, "package.json"),
      `{"name":"@powerhousedao/connect","exports":{"./prerender":"./prerender.js","./package.json":"./package.json"}}`,
    );
    writeFileSync(
      join(connect, "prerender.js"),
      `import { readFileSync } from "node:fs";
      export async function renderProjectShells(stylesheet) {
        const css = readFileSync(stylesheet, "utf8");
        const shell = (v) => ({
          body: \`<div data-ph-shell="\${v}"><nav class="acme"><!--ph-shell:app-name--><!--/ph-shell:app-name--></nav></div>\`,
          head: \`<style data-ph-shell="\${v}">\${css.includes(".acme") ? ".acme{color:red}" : ""}</style>\`,
        });
        return { generic: shell("generic"), core: shell("core") };
      }`,
    );
    writeFileSync(join(root, "style.css"), `.acme{color:red}`);
    const routeAliases = [{ find: /^never$/, replacement: "never" }];
    try {
      const outDir = join(root, "dist-routes");
      await build({
        root,
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
        plugins: [
          connectAppShellPlugin(root, {
            composition: [],
            appName: "Acme",
            routeAliases,
          }),
        ],
      });
      const html = readFileSync(join(outDir, "index.html"), "utf8");
      expect(appShellVariantOf(html)).toBe("core");
      expect(html).toContain(
        `<nav class="acme"><!--ph-shell:app-name-->Acme<!--/ph-shell:app-name--></nav>`,
      );
      expect(html).toContain(`.acme{color:red}</style>`);
      const shells = JSON.parse(
        readFileSync(join(outDir, APP_SHELLS_FILE), "utf8"),
      ) as AppShells;
      expect(Object.keys(shells).sort()).toEqual(["core", "generic"]);

      const server = await createServer({
        root,
        logLevel: "silent",
        server: { middlewareMode: true, ws: false },
        plugins: [
          connectAppShellPlugin(root, { composition: [], routeAliases }),
        ],
      });
      try {
        // The project's core shell, never Connect's prebuilt one.
        const dev = await server.transformIndexHtml(
          "/",
          readFileSync(join(root, "index.html"), "utf8"),
        );
        expect(appShellVariantOf(dev)).toBe("core");
        expect(dev).toContain(`<nav class="acme">`);
      } finally {
        await server.close();
      }
    } finally {
      writeFileSync(
        join(connect, "package.json"),
        `{"name":"@powerhousedao/connect"}`,
      );
      rmSync(join(root, "style.css"));
    }
  });

  it("shows a shell that fails to render on the dev page and logs it as an error, as the build fails on it", async () => {
    const connect = join(root, "node_modules/@powerhousedao/connect");
    writeFileSync(
      join(connect, "package.json"),
      `{"name":"@powerhousedao/connect","exports":{"./prerender":"./prerender.js","./package.json":"./package.json"}}`,
    );
    writeFileSync(
      join(connect, "prerender.js"),
      `export async function renderProjectShells() {
        throw new Error("window is not defined </script>");
      }`,
    );
    writeFileSync(join(root, "style.css"), "");
    const errors: string[] = [];
    const logger = createLogger("silent");
    logger.error = (message) => void errors.push(message);
    const server = await createServer({
      root,
      customLogger: logger,
      server: { middlewareMode: true, ws: false },
      plugins: [
        connectAppShellPlugin(root, {
          composition: [],
          routeAliases: [{ find: /^never$/, replacement: "never" }],
        }),
      ],
    });
    try {
      const dev = await server.transformIndexHtml(
        "/",
        readFileSync(join(root, "index.html"), "utf8"),
      );
      expect(dev).toContain(`import { ErrorOverlay } from "/@vite/client"`);
      expect(dev).toContain("the build will fail on it");
      // The message can't close the script it's in.
      expect(dev).toContain("window is not defined \\u003c/script>");
      expect(errors).toEqual([
        expect.stringContaining(
          "[connect] The loading shell failed to render from the project's routes",
        ),
      ]);
    } finally {
      await server.close();
      writeFileSync(
        join(connect, "package.json"),
        `{"name":"@powerhousedao/connect"}`,
      );
      rmSync(join(connect, "prerender.js"), { force: true });
      rmSync(join(root, "style.css"));
    }
  });

  it("renders a project's shells with Connect's installed packages, whose code reads import.meta.env, in build and dev", async () => {
    // As npm installs them: core in node_modules, and Connect's subpaths
    // reached by bare specifier, which the renderer's server would hand to
    // Node, where import.meta.env is undefined.
    const connect = join(root, "node_modules/@powerhousedao/connect");
    const core = join(root, "node_modules/@powerhousedao/connect-core");
    mkdirSync(core, { recursive: true });
    writeFileSync(
      join(core, "package.json"),
      `{"name":"@powerhousedao/connect-core","type":"module","exports":{"./runtime-config":"./runtime-config.js"}}`,
    );
    writeFileSync(
      join(core, "runtime-config.js"),
      `export const configPath = () => \`\${import.meta.env.BASE_URL}powerhouse.config.json\`;`,
    );
    writeFileSync(
      join(connect, "package.json"),
      `{"name":"@powerhousedao/connect","type":"module","exports":{"./prerender":"./prerender.js","./env":"./env.js","./package.json":"./package.json"}}`,
    );
    writeFileSync(
      join(connect, "env.js"),
      `export const mode = () => import.meta.env.MODE;`,
    );
    writeFileSync(
      join(connect, "prerender.js"),
      `import { configPath } from "@powerhousedao/connect-core/runtime-config";
      import { mode } from "@powerhousedao/connect/env";
      export async function renderProjectShells() {
        const shell = (v) => ({
          body: \`<div data-ph-shell="\${v}"><nav data-config="\${configPath()}" data-mode="\${mode()}"></nav></div>\`,
          head: \`<style data-ph-shell="\${v}"></style>\`,
        });
        return { generic: shell("generic"), core: shell("core") };
      }`,
    );
    writeFileSync(join(root, "style.css"), "");
    const routeAliases = [{ find: /^never$/, replacement: "never" }];
    const rendered = `<nav data-config="/powerhouse.config.json" data-mode="`;
    try {
      const outDir = join(root, "dist-installed");
      await build({
        root,
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
        plugins: [
          connectAppShellPlugin(root, { composition: [], routeAliases }),
        ],
      });
      expect(readFileSync(join(outDir, "index.html"), "utf8")).toContain(
        rendered,
      );

      // Studio renders through the same server; a failure there only warns.
      const server = await createServer({
        root,
        logLevel: "silent",
        server: { middlewareMode: true, ws: false },
        plugins: [
          connectAppShellPlugin(root, { composition: [], routeAliases }),
        ],
      });
      try {
        const dev = await server.transformIndexHtml(
          "/",
          readFileSync(join(root, "index.html"), "utf8"),
        );
        expect(dev).toContain(rendered);
      } finally {
        await server.close();
      }
    } finally {
      writeFileSync(
        join(connect, "package.json"),
        `{"name":"@powerhousedao/connect"}`,
      );
      rmSync(join(connect, "prerender.js"), { force: true });
      rmSync(join(connect, "env.js"), { force: true });
      rmSync(core, { recursive: true, force: true });
      rmSync(join(root, "style.css"));
    }
  });
});

describe("the shell's app name", () => {
  it("is filled in on a swap, with the app's fallback", () => {
    const withGeneric = injectAppShell(html, generic);
    expect(swapAppShell(withGeneric, core, "/", "Acme")).toContain(
      "<!--ph-shell:app-name-->Acme<!--/ph-shell:app-name-->",
    );
    const unnamed = swapAppShell(withGeneric, core);
    expect(unnamed).toContain(NAME);
    expect(withShellAppName(unnamed, "Beta")).toContain(
      "<!--ph-shell:app-name-->Beta<!--/ph-shell:app-name-->",
    );
  });
});

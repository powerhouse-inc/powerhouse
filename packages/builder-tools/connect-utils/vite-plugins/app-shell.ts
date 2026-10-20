import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Alias, Plugin, ResolvedConfig } from "vite";
import { createServer } from "vite";
import { resolvePackage } from "../helpers.js";

/** On the prerendered shell's elements; marks an index.html that has it. */
export const APP_SHELL_MARKER = "data-ph-shell";

export type AppShell = {
  /** `#root`'s markup. */
  body: string;
  /** Critical CSS and the pre-paint guard, for `<head>`. */
  head: string;
};

/** `generic`: Connect's chrome. `core`: core's views, for a composition without the generic plugin. */
export type AppShellVariant = "generic" | "core";

export type AppShells = Partial<Record<AppShellVariant, AppShell>>;

/** The plugin whose presence in a composition picks Connect's chrome. */
export const GENERIC_PLUGIN_MODULE = "@powerhousedao/connect/plugins/generic";

/** In a project's dist: every variant, for a server that swaps the shell to the served composition. */
export const APP_SHELLS_FILE = "app-shells.json";

const SHELL_FILES: Record<AppShellVariant, string> = {
  generic: "shell",
  core: "shell-core",
};

/** Core's shell for a declared composition without the generic plugin; no composition is classic. */
export function appShellVariant(
  composition: readonly { module: string }[] | null | undefined,
): AppShellVariant {
  if (!composition) return "generic";
  return composition.some((entry) => entry.module === GENERIC_PLUGIN_MODULE)
    ? "generic"
    : "core";
}

/** The shell Connect's build prerendered, if the installed Connect ships one. */
export function readAppShell(
  projectRoot: string,
  variant: AppShellVariant = "generic",
): AppShell | undefined {
  let distDir: string;
  try {
    distDir = join(
      dirname(
        resolvePackage("@powerhousedao/connect/package.json", projectRoot),
      ),
      "dist",
    );
  } catch {
    return undefined;
  }
  const body = join(distDir, `${SHELL_FILES[variant]}.html`);
  const head = join(distDir, `${SHELL_FILES[variant]}-head.html`);
  if (!existsSync(body) || !existsSync(head)) return undefined;
  return {
    body: readFileSync(body, "utf8"),
    head: readFileSync(head, "utf8"),
  };
}

/** Every variant the installed Connect ships. */
export function readAppShells(projectRoot: string): AppShells {
  const shells: AppShells = {};
  for (const variant of Object.keys(SHELL_FILES) as AppShellVariant[]) {
    const shell = readAppShell(projectRoot, variant);
    if (shell) shells[variant] = shell;
  }
  return shells;
}

/** On the boot-recovery script; its sessionStorage key guards against reload loops. */
export const BOOT_RECOVER_MARKER = "data-ph-boot-recover";
export const BOOT_RECOVER_KEY = "ph:sw-recover";

// Until the app releases the shell (its <style data-ph-shell> goes), a module
// failure or a stall with a new service worker pending activates it and reloads once.
export const BOOT_RECOVER_SCRIPT =
  `(function(){try{` +
  `var K='${BOOT_RECOVER_KEY}',n=navigator.serviceWorker,done=0;` +
  `if(!n||sessionStorage.getItem(K))return;` +
  `var up=function(){return !document.querySelector('style[${APP_SHELL_MARKER}]')};` +
  `var reload=function(){location.reload()};` +
  `var skip=function(w){try{sessionStorage.setItem(K,'1')}catch(e){}` +
  `n.addEventListener('controllerchange',reload);` +
  `w.postMessage({type:'SKIP_WAITING'});setTimeout(reload,3000)};` +
  `var watch=function(w){w.addEventListener('statechange',function(){if(w.state==='installed')skip(w)})};` +
  `var go=function(){if(done||up())return;done=1;` +
  `n.getRegistration().then(function(r){if(!r)return;` +
  `if(r.waiting)return skip(r.waiting);` +
  `if(r.installing)return watch(r.installing);` +
  `r.addEventListener('updatefound',function(){if(r.installing)watch(r.installing)});` +
  `return r.update()}).catch(function(){})};` +
  `addEventListener('error',function(e){var t=e.target;` +
  `if(e.error instanceof SyntaxError||e.error instanceof TypeError||(t&&t.tagName==='SCRIPT'))go()},true);` +
  `addEventListener('unhandledrejection',function(e){` +
  `if(e.reason instanceof SyntaxError||e.reason instanceof TypeError)go()});` +
  `setTimeout(go,8000)` +
  `}catch(e){}})();`;

/** Prefixes the shell's root-relative links with the deploy base. */
export function rebaseShellLinks(body: string, base: string) {
  if (base === "/" || !base) return body;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return body.replace(/(\shref=")\/(?!\/)/g, `$1${prefix}`);
}

const STYLESHEET_LINK = /<link\b(?=[^>]*\brel=["']?stylesheet\b)[^>]*>/gi;

// Loads a stylesheet without blocking paint; the inline critical CSS covers the shell.
function deferStylesheet(link: string) {
  const preload = link
    .replace(/\brel=["']?stylesheet["']?/i, 'rel="preload" as="style"')
    .replace(/\/?>$/, ` onload="this.onload=null;this.rel='stylesheet'">`);
  return `${preload}<noscript>${link}</noscript>`;
}

// The shell's two regions, delimited so a server can swap them for another variant.
const region = (name: "head" | "body", content: string) =>
  `<!--ph-shell:${name}-->${content}<!--/ph-shell:${name}-->`;
const REGION = (name: "head" | "body") =>
  new RegExp(`<!--ph-shell:${name}-->[\\s\\S]*?<!--/ph-shell:${name}-->`);

/** The app's title without `connect.branding.appName`; core's `appTitle` fallback. */
export const DEFAULT_APP_NAME = "Connect";

const APP_NAME =
  /(<!--ph-shell:app-name-->)[\s\S]*?(<!--\/ph-shell:app-name-->)/g;

const escapeHtml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** Fills the shell's app name as the app resolves it: the branding name, else the default. */
export function withShellAppName(html: string, appName: string | undefined) {
  const name = escapeHtml(appName || DEFAULT_APP_NAME);
  return html.replace(APP_NAME, (_m, open: string, close: string) =>
    [open, name, close].join(""),
  );
}

/** Inlines `shell` into an empty `#root`, adds its critical CSS and, unless
 * `deferStyles` is false, defers the stylesheets; React replaces the markup when the app renders. */
export function injectAppShell(
  html: string,
  shell: AppShell,
  base = "/",
  {
    deferStyles = true,
    appName,
  }: { deferStyles?: boolean; appName?: string } = {},
) {
  if (html.includes(APP_SHELL_MARKER)) return html;
  const root = /<div id="root"><\/div>/;
  if (!root.test(html)) return html;
  // Before the stylesheets, so equal-specificity rules in the full CSS win.
  const firstSheet = html.search(STYLESHEET_LINK);
  const at = firstSheet >= 0 ? firstSheet : html.indexOf("</head>");
  const recover = `<script ${BOOT_RECOVER_MARKER}>${BOOT_RECOVER_SCRIPT}</script>`;
  const body = withShellAppName(rebaseShellLinks(shell.body, base), appName);
  const withHead =
    html.slice(0, at) + region("head", shell.head) + recover + html.slice(at);
  return (
    deferStyles ? withHead.replace(STYLESHEET_LINK, deferStylesheet) : withHead
  ).replace(root, () => `<div id="root">${region("body", body)}</div>`);
}

/** The variant an index.html carries, from its shell's marker value. */
export function appShellVariantOf(html: string): AppShellVariant | undefined {
  const head = REGION("head").exec(html)?.[0];
  const value = head && new RegExp(`${APP_SHELL_MARKER}="(\\w+)"`).exec(head);
  if (!value) return undefined;
  return value[1] === "core" ? "core" : "generic";
}

/** Replaces the shell an index.html carries with `shell`, titled `appName`; a page without one is unchanged. */
export function swapAppShell(
  html: string,
  shell: AppShell,
  base = "/",
  appName?: string,
) {
  if (!REGION("head").test(html) || !REGION("body").test(html)) return html;
  const body = withShellAppName(rebaseShellLinks(shell.body, base), appName);
  return html
    .replace(REGION("head"), () => region("head", shell.head))
    .replace(REGION("body"), () => region("body", body));
}

export type ConnectAppShellOptions = {
  /** The composition the app boots with; picks the variant. */
  composition?: readonly { module: string }[] | null;
  /** The served `connect.branding.appName`. */
  appName?: string;
  /** With the project's routes: the aliases that point Connect at its tree. */
  routeAliases?: Alias[];
};

type ShellRenderer = {
  renderProjectShells: (stylesheet: string) => Promise<AppShells>;
};

// Connect's renderer, loaded through Vite with the project's aliases, so it
// renders the project's route tree; its route files are TSX.
async function renderProjectAppShells(
  projectRoot: string,
  config: ResolvedConfig,
  routeAliases: Alias[],
): Promise<AppShells> {
  const server = await createServer({
    configFile: false,
    root: projectRoot,
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, ws: false },
    plugins: [react()],
    resolve: {
      alias: routeAliases,
      dedupe: config.resolve.dedupe,
      tsconfigPaths: true,
    },
    define: config.define,
  });
  try {
    const renderer = (await server.ssrLoadModule(
      "@powerhousedao/connect/prerender",
    )) as ShellRenderer;
    // The stylesheet index.html links, which Tailwind builds for the shell's classes.
    return await renderer.renderProjectShells(join(projectRoot, "style.css"));
  } finally {
    await server.close();
  }
}

const sourceText = (source: string | Uint8Array) =>
  typeof source === "string" ? source : new TextDecoder().decode(source);

/** Build: the composition's shell in #root and every variant in the dist, from
 * the project's routes when it has them. Dev: core's shell for a core composition. */
export function connectAppShellPlugin(
  projectRoot: string,
  { composition, appName, routeAliases }: ConnectAppShellOptions = {},
): Plugin {
  const variant = appShellVariant(composition);
  let shells: AppShells = {};
  let base = "/";
  let isBuild = true;
  let config: ResolvedConfig | undefined;
  // A project's shells go in the built index.html, so they're rendered after bundling.
  const fromRoutes = () => isBuild && !!routeAliases;
  const shell = () => {
    if (fromRoutes()) return undefined;
    return isBuild || variant === "core" ? shells[variant] : undefined;
  };
  return {
    name: "ph-connect-app-shell",
    configResolved(resolved) {
      config = resolved;
      base = resolved.base;
      isBuild = resolved.command === "build";
      shells = readAppShells(projectRoot);
    },
    transformIndexHtml: {
      // After Vite injects the built CSS links.
      order: "post",
      handler: (html) => {
        const current = shell();
        // Dev keeps blocking CSS for HMR.
        return current
          ? injectAppShell(html, current, base, {
              deferStyles: isBuild,
              appName,
            })
          : html;
      },
    },
    generateBundle: {
      // After index.html and the CSS are in the bundle.
      order: "post",
      async handler(_options, bundle) {
        if (!isBuild) return;
        if (fromRoutes() && config && routeAliases) {
          shells = await renderProjectAppShells(
            projectRoot,
            config,
            routeAliases,
          );
          const index = bundle["index.html"];
          const current = shells[variant];
          if (index?.type === "asset" && current) {
            index.source = injectAppShell(
              sourceText(index.source),
              current,
              base,
              { appName },
            );
          }
        }
        if (!Object.keys(shells).length) return;
        this.emitFile({
          type: "asset",
          fileName: APP_SHELLS_FILE,
          source: JSON.stringify(shells),
        });
      },
    },
  };
}

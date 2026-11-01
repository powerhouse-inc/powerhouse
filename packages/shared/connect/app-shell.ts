import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

/** Each plugin specifier Connect ships a shell for, to the variant it picks. */
export type ShellPlugins = Record<string, AppShellVariant>;

/** In Connect's dist, and copied to a project's: the plugins that pick a shell. */
export const SHELL_PLUGINS_FILE = "shell-plugins.json";

/** In a project's dist: every variant, for a server that swaps the shell to the served composition. */
export const APP_SHELLS_FILE = "app-shells.json";

/** The shell of the composition's first plugin that has one, else core's; no composition is classic.
 * Without `plugins` (an older Connect): core for a composition, generic for classic. */
export function appShellVariant(
  composition: readonly { module: string }[] | null | undefined,
  plugins: ShellPlugins | undefined,
): AppShellVariant {
  if (!plugins) return composition ? "core" : "generic";
  if (!composition) return Object.values(plugins)[0] ?? "core";
  for (const { module } of composition) {
    if (Object.hasOwn(plugins, module)) return plugins[module];
  }
  return "core";
}

/** The plugins' shell manifest in `dir`, if there is a valid one. */
export function readShellPluginsIn(dir: string): ShellPlugins | undefined {
  const file = join(dir, SHELL_PLUGINS_FILE);
  if (!existsSync(file)) return undefined;
  try {
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<
      string,
      unknown
    > | null;
    if (!manifest || typeof manifest !== "object") return undefined;
    const plugins: ShellPlugins = {};
    for (const [module, variant] of Object.entries(manifest)) {
      if (variant === "generic" || variant === "core")
        plugins[module] = variant;
    }
    return plugins;
  } catch {
    return undefined;
  }
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

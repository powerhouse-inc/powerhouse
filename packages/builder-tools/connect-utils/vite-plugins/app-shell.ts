import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import { resolvePackage } from "../helpers.js";

/** On the prerendered shell's elements; marks an index.html that has it. */
export const APP_SHELL_MARKER = "data-ph-shell";

export type AppShell = {
  /** `#root`'s markup. */
  body: string;
  /** Critical CSS and the pre-paint guard, for `<head>`. */
  head: string;
};

/** The shell Connect's build prerendered, if the installed Connect ships one. */
export function readAppShell(projectRoot: string): AppShell | undefined {
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
  const body = join(distDir, "shell.html");
  const head = join(distDir, "shell-head.html");
  if (!existsSync(body) || !existsSync(head)) return undefined;
  return {
    body: readFileSync(body, "utf8"),
    head: readFileSync(head, "utf8"),
  };
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

/** Inlines `shell` into an empty `#root`, adds its critical CSS and defers the
 * stylesheets; React replaces the markup when the app renders. */
export function injectAppShell(html: string, shell: AppShell, base = "/") {
  if (html.includes(APP_SHELL_MARKER)) return html;
  const root = /<div id="root"><\/div>/;
  if (!root.test(html)) return html;
  // Before the stylesheets, so equal-specificity rules in the full CSS win.
  const firstSheet = html.search(STYLESHEET_LINK);
  const at = firstSheet >= 0 ? firstSheet : html.indexOf("</head>");
  const recover = `<script ${BOOT_RECOVER_MARKER}>${BOOT_RECOVER_SCRIPT}</script>`;
  const body = rebaseShellLinks(shell.body, base);
  return (html.slice(0, at) + shell.head + recover + html.slice(at))
    .replace(STYLESHEET_LINK, deferStylesheet)
    .replace(root, () => `<div id="root">${body}</div>`);
}

/** Build only: dev keeps the empty root and blocking CSS for HMR. */
export function connectAppShellPlugin(projectRoot: string): Plugin {
  let shell: AppShell | undefined;
  let base = "/";
  return {
    name: "ph-connect-app-shell",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    buildStart() {
      shell = readAppShell(projectRoot);
    },
    transformIndexHtml: {
      // After Vite injects the built CSS links.
      order: "post",
      handler: (html) => (shell ? injectAppShell(html, shell, base) : html),
    },
  };
}

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
export function injectAppShell(html: string, shell: AppShell) {
  if (html.includes(APP_SHELL_MARKER)) return html;
  const root = /<div id="root"><\/div>/;
  if (!root.test(html)) return html;
  // Before the stylesheets, so equal-specificity rules in the full CSS win.
  const firstSheet = html.search(STYLESHEET_LINK);
  const at = firstSheet >= 0 ? firstSheet : html.indexOf("</head>");
  return (html.slice(0, at) + shell.head + html.slice(at))
    .replace(STYLESHEET_LINK, deferStylesheet)
    .replace(root, `<div id="root">${shell.body}</div>`);
}

/** Build only: dev keeps the empty root and blocking CSS for HMR. */
export function connectAppShellPlugin(projectRoot: string): Plugin {
  let shell: AppShell | undefined;
  return {
    name: "ph-connect-app-shell",
    apply: "build",
    buildStart() {
      shell = readAppShell(projectRoot);
    },
    transformIndexHtml: {
      // After Vite injects the built CSS links.
      order: "post",
      handler: (html) => (shell ? injectAppShell(html, shell) : html),
    },
  };
}

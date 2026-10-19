// Writes dist/shell.html (#root's markup) and dist/shell-head.html (critical CSS + guard).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pruneCriticalCss } from "./critical-css.ts";

process.env.NODE_ENV = "production";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prerenderDir = join(root, ".prerender");
const distDir = join(root, "dist");

// The marker boot.tsx and the project build look for; keep in sync with src/prerender/shell.tsx.
const SHELL_MARKER = "data-ph-shell";

// Before first paint: no sidebar in an embed, and the home view hidden off the home path.
const GUARD_SCRIPT =
  `(function(){try{var h=document.documentElement;` +
  `var e=new URLSearchParams(location.search).get('embed');` +
  `if(e!==null&&e!=='0'&&e!=='false')h.classList.add('ph-shell-embed');` +
  `var p=location.pathname;` +
  `if(!/\\/$/.test(p)||/\\/d\\//.test(p))h.classList.add('ph-shell-route')` +
  `}catch(x){}})();`;

// The loader fades in late so fast loads never show it; --ph-shell-t (set when
// React re-renders the shell) keeps both animations on the navigation's clock.
const GUARD_CSS =
  `.ph-shell-embed [${SHELL_MARKER}] #sidebar{display:none}` +
  `.ph-shell-route [${SHELL_MARKER}] #content-view{visibility:hidden}` +
  `@keyframes ph-shell-loader-in{from{opacity:0}to{opacity:1}}` +
  `.ph-shell-loader{animation:ph-shell-loader-in .2s ease-in both;animation-delay:calc(.25s + var(--ph-shell-t,0ms))}` +
  `.ph-shell-loader .animate-pulse{animation-delay:var(--ph-shell-t,0ms)}`;

// Data-URI images (the login button's PNGs) weigh more than the rest of the
// shell; a box of their size keeps the layout.
function replaceInlineImages(html: string) {
  return html.replace(/<img\b[^>]*\bsrc="data:[^"]*"[^>]*>/g, (img) => {
    const attr = (name: string) =>
      new RegExp(`\\b${name}="([^"]*)"`).exec(img)?.[1];
    // A hidden variant (e.g. the hover image) needs no box.
    if (/(^| )hidden( |$)/.test(attr("class") ?? "")) return "";
    const width = attr("width");
    const height = attr("height");
    const size = `${width ? `width:${width}px;` : ""}${height ? `height:${height}px;` : ""}`;
    return `<span style="display:inline-block;${size}"></span>`;
  });
}

const { renderShell } = (await import(
  pathToFileURL(join(prerenderDir, "shell.js")).href
)) as { renderShell: () => Promise<string> };

// The router's scroll restoration script is for hydration, and the page keeps
// its own title until the app's routes set one.
const markup = replaceInlineImages(
  (await renderShell())
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, ""),
);
writeFileSync(join(prerenderDir, "shell.html"), markup);

execFileSync(
  "pnpm",
  [
    "exec",
    "tailwindcss",
    "-i",
    "src/prerender/shell.css",
    "-o",
    ".prerender/shell.css",
    "--minify",
  ],
  // Windows runs pnpm as pnpm.cmd, which only a shell resolves.
  {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"],
    shell: process.platform === "win32",
  },
);
const css = pruneCriticalCss(
  readFileSync(join(prerenderDir, "shell.css"), "utf8"),
  markup,
  GUARD_CSS,
);

mkdirSync(distDir, { recursive: true });
writeFileSync(
  join(distDir, "shell.html"),
  // Inert: clicks and focus wait for the app; a static shell does nothing with them.
  `<div ${SHELL_MARKER} inert style="display:contents">${markup}</div>`,
);
writeFileSync(
  join(distDir, "shell-head.html"),
  `<style ${SHELL_MARKER}>${css}${GUARD_CSS}</style>` +
    `<script ${SHELL_MARKER}>${GUARD_SCRIPT}</script>`,
);
console.log(
  `[connect] prerendered the app shell: ${markup.length} B markup, ${css.length} B critical CSS`,
);

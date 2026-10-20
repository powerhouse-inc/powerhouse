// Turns a rendered shell into what index.html carries: #root's markup and <head>'s CSS.

/** The marker boot.tsx and the project build look for. */
export const SHELL_MARKER = "data-ph-shell";

/** `generic`: Connect's chrome. `core`: core's views. `project`: a project's routes. */
export type AppShellKind = "generic" | "core" | "project";

/** Rendered where the app's name goes. */
export const APP_NAME_TOKEN = "__PH_SHELL_APP_NAME__";

// The app's name, delimited for the project build to fill in; the default is core's own.
// Keep in sync with builder-tools' app-shell.ts.
const APP_NAME_REGION =
  "<!--ph-shell:app-name-->Connect<!--/ph-shell:app-name-->";

// Before first paint: no sidebar in an embed, and the home view hidden off the home path.
const GUARD_SCRIPT =
  `(function(){try{var h=document.documentElement;` +
  `var e=new URLSearchParams(location.search).get('embed');` +
  `if(e!==null&&e!=='0'&&e!=='false')h.classList.add('ph-shell-embed');` +
  `var p=location.pathname;` +
  `if(!/\\/$/.test(p)||/\\/d\\//.test(p))h.classList.add('ph-shell-route')` +
  `}catch(x){}})();`;

// The shell renders `/`: off it, its links mark no current page until the app routes.
const CURRENT_GUARD_SCRIPT =
  `(function(){if(!document.documentElement.classList.contains('ph-shell-route'))return;` +
  `document.querySelectorAll('[${SHELL_MARKER}] [aria-current]').forEach(function(e){` +
  `e.removeAttribute('aria-current');e.classList.remove('active')})})();`;

// The loader fades in late so fast loads never show it; --ph-shell-t (set when
// React re-renders the shell) keeps both animations on the navigation's clock.
const LOADER_CSS =
  `@keyframes ph-shell-loader-in{from{opacity:0}to{opacity:1}}` +
  `.ph-shell-loader{animation:ph-shell-loader-in .2s ease-in both;animation-delay:calc(.25s + var(--ph-shell-t,0ms))}` +
  `.ph-shell-loader>*{animation-delay:var(--ph-shell-t,0ms)}`;

// The shell renders `/`: off the home path its content view hides until the app routes.
const ROUTE_GUARD = `.ph-shell-route [${SHELL_MARKER}] #content-view{visibility:hidden}`;

// Core's header goes in an embed, and its static theme toggle shows the wrong glyph in one theme.
const GUARD_CSS: Record<AppShellKind, string> = {
  generic:
    `.ph-shell-embed [${SHELL_MARKER}] #sidebar{display:none}` +
    ROUTE_GUARD +
    LOADER_CSS,
  core:
    `.ph-shell-embed [${SHELL_MARKER}] header{display:none}` +
    `[${SHELL_MARKER}] header button{visibility:hidden}` +
    LOADER_CSS,
  project: ROUTE_GUARD + LOADER_CSS,
};

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

/** The rendered shell as #root's static markup: no scripts or title, images as
 * boxes, the app's name delimited. */
export function shellMarkup(rendered: string) {
  // The router's scroll restoration script is for hydration, and the page keeps
  // its own title until the app's routes set one.
  return replaceInlineImages(
    rendered
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, ""),
  ).replaceAll(APP_NAME_TOKEN, APP_NAME_REGION);
}

/** #root's markup and <head>'s critical CSS (`css`, see shellCss) and guard.
 * `variant` names it for a server that swaps it. */
export function appShell(
  kind: AppShellKind,
  variant: "generic" | "core",
  markup: string,
  css: string,
) {
  const guard = GUARD_CSS[kind];
  const marker = `${SHELL_MARKER}="${variant}"`;
  return {
    // Inert: clicks and focus wait for the app; a static shell does nothing with them.
    body:
      `<div ${marker} inert style="display:contents">${markup}</div>` +
      `<script ${marker}>${CURRENT_GUARD_SCRIPT}</script>`,
    head:
      `<style ${marker}>${css}${guard}</style>` +
      `<script ${marker}>${GUARD_SCRIPT}</script>`,
  };
}

import type { Plugin } from "vite";

/**
 * Marker attribute on the injected script. Serve-time injectors (e.g. the
 * ph-clint connect proxy) and this plugin both check it, so the script is
 * applied exactly once no matter which layer runs first.
 */
export const THEME_BOOT_MARKER = "data-ph-theme-boot";

/**
 * Pre-paint theme boot: `?theme=dark|light` persists to `ph:theme`, then the
 * stored choice (or system preference) decides the `.dark` root class before
 * hydration. Fail-silent — storage access can throw in embed/privacy contexts.
 * Keep semantically identical to the runtime store in
 * `@powerhousedao/reactor-browser` (hooks/theme.ts).
 */
const THEME_BOOT_SCRIPT =
  `(function(){try{` +
  `var p=new URLSearchParams(location.search).get('theme');` +
  `if(p==='dark'||p==='light')localStorage.setItem('ph:theme',p);` +
  `var s=localStorage.getItem('ph:theme');` +
  `var m=matchMedia('(prefers-color-scheme: dark)');` +
  `var d=s==='dark'||((!s||s==='system')&&m.matches);` +
  `document.documentElement.classList.toggle('dark',d);` +
  // Some browsers settle the OS preference after boot; follow it until the app does.
  `if(!s||s==='system'){var f=function(){var t=localStorage.getItem('ph:theme');` +
  `if(!t||t==='system')document.documentElement.classList.toggle('dark',m.matches);};` +
  `m.addEventListener('change',f);requestAnimationFrame(f);}` +
  `}catch(e){}})();`;

/**
 * Injects the theme boot script at the top of `<head>` of every emitted
 * index.html, so built Connect apps render the stored theme from first paint
 * without depending on a serve-time injector.
 */
export function connectThemeBootPlugin(): Plugin {
  return {
    name: "ph-connect-theme-boot",
    transformIndexHtml(html) {
      if (html.includes(THEME_BOOT_MARKER)) return;
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: { [THEME_BOOT_MARKER]: "" },
            children: THEME_BOOT_SCRIPT,
            injectTo: "head-prepend",
          },
        ],
      };
    },
  };
}

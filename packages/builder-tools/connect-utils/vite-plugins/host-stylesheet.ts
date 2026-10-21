import {
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { normalizePath, type Plugin } from "vite";
import { HOST_ROUTES_DIR } from "./connect-routes.js";

/** The host's stylesheet, which may not exist yet: `style.css` beside its routes
 * folder, so `hosts/connect/style.css` by default. `ph build` never reads it. */
export function hostStylesheetPath(
  projectRoot: string,
  routesDir?: string | false,
): string {
  const hostDir = routesDir
    ? dirname(routesDir)
    : join(projectRoot, dirname(HOST_ROUTES_DIR));
  return join(hostDir, "style.css");
}

const importOf = (stylesheet: string, file: string) =>
  `@import ${JSON.stringify(`./${normalizePath(relative(dirname(stylesheet), file))}`)};`;

/** The project's `style.css` with the host's stylesheet imported last when it
 * exists (else `missing`), so the host's theme wins in the page's one build. */
export function withHostStylesheet(
  css: string,
  stylesheet: string,
  hostStylesheet: string | undefined,
  missing?: string,
) {
  const file =
    hostStylesheet && existsSync(hostStylesheet) ? hostStylesheet : missing;
  return file ? `${css}\n${importOf(stylesheet, file)}\n` : css;
}

/** Serves the project's `style.css` with the host's stylesheet in it. */
export function hostStylesheetPlugin(
  projectRoot: string,
  hostStylesheet: string,
): Plugin {
  const stylesheet = join(projectRoot, "style.css");
  // Vite's ids and changed files have forward slashes, on Windows too.
  const stylesheetId = normalizePath(stylesheet);
  const hostId = normalizePath(hostStylesheet);
  // Dev imports this while the host file is missing: Tailwind rebuilds only when
  // a dependency changes, so touching it brings in a host file created later.
  let placeholder: string | undefined;
  return {
    name: "ph-host-stylesheet",
    enforce: "pre",
    configResolved(config) {
      if (config.command !== "serve") return;
      placeholder = join(config.cacheDir, "ph-host-stylesheet.css");
      mkdirSync(dirname(placeholder), { recursive: true });
      writeFileSync(placeholder, "/* Until the host's style.css exists. */\n");
    },
    load(id) {
      if (normalizePath(id.split("?")[0]) !== stylesheetId) return null;
      const css = readFileSync(stylesheet, "utf8");
      return withHostStylesheet(css, stylesheet, hostStylesheet, placeholder);
    },
    // ph-config drops updates of files only CSS imports, so style.css takes them.
    hotUpdate(ctx) {
      if (normalizePath(ctx.file) !== hostId) return;
      if (ctx.type === "create" && placeholder && existsSync(placeholder)) {
        const now = new Date();
        utimesSync(placeholder, now, now);
      }
      const modules =
        this.environment.moduleGraph.getModulesByFile(stylesheetId);
      return [...ctx.modules, ...(modules ?? [])];
    },
  };
}

// Writes dist/shell{,-core}.html (#root's markup), dist/shell{,-core}-head.html (critical CSS + guard) and shell-plugins.json.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as Prerender from "../src/prerender/shell.tsx";

process.env.NODE_ENV = "production";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const prerenderDir = join(root, ".prerender");
const distDir = join(root, "dist");

type ShellVariant = "generic" | "core";

const FILE_PREFIX: Record<ShellVariant, string> = {
  generic: "shell",
  core: "shell-core",
};

const { renderShell, shellMarkup, shellCss, appShell, shellPlugins } =
  (await import(
    pathToFileURL(join(prerenderDir, "shell.js")).href
  )) as typeof Prerender;

mkdirSync(distDir, { recursive: true });

const plugins = await shellPlugins();
const variants = ["core", ...Object.keys(plugins)] as ShellVariant[];

for (const variant of variants) {
  const name = FILE_PREFIX[variant];
  const markup = shellMarkup(await renderShell(variant));
  // Connect's stylesheet, built for the markup's classes only.
  const css = await shellCss(join(root, "style.css"), markup);
  const shell = appShell(variant, variant, markup, css);
  writeFileSync(join(distDir, `${name}.html`), shell.body);
  writeFileSync(join(distDir, `${name}-head.html`), shell.head);
  console.log(
    `[connect] prerendered the ${variant} app shell: ${markup.length} B markup, ${shell.head.length} B head`,
  );
}

// Each plugin specifier to the shell it picks; core's has none.
writeFileSync(
  join(distDir, "shell-plugins.json"),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(plugins).map(([variant, module]) => [module, variant]),
    ),
  ),
);

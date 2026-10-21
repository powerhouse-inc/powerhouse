// The loading screen's CSS: Tailwind builds a stylesheet for just the classes its markup uses.
import { compile, optimize } from "@tailwindcss/node";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

let emptyFile: string | undefined;
const empty = () => {
  if (!emptyFile) {
    emptyFile = join(mkdtempSync(join(tmpdir(), "ph-shell-")), "empty.css");
    writeFileSync(emptyFile, "");
  }
  return emptyFile;
};

// Plain third-party CSS stays out: a vendor.css, or another package's stylesheet.
const isVendor = (id: string) =>
  id.endsWith("/vendor.css") ||
  !(
    id.startsWith(".") ||
    id.startsWith("/") ||
    id.startsWith("tailwindcss") ||
    id.startsWith("@powerhousedao/")
  );

const CLASS_ATTRIBUTE = /\sclass="([^"]*)"/g;

/** `entry`, a Tailwind stylesheet (its text `css` when given), built for the
 * classes in `markup` only: its tokens, reset and rules, without third-party CSS. */
export async function shellCss(
  entry: string,
  markup: string,
  css = readFileSync(entry, "utf8"),
) {
  const compiler = await compile(css, {
    base: dirname(entry),
    from: entry,
    onDependency: () => {},
    customCssResolver: (id) =>
      Promise.resolve(isVendor(id) ? empty() : undefined),
  });
  const classes = new Set(
    [...markup.matchAll(CLASS_ATTRIBUTE)].flatMap((m) => m[1].split(/\s+/)),
  );
  const built = compiler.build([...classes].filter(Boolean));
  return optimize(built, { file: entry, minify: true }).code;
}

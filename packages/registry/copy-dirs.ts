import { cp, access, mkdir, writeFile } from "node:fs/promises";

for (const dir of ["storage", "cdn-cache", "packages"]) {
  try {
    await access(`./${dir}/`);
    await cp(`./${dir}/`, `./dist/${dir}`, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist yet, skip copy
  }
}

// Verdaccio loads the auth plugin with require(); mark dist/plugins as a
// CommonJS scope so its emitted `.js` is treated as CJS even though the
// package root is type:module.
await mkdir("./dist/plugins", { recursive: true });
await writeFile(
  "./dist/plugins/package.json",
  `${JSON.stringify({ type: "commonjs" })}\n`,
);

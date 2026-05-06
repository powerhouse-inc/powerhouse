import { access, cp, writeFile } from "node:fs/promises";

for (const dir of ["storage", "cdn-cache", "packages"]) {
  try {
    await access(`./${dir}/`);
    await cp(`./${dir}/`, `./dist/${dir}`, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist yet, skip copy
  }
}

// Verdaccio's plugin loader resolves auth plugins via
// `require(<plugins-path>/verdaccio-auth-renown)` — no extension. Node's
// CommonJS resolver needs either a `.js` file or a directory with a
// package.json. Our parent dist/ is type:module, so a `.js` would be parsed
// as ESM and require() would throw. Drop a nested package.json that pins
// type:commonjs and points main at the bundled `index.cjs` tsdown emits.
await writeFile(
  "./dist/verdaccio-auth-renown/package.json",
  JSON.stringify(
    {
      name: "verdaccio-auth-renown",
      private: true,
      type: "commonjs",
      main: "./index.cjs",
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

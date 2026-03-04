import { cp, access } from "node:fs/promises";

await Bun.build({
  entrypoints: ["./src/index.ts", "./src/cli.ts"],
  outdir: "dist",
  root: ".",
  target: "node",
});

for (const dir of ["storage", "cdn-cache", "packages"]) {
  try {
    await access(`./${dir}/`);
    await cp(`./${dir}/`, `./dist/${dir}`, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist yet, skip copy
  }
}

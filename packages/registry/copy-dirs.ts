import { cp, access } from "node:fs/promises";

for (const dir of ["storage", "cdn-cache", "packages"]) {
  try {
    await access(`./${dir}/`);
    await cp(`./${dir}/`, `./dist/${dir}`, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist yet, skip copy
  }
}

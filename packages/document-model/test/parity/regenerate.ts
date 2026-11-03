import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { GOLDENS, GOLDENS_DIRECTORY } from "./goldens.js";

mkdirSync(GOLDENS_DIRECTORY, { recursive: true });
for (const file of readdirSync(GOLDENS_DIRECTORY)) {
  rmSync(new URL(file, GOLDENS_DIRECTORY));
}
for (const { file, content } of GOLDENS) {
  writeFileSync(new URL(file, GOLDENS_DIRECTORY), content);
}

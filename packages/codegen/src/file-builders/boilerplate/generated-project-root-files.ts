import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import {
  eslintConfigTemplate,
  indexHtmlTemplate,
  indexTsTemplate,
  mainTsxTemplate,
  styleTemplate,
  tsConfigTemplate,
  vitestConfigTemplate,
} from "templates";

export async function writeGeneratedProjectRootFiles() {
  await writeFileEnsuringDir("tsconfig.json", tsConfigTemplate);
  await writeFileEnsuringDir("index.html", indexHtmlTemplate);
  await writeFileEnsuringDir("main.tsx", mainTsxTemplate);
  await writeFileEnsuringDir("eslint.config.js", eslintConfigTemplate);
  await writeFileEnsuringDir("index.ts", indexTsTemplate);
  await writeFileEnsuringDir("style.css", styleTemplate);
  await writeFileEnsuringDir("vitest.config.ts", vitestConfigTemplate);
}

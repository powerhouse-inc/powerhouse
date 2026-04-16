import { writeFileEnsuringDir } from "@powerhousedao/shared/clis";
import { join } from "path";
import {
  eslintConfigTemplate,
  indexHtmlTemplate,
  indexTsTemplate,
  mainTsxTemplate,
  styleTemplate,
  tsConfigTemplate,
  vitestConfigTemplate,
} from "templates";
import { formatSafe } from "utils";

export async function writeGeneratedProjectRootFiles(
  projectDir = process.cwd(),
) {
  await writeFileEnsuringDir(
    join(projectDir, "tsconfig.json"),
    await formatSafe(tsConfigTemplate, "json"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "index.html"),
    await formatSafe(indexHtmlTemplate, "html"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "main.tsx"),
    await formatSafe(mainTsxTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "eslint.config.js"),
    await formatSafe(eslintConfigTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "index.ts"),
    await formatSafe(indexTsTemplate),
  );
  await writeFileEnsuringDir(
    join(projectDir, "style.css"),
    await formatSafe(styleTemplate, "css"),
  );
  await writeFileEnsuringDir(
    join(projectDir, "vitest.config.ts"),
    await formatSafe(vitestConfigTemplate),
  );
}

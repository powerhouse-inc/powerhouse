import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

interface PackageJson {
  version: string;
}

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Read package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8"),
) as PackageJson;

// Generate version.ts content
const versionFileContent = `// This file is auto-generated. DO NOT EDIT.
export const version = "${packageJson.version}";
`;

// Write version.ts
writeFileSync(join(__dirname, "../src/version.ts"), versionFileContent);

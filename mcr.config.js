// @ts-check
/**
 * @typedef {import("monocart-coverage-reports").CoverageReportOptions} CoverageReportOptions
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { coverageConfigDefaults } from "vitest/config";

const console = globalThis.console;

export const filter = {
  ...coverageConfigDefaults.exclude.reduce((acc, exclude) => {
    return {
      ...acc,
      [exclude]: false,
    };
  }, {}),
  "**/__tests__/**": false,
  "**/test/**": false,
  "**/tests/**": false,
  "**/types/**": false,
  "**/assets/**": false,
  "**/types.ts": false,
  "**/scripts/**": false,
  "**/coverage/**": false,
  "**/cypress/**": false,
  "**/storybook-static/**": false,
  "tools/**": false,
  "apps/academy/**": false,
  "**/packages/document-drive/src/storage/prisma/client/**": false,
  "setupTests.ts": false,
  "*.d.ts": false,
  "**/*.stories.tsx": false,
  "**/*.stories.ts": false,
};

/**
 * @type {CoverageReportOptions}
 */
const coverageOptions = {
  name: "Vitest Coverage Report",
  reports: [
    "v8",
    [
      "raw",
      {
        outputDir: "raw",
      },
    ],
  ],
  lcov: true,
  outputDir: "coverage",
  onEnd: async (results) => {
    console.log(`Coverage report generated: ${results?.reportPath}`);
  },
  all: {
    dir: ["./clis", "./apps", "./packages"],
    filter: {
      ...filter,
      "**/dist/**": false,
      "**/clis/**/*.{ts,tsx}": true,
      "**/apps/*/src/**/*.{ts,tsx}": true,
      "**/packages/**/*.{ts,tsx}": true,
    },
  },
  entryFilter: (entry) => {
    // ignore typescript only files
    if (!entry.sourceMap?.mappings) {
      return false;
    }
    return true;
  },
  sourcePath: (filePath) => {
    if (filePath.includes("dist") && filePath.endsWith(".js")) {
      try {
        // get source file path from sourcemap on dist folder
        const sourceMapPath = filePath + ".map";
        const sourceMap = JSON.parse(readFileSync(sourceMapPath, "utf-8"));
        const sourceRelativePath = sourceMap.sources[0];

        // return path of source file instead of file bundled by vite
        const sourceAbsolutePath = path.resolve(
          path.dirname(sourceMapPath),
          sourceRelativePath,
        );
        const distPath = filePath.split(path.sep);
        const rootDir = distPath
          .slice(0, distPath.indexOf("dist"))
          .join(path.sep);
        return sourceAbsolutePath.substring(
          sourceAbsolutePath.indexOf(rootDir),
        );
      } catch (error) {
        console.error(filePath, error.message);
      }
    }

    return filePath;
  },
  sourceFilter: {
    ...filter,
    "**/dist/**": false,
    "**/**": true,
  },
};

export default coverageOptions;

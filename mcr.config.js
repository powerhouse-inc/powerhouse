/**
 * @typedef {import("monocart-coverage-reports").CoverageReportOptions} CoverageReportOptions
 */
import { coverageConfigDefaults } from "vitest/config";

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
    dir: ["./packages"],
    filter: {
      "**/packages/document-model/**/*.ts": true,
      // "**/packages/**/*.ts": true,
      // "**/packages/**/*.tsx": true,
    },
  },
  sourceFilter: {
    ...coverageConfigDefaults.exclude.reduce((acc, exclude) => {
      return {
        ...acc,
        [exclude]: false,
      };
    }, {}),
    "**/dist/**": false,
    "**/test/**": false,
    "**/scripts/**": false,
    "**/coverage/**": false,
    "**/cypress/**": false,
    "**/storybook-static/**": false,
    "tools/**": false,
    "apps/academy/**": false,
    "packages/document-drive/src/storage/prisma/client/**": false,
    "setupTests.ts": false,
    "**/**": true,
  },
  // sourcePath: (filePath, info) => {
  //   filePath = filePath.split("?").shift();
  //   if (filePath.includes("/dist") && info.distFile) {
  //     console.log(filePath, info.distFile);
  //     return `${path.dirname(info.distFile)}/${filePath}`.replace(".js", ".ts");
  //   }

  //   return filePath;
  // },
};

export default coverageOptions;

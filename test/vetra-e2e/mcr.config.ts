import type { CoverageReportOptions } from "monocart-coverage-reports";
import path from "node:path";

const dirname = import.meta.dirname;
const rootDir = path.join(dirname, "../../");

const coverageOptions: CoverageReportOptions = {
  name: "Vetra E2E Coverage Report",
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
  filter: {
    "**/*.mp4": false,
    "**/*.png": false,
    "**/*.avif": false,
    "**/node_modules/**": false,
    "node_modules/**": false,
    "**/vetra-e2e/**": false,
    "**/src/**": true,
    "**/**": true,
  },
  onEnd: async (results) => {
    console.log(`Coverage report generated: ${results?.reportPath}`);
  },
  sourcePath: {
    "packages/document-model/dist/src/document-model/custom/reducers/header.js":
      "packages/document-model/src/document-model/custom/reducers/header.ts",
  },

  outputDir: "./coverage",
};

export default coverageOptions;

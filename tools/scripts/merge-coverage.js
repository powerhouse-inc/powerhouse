import { CoverageReport } from "monocart-coverage-reports";
const inputDir = ["./coverage/raw", "./test/connect-e2e/coverage/raw"];
/**
 * @typedef {import("monocart-coverage-reports").CoverageReportOptions} CoverageReportOptions
 */

/**
 * @type {CoverageReportOptions}
 */
const coverageOptions = {
  name: "Merged Coverage Report",
  inputDir,
  outputDir: "./coverage/merged",

  entryFilter: {
    "**/node_modules/**": false,
    "**/*": true,
  },
  sourceFilter: {
    "**/node_modules/**": false,
    "**/src/**": true,
  },
  sourcePath: (filePath, info) => {
    // Unify the file path for the same files
    // For example, the file index.js has different paths:
    // unit: unit-dist/src/index.js
    // e2e: e2e-dist/src/index.js
    // return filePath.replace("unit-dist/", "").replace("e2e-dist/", "")
    if (filePath.includes("document-model/custom/reducers/header.ts")) {
      // console.log("OI", filePath);
      return "packages/document-model/src/document-model/custom/reducers/headeroioi.ts";
    }

    if (filePath.includes("src/document/utils/header.ts")) {
      // console.log("OI", filePath);
      return "packages/document-model/src/document/utils/header111.ts";
    }
    if (filePath.includes("src/document/utils/header.js")) {
      // console.log("OI", filePath);
      return "packages/document-model/src/document/utils/header122.js";
    }
    return filePath;
  },

  reports: [["v8"]],

  onEnd: () => {
    // remove the raw files if it useless
    // inputDir.forEach((p) => {
    //     fs.rmSync(p, {
    //         recursive: true,
    //         force: true
    //     });
    // });
  },
};
await new CoverageReport(coverageOptions).generate();

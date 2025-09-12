import type { CoverageReportOptions } from "monocart-coverage-reports";
import path from "node:path";

const dirname = import.meta.dirname;
const rootDir = path.join(dirname, "../../");
const connectDir = path.join(rootDir, "apps/connect/");

// https://github.com/cenfun/monocart-coverage-reports
const coverageOptions: CoverageReportOptions = {
  name: "Connect E2E Coverage Report",

  reports: ["v8", "lcovonly"],

  filter: {
    "**/*.mp4": false,
    "**/*.png": false,
    "**/*.avif": false,
    "**/node_modules/**": false,
    "node_modules/**": false,
    "**/connect-e2e/**": false,
    "**/src/**": true,
    "**/**": true,
  },
  // sourcePath: (filePath, info) => {
  //   let srcFilePath = "";
  //   if (filePath.includes("monorepo")) {
  //     srcFilePath = path.join(
  //       path.dirname(rootDir),
  //       filePath
  //         .substring(filePath.indexOf("monorepo"))
  //         .replace("/dist", "")
  //         .replace(".js", ".ts"),
  //     );

  //     srcFilePath = srcFilePath.replace(
  //       srcFilePath.substring(srcFilePath.indexOf(".ts") + 3),
  //       "",
  //     );
  //   }

  //   // if (filePath.startsWith("src") || !filePath.includes("/")) {
  //   //   srcFilePath = path.join(connectDir, filePath);
  //   // }

  //   if (filePath.startsWith("packages/")) {
  //     srcFilePath = path.join(rootDir, filePath);
  //   }

  //   if (srcFilePath && !fs.existsSync(srcFilePath)) {
  //     if (fs.existsSync(srcFilePath.replace(".ts", ".tsx"))) {
  //       srcFilePath = srcFilePath.replace(".ts", ".tsx");
  //     } else {
  //       console.log(`INCORRECT: ${filePath} => ${srcFilePath}`);
  //       srcFilePath = "";
  //     }
  //   } else if (!srcFilePath) {
  //     console.log(`${filePath} => ${srcFilePath}`);
  //   }

  //   return srcFilePath || filePath;
  // },

  // entryFilter: {
  //     '**/node_modules/**': false,
  //     '**/*.js': true
  // },

  // sourceFilter: {
  //     '**/node_modules/**': false,
  //     '**/*.js': true
  // },

  outputDir: "./coverage",
};

export default coverageOptions;

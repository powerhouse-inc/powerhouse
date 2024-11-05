const fs = require("fs");
const path = require("path");

console.log("Running pnpmfile.cjs script");

function createFile(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content);
    console.log(`Created file: ${filePath}`);
  }
}

function createDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
}

function readPackage(pkg) {
  try {
    const createLibDir = path.join(
      __dirname,
      "packages/codegen/dist/create-lib",
    );
    createDirectory(createLibDir);

    const cliFilePath = path.join(__dirname, "packages/codegen/dist/cli.js");
    createFile(cliFilePath, "#! /usr/bin/env node\n");

    const indexFilePath = path.join(createLibDir, "index.js");
    createFile(indexFilePath, "#! /usr/bin/env node\n");
  } catch (err) {
    console.error("Error creating files:", err);
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage,
  },
};

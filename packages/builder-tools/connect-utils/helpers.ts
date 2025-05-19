import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { exec } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { type Plugin } from "vite";

export function resolvePackage(packageName: string, root = process.cwd()) {
  // find connect installation
  const require = createRequire(root);
  return require.resolve(packageName, { paths: [root] });
}

export function resolveConnect(root = process.cwd()) {
  const connectHTMLPath = resolvePackage("@powerhousedao/connect", root);
  return resolve(connectHTMLPath, "..");
}

export function copyConnect(sourcePath: string, targetPath: string) {
  try {
    // Ensure targetPath is removed before copying
    fs.rmSync(targetPath, { recursive: true, force: true });

    // Copy everything from sourcePath to targetPath
    fs.cpSync(sourcePath, targetPath, { recursive: true });
  } catch (error) {
    console.error(`❌ Error copying ${sourcePath} to ${targetPath}:`, error);
  }
}

export function backupIndexHtml(appPath: string, restore = false) {
  const filePath = join(appPath, "index.html");
  const backupPath = join(appPath, "index.html.bak");

  const paths = restore ? [backupPath, filePath] : [filePath, backupPath];

  if (fs.existsSync(paths[0])) {
    fs.copyFileSync(paths[0], paths[1]);
  }
}

export function removeBase64EnvValues(appPath: string) {
  backupIndexHtml(appPath);

  const filePath = join(appPath, "index.html");

  // Read the HTML file
  fs.readFile(filePath, "utf-8", (err, data) => {
    if (err) {
      console.error("Error reading file:", err);
      return;
    }

    // Use regex to replace the dynamic Base64 values with empty strings
    // TODO is this needed?
    const modifiedData = data
      .replace(
        /"LOCAL_DOCUMENT_MODELS":\s*".*?",/,
        `"LOCAL_DOCUMENT_MODELS": "",`,
      )
      .replace(
        /"LOCAL_DOCUMENT_EDITORS":\s*".*?"/,
        `"LOCAL_DOCUMENT_EDITORS": ""`,
      );

    console.log("Modified data:", modifiedData);
    // Write the modified content back to the file
    fs.writeFile(filePath, modifiedData, "utf-8", (err) => {
      if (err) {
        console.error("Error writing file:", err);
        return;
      }
    });
  });
}

export function readJsonFile(filePath: string): PowerhouseConfig | null {
  try {
    const absolutePath = resolve(filePath);
    const fileContents = fs.readFileSync(absolutePath, "utf-8");
    return JSON.parse(fileContents) as PowerhouseConfig;
  } catch (error) {
    console.error(`Error reading file: ${filePath}`);
    return null;
  }
}

export function makeImportScriptFromPackages(args: {
  packages: string[];
  localPackage: boolean;
  hasStyles: boolean;
  hasModule: boolean;
  localJsPath: string;
  localCssPath: string;
  localPackageId: string;
}) {
  const {
    packages,
    localPackage,
    hasStyles,
    hasModule,
    localJsPath,
    localCssPath,
    localPackageId,
  } = args;
  const imports: string[] = [];
  const moduleNames: string[] = [];
  let counter = 0;

  for (const packageName of packages) {
    const moduleName = `module${counter}`;
    moduleNames.push(moduleName);
    imports.push(`import * as ${moduleName} from '${packageName}';`);
    imports.push(`import '${packageName}/style.css';`);
    counter++;
  }

  const exports = moduleNames.map(
    (name, index) => `{
      id: "${packages[index]}",
      ...${name},
    }`,
  );

  if (localPackage) {
    if (hasStyles) {
      imports.push(`import '${localCssPath}';`);
    }
    if (hasModule) {
      const moduleName = `module${counter}`;
      imports.push(`import * as ${moduleName} from '${localJsPath}';`);
      exports.push(`{
        id: "${localPackageId}",
        ...${moduleName},
      }`);
    }
  }

  const exportStatement = `export default [
        ${exports.join(",\n")}
    ];`;

  const fileContent = `${imports.join("\n")}\n\n${exportStatement}`;

  return fileContent;
}

export function ensureNodeVersion(minVersion = "20") {
  const version = process.versions.node;
  if (!version) {
    return;
  }

  if (version < minVersion) {
    console.error(
      `Node version ${minVersion} or higher is required. Current version: ${version}`,
    );
    process.exit(1);
  }
}

export function runShellScriptPlugin(
  scriptName: string,
  connectPath: string,
): Plugin {
  return {
    name: "vite-plugin-run-shell-script",
    buildStart() {
      const scriptPath = join(connectPath, scriptName);
      if (fs.existsSync(scriptPath)) {
        exec(`sh ${scriptPath}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing the script: ${error.message}`);
            removeBase64EnvValues(connectPath);
            return;
          }
          if (stderr) {
            console.error(stderr);
          }
        });
      }
    },
  };
}

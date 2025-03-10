import { PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import { join, resolve } from "node:path";

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

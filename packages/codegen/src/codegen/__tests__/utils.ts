import fs from "node:fs/promises";
import path from "path";

export async function copyAllFiles(srcDir: string, destDir: string) {
  console.log(`Copying files from ${srcDir} to ${destDir}`);
  // Ensure destination exists
  await fs.mkdir(destDir, { recursive: true });

  // Read all entries in the source directory
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy subdirectories
      await copyAllFiles(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

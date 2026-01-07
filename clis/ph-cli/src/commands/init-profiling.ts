import type { Command } from "commander";
import { exec, execSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CommandActionType } from "../types.js";
import { isPowerhouseProject } from "../utils.js";

const execAsync = promisify(exec);

interface InitProfilingOptions {
  branch?: string;
  repo?: string;
}

const DEFAULT_REPO_URL = "https://github.com/Samyoul/powerhouse-profiler";
const DEFAULT_BRANCH = "master";

async function getPackageManager(): Promise<"npm" | "pnpm" | "yarn" | null> {
  if (fs.existsSync(path.join(process.cwd(), "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(process.cwd(), "yarn.lock"))) {
    return "yarn";
  }
  if (fs.existsSync(path.join(process.cwd(), "package-lock.json"))) {
    return "npm";
  }
  return null;
}

async function ensureTsxInstalled(): Promise<void> {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      "No package.json found. Please run this command in a Node.js project directory.",
    );
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
  const devDeps = packageJson.devDependencies || {};
  const deps = packageJson.dependencies || {};

  if (devDeps.tsx || deps.tsx) {
    return; // tsx already installed
  }

  const packageManager = await getPackageManager();
  if (!packageManager) {
    throw new Error(
      "Could not detect package manager. Please install tsx manually: npm install --save-dev tsx",
    );
  }

  console.log("📦 Installing tsx...");
  try {
    if (packageManager === "pnpm") {
      execSync("pnpm add -D tsx", { stdio: "inherit", cwd: process.cwd() });
    } else if (packageManager === "yarn") {
      execSync("yarn add -D tsx", { stdio: "inherit", cwd: process.cwd() });
    } else {
      execSync("npm install --save-dev tsx", {
        stdio: "inherit",
        cwd: process.cwd(),
      });
    }
    console.log("✅ tsx installed successfully");
  } catch (error) {
    throw new Error(`Failed to install tsx: ${error}`);
  }
}

export const initProfiling: CommandActionType<
  [InitProfilingOptions],
  Promise<void>
> = async (options) => {
  // Validate we're in a Powerhouse project
  if (!isPowerhouseProject(process.cwd())) {
    throw new Error(
      "Not a Powerhouse project. Please run 'ph init <name>' first, then cd into the project directory before running 'ph init-profiling'.",
    );
  }

  const repoUrl = options.repo || DEFAULT_REPO_URL;
  const branch = options.branch || DEFAULT_BRANCH;
  const tempDir = path.join(tmpdir(), `ph-profiling-${Date.now()}`);

  try {
    console.log("🚀 Initializing profiling scripts for Powerhouse project...");
    console.log(`📦 Repository: ${repoUrl}`);
    console.log(`🌿 Branch: ${branch}`);
    console.log();

    // Create temp directory
    fs.mkdirSync(tempDir, { recursive: true });

    // Clone repository
    console.log("📥 Cloning repository...");
    try {
      await execAsync(`git clone --depth 1 --branch ${branch} ${repoUrl} ${tempDir}`, {
        cwd: tmpdir(),
      });
    } catch (error) {
      console.log(`⚠️  Failed to clone branch '${branch}', trying default branch...`);
      await execAsync(`git clone --depth 1 ${repoUrl} ${tempDir}`, {
        cwd: tmpdir(),
      });
    }

    const scriptSourceDir = path.join(tempDir, "scripts");
    if (!fs.existsSync(scriptSourceDir)) {
      throw new Error("No 'scripts' directory found in repository");
    }

    if (!fs.existsSync(path.join(scriptSourceDir, "add-npm-scripts.ts"))) {
      throw new Error("add-npm-scripts.ts not found in scripts directory");
    }

    // Create local scripts directory
    const localScriptsDir = path.join(process.cwd(), "scripts");
    console.log(`📁 Copying scripts to: ${localScriptsDir}`);
    fs.mkdirSync(localScriptsDir, { recursive: true });

    // Copy all script files
    const files = fs.readdirSync(scriptSourceDir);
    for (const file of files) {
      const sourcePath = path.join(scriptSourceDir, file);
      const destPath = path.join(localScriptsDir, file);
      const stat = fs.statSync(sourcePath);
      if (stat.isFile()) {
        fs.copyFileSync(sourcePath, destPath);
      } else if (stat.isDirectory()) {
        fs.cpSync(sourcePath, destPath, { recursive: true });
      }
    }
    console.log("✅ Scripts copied");

    // Create .perf directory structure
    const perfDir = path.join(process.cwd(), ".perf");
    const perfLogsDir = path.join(perfDir, "logs");
    fs.mkdirSync(perfLogsDir, { recursive: true });
    console.log("✅ Created .perf directory structure");

    // Ensure tsx is installed
    await ensureTsxInstalled();

    // Run add-npm-scripts.ts
    console.log();
    console.log("⚙️  Configuring npm scripts...");
    try {
      execSync(`tsx ${path.join(localScriptsDir, "add-npm-scripts.ts")}`, {
        stdio: "inherit",
        cwd: process.cwd(),
      });
    } catch (error) {
      console.error("⚠️  Failed to run add-npm-scripts.ts:", error);
      throw error;
    }

    console.log();
    console.log("✅ Profiling scripts initialized successfully!");
    console.log();
    console.log("You can now use the npm scripts:");
    console.log("  pnpm docs-create");
    console.log("  pnpm docs-list");
    console.log("  pnpm docs-verify-ops");
    console.log("  pnpm docs-delete");
    console.log("  pnpm profile-ts");
    console.log("  pnpm analyze-profile");
    console.log();
  } catch (error) {
    console.error("❌ Error initializing profiling scripts:", error);
    throw error;
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};

export function initProfilingCommand(program: Command) {
  const command = program
    .command("init-profiling")
    .description(
      "Initialize profiling scripts in an existing Powerhouse project. Run this after 'ph init <name>' and 'cd <name>' to add performance testing and profiling capabilities.",
    )
    .option(
      "--branch <branch>",
      "Git branch to clone (default: master)",
      DEFAULT_BRANCH,
    )
    .option(
      "--repo <url>",
      "Repository URL (default: https://github.com/Samyoul/powerhouse-profiler)",
      DEFAULT_REPO_URL,
    )
    .action(async (options: InitProfilingOptions) => {
      await initProfiling(options);
    });
}


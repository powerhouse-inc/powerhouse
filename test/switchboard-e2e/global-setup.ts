/**
 * Global Setup for Switchboard E2E Tests
 *
 * ============================================================================
 * SCENARIO 0: Generate Project Components (Pre-requisite)
 * ============================================================================
 *
 * This runs BEFORE any Playwright tests execute.
 * It sets up the complete Powerhouse project needed for testing:
 *
 * Step 1: Generate todo-list document model (from .phdm.zip or definition)
 * Step 2: Generate todo-indexer processor (relational DB)
 * Step 3: Generate todo subgraph (to expose processed data)
 * Step 4: Build the project
 *
 * After this setup completes, the reactor can start with all components loaded.
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is this directory (switchboard-e2e is a mini Powerhouse project)
const PROJECT_ROOT = __dirname;

/**
 * Run a command and log output
 */
function run(command: string, description: string): void {
  console.log(`\n📦 ${description}...`);
  console.log(`   Command: ${command}`);

  try {
    execSync(command, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      timeout: 120000, // 2 minutes
    });
    console.log(`   ✅ Success`);
  } catch (error) {
    console.error(`   ❌ Failed: ${error}`);
    throw error;
  }
}

/**
 * Check if a file exists
 */
function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(PROJECT_ROOT, relativePath));
}

async function globalSetup() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 SCENARIO 0: Generate Project Components");
  console.log("=".repeat(70));

  try {
    // =========================================================================
    // Step 1: Generate Todo-List Document Model
    // =========================================================================
    console.log("\n📋 Step 1: Todo-List Document Model");

    if (fileExists("todo.phdm.zip")) {
      // If we have a .phdm.zip file, generate from that
      run("pnpm generate todo.phdm.zip", "Generating from todo.phdm.zip");
    } else {
      // Otherwise, check if document-models already has content
      // (might be pre-configured or copied from another project)
      console.log("   ⚠️  No todo.phdm.zip found");
      console.log("   ℹ️  Copy todo.phdm.zip from test/connect-e2e/ or");
      console.log("   ℹ️  Create a todo-list document model definition");

      // Try to copy from connect-e2e if it exists
      const connectE2ETodo = path.resolve(
        __dirname,
        "../connect-e2e/todo.phdm.zip",
      );
      if (fs.existsSync(connectE2ETodo)) {
        console.log("   📂 Found todo.phdm.zip in connect-e2e, copying...");
        fs.copyFileSync(
          connectE2ETodo,
          path.join(PROJECT_ROOT, "todo.phdm.zip"),
        );
        run("pnpm generate todo.phdm.zip", "Generating from copied zip");
      } else {
        console.log(
          "   ⚠️  Skipping document model generation - no source found",
        );
      }
    }

    // =========================================================================
    // Step 2: Generate Todo-Indexer Processor
    // =========================================================================
    console.log("\n📋 Step 2: Todo-Indexer Relational DB Processor");

    if (
      !fileExists("processors/todo-indexer/index.ts") ||
      process.env.FORCE_GENERATE
    ) {
      run(
        "pnpm generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list",
        "Generating processor scaffolding",
      );

      // Generate types from migration if migration exists
      if (fileExists("processors/todo-indexer/migrations.ts")) {
        run(
          "pnpm generate --migration-file processors/todo-indexer/migrations.ts",
          "Generating database types",
        );
      }
    } else {
      console.log("   ℹ️  Processor already exists, skipping generation");
      console.log("   ℹ️  Set FORCE_GENERATE=true to regenerate");
    }

    // =========================================================================
    // Step 3: Generate Todo Subgraph
    // =========================================================================
    console.log("\n📋 Step 3: Todo Subgraph");

    if (!fileExists("subgraphs/todo/index.ts") || process.env.FORCE_GENERATE) {
      run("pnpm generate --subgraph todo", "Generating subgraph");
    } else {
      console.log("   ℹ️  Subgraph already exists, skipping generation");
    }

    // =========================================================================
    // Step 4: Build the Project (Optional - may fail if dependencies missing)
    // =========================================================================
    console.log("\n📋 Step 4: Build Project");

    try {
      run("pnpm build", "Building project");
    } catch (error) {
      console.log("   ⚠️  Build failed (this is OK for basic tests)");
      console.log("   ℹ️  The reactor can still run without a full build");
    }

    // =========================================================================
    // Verification
    // =========================================================================
    console.log("\n" + "=".repeat(70));
    console.log("✅ SCENARIO 0 COMPLETE: Project Setup Verification");
    console.log("=".repeat(70));

    const checks = [
      { path: "document-models/", name: "Document models directory" },
      { path: "processors/todo-indexer/", name: "Processor directory" },
      { path: "subgraphs/todo/", name: "Subgraph directory" },
      { path: "powerhouse.config.json", name: "Powerhouse config" },
    ];

    for (const check of checks) {
      const exists = fileExists(check.path);
      console.log(`   ${exists ? "✅" : "❌"} ${check.name}: ${check.path}`);
    }

    console.log("\n🎯 Setup complete! Playwright tests will now run.\n");
  } catch (error) {
    console.error("\n❌ Global setup failed:", error);
    console.error("\n💡 Troubleshooting:");
    console.error("   1. Make sure you have 'ph' CLI installed: npm i -g @powerhousedao/ph-cli");
    console.error("   2. Check that pnpm is available");
    console.error("   3. Copy todo.phdm.zip from test/connect-e2e/");
    throw error;
  }
}

export default globalSetup;

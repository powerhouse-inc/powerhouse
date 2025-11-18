import {
  createVetraDocument,
  getVetraDocuments,
  setPackageGithubUrl,
} from "@powerhousedao/common/utils";
import { red } from "colorette";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

/**
 * Get git remote URL (origin)
 * @returns Git remote URL or null if not configured
 */
function getGitRemoteUrl(): string | null {
  try {
    const url = execSync("git remote get-url origin", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return url || null;
  } catch {
    return null;
  }
}

/**
 * Prompt user to enter a custom GitHub URL
 */
async function promptForCustomUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write("\nEnter GitHub URL (or press Enter to skip): ");

    rl.on("line", (answer: string) => {
      rl.close();
      const url = answer.trim();
      resolve(url || null);
    });
  });
}

/**
 * Prompt yes/no question
 */
async function promptYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    process.stdout.write(`\n${question} (y/n): `);

    rl.on("line", (answer: string) => {
      rl.close();
      const response = answer.trim().toLowerCase();
      resolve(response === "y" || response === "yes");
    });
  });
}

/**
 * Prompt user to select or enter GitHub URL
 * @param gitRemoteUrl - Git remote URL if available
 * @returns Selected URL or null if skipped
 */
async function promptForGithubUrl(
  gitRemoteUrl: string | null,
): Promise<string | null> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log("\n" + "=".repeat(50));
    console.log("🔍 Vetra Package Configuration");
    console.log("=".repeat(50));
    console.log(
      "\nWe detected a Vetra package document in your remote drive without a GitHub URL configured.",
    );
    console.log("\nWould you like to configure the GitHub URL now?");

    if (gitRemoteUrl) {
      console.log(`\nGit remote URL detected: ${gitRemoteUrl}`);
      console.log("\nOptions:");
      console.log("1. Use detected URL");
      console.log("2. Enter a different URL");
      console.log("3. Skip configuration");

      process.stdout.write("\nSelect an option (1-3): ");

      const handleAnswer = (answer: string) => {
        const choice = answer.trim();

        if (choice === "1") {
          rl.close();
          resolve(gitRemoteUrl);
        } else if (choice === "2") {
          rl.close();
          promptForCustomUrl()
            .then(resolve)
            .catch(() => resolve(null));
        } else if (choice === "3") {
          rl.close();
          resolve(null);
        } else {
          process.stdout.write("Invalid choice. Select an option (1-3): ");
        }
      };

      rl.on("line", handleAnswer);
    } else {
      console.log("\nNo git remote URL detected.");
      console.log("\nOptions:");
      console.log("1. Enter GitHub URL manually");
      console.log("2. Skip configuration");

      process.stdout.write("\nSelect an option (1-2): ");

      const handleAnswer = (answer: string) => {
        const choice = answer.trim();

        if (choice === "1") {
          rl.close();
          promptForCustomUrl()
            .then(resolve)
            .catch(() => resolve(null));
        } else if (choice === "2") {
          rl.close();
          resolve(null);
        } else {
          process.stdout.write("Invalid choice. Select an option (1-2): ");
        }
      };

      rl.on("line", handleAnswer);
    }
  });
}

/**
 * Set git remote URL (origin)
 */
function setGitRemoteUrl(url: string): void {
  try {
    execSync(`git remote add origin ${url}`, {
      stdio: "inherit",
    });
    console.log(`✅ Git remote origin set to: ${url}`);
  } catch {
    try {
      execSync(`git remote set-url origin ${url}`, {
        stdio: "inherit",
      });
      console.log(`✅ Git remote origin updated to: ${url}`);
    } catch {
      console.error(red(`❌ Failed to set git remote URL`));
    }
  }
}

/**
 * Validates documents and returns the target document to use
 * Warns if multiple documents found
 */
function validateAndSelectDocument<T>(documents: T[]): T | null {
  if (documents.length === 0) {
    return null;
  }

  if (documents.length > 1) {
    console.warn(
      `⚠️  Warning: Multiple Vetra documents found (${documents.length}). Using first document.`,
    );
  }

  return documents[0];
}

async function applyGithubUrlConfiguration(
  graphqlEndpoint: string,
  vetraDriveId: string,
  documentId: string,
  selectedUrl: string,
  shouldSetRemote: boolean,
): Promise<void> {
  // Set package GitHub URL
  await setPackageGithubUrl(
    graphqlEndpoint,
    vetraDriveId,
    documentId,
    selectedUrl,
  );

  console.log(`✅ GitHub URL configured: ${selectedUrl}`);

  // Set git remote URL if requested
  if (shouldSetRemote) {
    setGitRemoteUrl(selectedUrl);
  }
}

function logVerbose(message: string, verbose?: boolean): void {
  if (verbose) {
    console.log(message);
  }
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Configure GitHub URL for Vetra documents
 * @param switchboardPort - Port where switchboard is running
 * @param vetraDriveUrl - Remote drive URL
 * @param verbose - Enable verbose logging
 */
export async function configureVetraGithubUrl(
  switchboardPort: number,
  vetraDriveUrl: string,
  verbose?: boolean,
): Promise<void> {
  logVerbose("Checking GitHub URL configuration...", verbose);

  try {
    const graphqlEndpoint = `http://localhost:${switchboardPort}/graphql`;
    const vetraDriveId = vetraDriveUrl.split("/").pop();
    if (!vetraDriveId) {
      throw new Error("Invalid vetraDriveUrl: unable to extract drive ID");
    }

    const documents = await getVetraDocuments(graphqlEndpoint, vetraDriveId);

    // Skip if already configured
    if (documents.some((doc) => doc.githubUrl)) {
      logVerbose("GitHub URL already configured, skipping setup", verbose);
      return;
    }

    // Get or create target document
    let targetDocumentId: string;
    const targetDocument = validateAndSelectDocument(documents);

    // Collect user input
    const gitRemoteUrl = getGitRemoteUrl();
    const selectedUrl = await promptForGithubUrl(gitRemoteUrl);

    if (!selectedUrl) {
      logVerbose("GitHub URL configuration skipped", verbose);
      return;
    }

    let shouldSetRemote = false;
    if (selectedUrl !== gitRemoteUrl && !gitRemoteUrl) {
      shouldSetRemote = await promptYesNo("Set this as your git remote URL?");
    }

    if (!targetDocument) {
      logVerbose("No Vetra documents found, creating new document...", verbose);

      targetDocumentId = await createVetraDocument(
        graphqlEndpoint,
        vetraDriveId,
        "vetra-package",
      );

      logVerbose(`Created new document: ${targetDocumentId}`, verbose);
    } else {
      targetDocumentId = targetDocument.id;
    }

    await applyGithubUrlConfiguration(
      graphqlEndpoint,
      vetraDriveId,
      targetDocumentId,
      selectedUrl,
      shouldSetRemote,
    );
  } catch (error) {
    console.error(
      red(
        `⚠️  GitHub URL configuration failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    logVerbose(String(error), verbose);
  }
}

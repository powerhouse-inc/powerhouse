import {
  createVetraDocument,
  getVetraDocuments,
} from "@powerhousedao/common/utils";

/**
 * Sets up a remote drive for initialization by validating and creating
 * a Vetra document if needed.
 * Returns true if setup succeeds, false if it should stop execution.
 */
export async function setupRemoteDrive(
  remoteDriveUrl: string,
): Promise<boolean> {
  try {
    // Parse driveId from URL
    const driveId = remoteDriveUrl.split("/").pop();

    if (!remoteDriveUrl || remoteDriveUrl.trim() === "") {
      console.error("❌ Remote drive URL is required");
      return false;
    }

    // Construct GraphQL endpoint from base URL
    const url = new URL(remoteDriveUrl);
    const graphqlEndpoint = `${url.protocol}//${url.host}/graphql`;

    let documents = await getVetraDocuments(graphqlEndpoint, driveId!);

    if (documents.length === 0) {
      console.log(
        "No vetra package document found in the provided drive, creating one...",
      );
      try {
        await createVetraDocument(graphqlEndpoint, driveId!, "vetra-package");
        console.log("✅ Vetra package document created successfully");

        // Re-fetch documents after creation
        documents = await getVetraDocuments(graphqlEndpoint, driveId!);

        if (documents.length === 0) {
          console.error(
            "❌ Failed to create vetra package document in the remote drive",
          );
          return false;
        }
      } catch (createError) {
        console.error(
          "❌ Failed to create vetra package document:",
          createError,
        );
        return false;
      }
    }

    if (documents.length > 1) {
      console.warn(
        "⚠️  Multiple vetra package documents were found in the provided remote drive, this might be an error in your remote drive",
      );
    }

    const hasGithubUrl = documents.some((doc) => doc.githubUrl);

    if (hasGithubUrl) {
      console.error(
        "❌ The remote drive provided already has been configured with a github url, please use the checkout command instead: ph checkout --remote-drive <remote drive url>",
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error("❌ Unable to fetch remote drive info:", error);
    return false;
  }
}

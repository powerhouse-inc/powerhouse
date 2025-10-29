import { getVetraDocuments } from "@powerhousedao/common/utils";

/**
 * Validates a remote drive for initialization.
 * Returns true if validation passes, false if it should stop execution.
 */
export async function validateRemoteDrive(
  remoteDriveUrl: string,
): Promise<boolean> {
  try {
    // Parse driveId from URL
    const driveId = remoteDriveUrl.split("/").pop();

    // Construct GraphQL endpoint from base URL
    const url = new URL(remoteDriveUrl);
    const graphqlEndpoint = `${url.protocol}//${url.host}/graphql`;

    const documents = await getVetraDocuments(graphqlEndpoint, driveId!);

    if (documents.length === 0) {
      console.error(
        "❌ No vetra package document were found in the provided drive",
      );
      return false;
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

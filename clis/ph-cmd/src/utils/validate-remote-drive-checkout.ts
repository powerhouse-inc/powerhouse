import { getVetraDocuments } from "@powerhousedao/common/utils";

export interface PackageDocumentResult {
  isValid: boolean;
  githubUrl?: string;
  error?: string;
}

export async function getPackageDocument(
  remoteDriveUrl: string,
): Promise<PackageDocumentResult> {
  try {
    const driveId = remoteDriveUrl.split("/").pop();
    const url = new URL(remoteDriveUrl);
    const graphqlEndpoint = `${url.protocol}//${url.host}/graphql`;

    if (!driveId) {
      return {
        isValid: false,
        error: "❌ Invalid remote drive URL: unable to extract drive ID",
      };
    }

    const documents = await getVetraDocuments(graphqlEndpoint, driveId);

    // Check if no documents found
    if (documents.length === 0) {
      return {
        isValid: false,
        error:
          "❌ No Vetra package documents found in the remote drive. Use 'ph init --remote-drive' to create a new project first.",
      };
    }

    // Find documents with githubUrl
    const documentsWithUrl = documents.filter((doc) => doc.githubUrl);

    if (documentsWithUrl.length === 0) {
      return {
        isValid: false,
        error:
          "❌ No GitHub URL configured in the Vetra package. Use 'ph init --remote-drive' to create a new project first.",
      };
    }

    // Warn if multiple documents found
    if (documents.length > 1) {
      console.warn(
        `⚠️  Warning: Multiple Vetra package documents found (${documents.length}). Using first document with GitHub URL.`,
      );
    }

    return {
      isValid: true,
      githubUrl: documentsWithUrl[0].githubUrl,
    };
  } catch (error) {
    return {
      isValid: false,
      error: `❌ Unable to fetch remote drive info: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

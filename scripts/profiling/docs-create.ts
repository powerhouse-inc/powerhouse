#!/usr/bin/env tsx
/**
 * Script to create N documents
 * Usage: tsx scripts/docs-create.ts [N] [--endpoint <url>] [--driveId <id>]
 *
 * @example
 *   tsx scripts/docs-create.ts 10
 *   tsx scripts/docs-create.ts 100 --endpoint http://localhost:4001/graphql
 *   tsx scripts/docs-create.ts 50 --driveId my-drive-id
 */

import { GraphQLClient, gql } from "graphql-request";

interface CreateEmptyDocumentResponse {
  createEmptyDocument: {
    id: string;
    name: string;
  };
}

interface RenameDocumentResponse {
  renameDocument: {
    id: string;
    name: string;
  };
}

interface AddChildrenResponse {
  addChildren: {
    id: string;
  };
}

interface DocumentModelsResponse {
  documentModels: {
    items: Array<{
      id: string;
      name: string;
    }>;
  };
}

interface DriveDocumentResponse {
  driveDocument: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

interface AddDriveResponse {
  addDrive: {
    id: string;
    slug: string;
    name: string;
  };
}

const CREATE_EMPTY_DOCUMENT_MUTATION = gql`
  mutation CreateEmptyDocument($documentType: String!, $parentIdentifier: String) {
    createEmptyDocument(documentType: $documentType, parentIdentifier: $parentIdentifier) {
      id
      name
    }
  }
`;

const RENAME_DOCUMENT_MUTATION = gql`
  mutation RenameDocument($documentIdentifier: String!, $name: String!) {
    renameDocument(documentIdentifier: $documentIdentifier, name: $name) {
      id
      name
    }
  }
`;

const ADD_CHILDREN_MUTATION = gql`
  mutation AddChildren($parentIdentifier: String!, $documentIdentifiers: [String!]!) {
    addChildren(parentIdentifier: $parentIdentifier, documentIdentifiers: $documentIdentifiers) {
      id
    }
  }
`;

const GET_DRIVE_QUERY = gql`
  query GetDrive($idOrSlug: String!) {
    driveDocument(idOrSlug: $idOrSlug) {
      id
      name
      slug
    }
  }
`;

const ADD_DRIVE_MUTATION = gql`
  mutation AddDrive($name: String!, $id: String, $slug: String) {
    addDrive(name: $name, id: $id, slug: $slug) {
      id
      slug
      name
    }
  }
`;

const DELETE_DRIVE_MUTATION = gql`
  mutation DeleteDrive($id: String!) {
    deleteDrive(id: $id)
  }
`;

const GET_DOCUMENT_MODELS_QUERY = gql`
  query GetDocumentModels {
    documentModels {
      items {
        id
        name
      }
    }
  }
`;

async function checkDriveExists(
  systemClient: GraphQLClient,
  driveId: string,
): Promise<boolean> {
  try {
    const response = await systemClient.request<DriveDocumentResponse>(
      GET_DRIVE_QUERY,
      {
        idOrSlug: driveId,
      },
    );
    return response.driveDocument !== null;
  } catch (error) {
    // If query fails, assume drive doesn't exist
    return false;
  }
}

async function createDrive(
  systemClient: GraphQLClient,
  driveId: string,
  name: string,
): Promise<string> {
  try {
    const response = await systemClient.request<AddDriveResponse>(
      ADD_DRIVE_MUTATION,
      {
        name,
        id: driveId,
        slug: driveId,
      },
    );
    return response.addDrive.id;
  } catch (error: any) {
    const errorMsg =
      error?.message ||
      error?.response?.errors?.[0]?.message ||
      String(error);
    if (errorMsg.includes("Forbidden")) {
      throw new Error(
        `Permission denied: Creating drives requires admin permissions. Error: ${errorMsg}`,
      );
    }
    throw new Error(`Failed to create drive: ${errorMsg}`);
  }
}

async function deleteDrive(
  systemClient: GraphQLClient,
  driveId: string,
): Promise<boolean> {
  try {
    const response = await systemClient.request<{ deleteDrive: boolean }>(
      DELETE_DRIVE_MUTATION,
      {
        id: driveId,
      },
    );
    return response.deleteDrive;
  } catch (error: any) {
    const errorMsg =
      error?.message ||
      error?.response?.errors?.[0]?.message ||
      String(error);
    if (errorMsg.includes("Forbidden")) {
      throw new Error(
        `Permission denied: Deleting drives requires admin permissions. Error: ${errorMsg}`,
      );
    }
    throw new Error(`Failed to delete drive: ${errorMsg}`);
  }
}

async function validateDrive(
  client: GraphQLClient,
  driveId: string,
  documentType: string,
  maxRetries: number = 3,
  retryDelay: number = 1000,
): Promise<boolean> {
  // Try to create a test document with the drive as parent
  // If it fails with "no CREATE_DOCUMENT operation", the drive is invalid
  // Retry a few times in case the drive is still propagating
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging (5 seconds per attempt)
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Validation timeout")), 5000);
      });
      
      const validationPromise = client.request<CreateEmptyDocumentResponse>(
        CREATE_EMPTY_DOCUMENT_MUTATION,
        {
          documentType,
          parentIdentifier: driveId,
        },
      );
      
      await Promise.race([validationPromise, timeoutPromise]);
      
      // If successful, the drive is valid
      // Note: We leave the test document - it's small and won't cause issues
      return true;
    } catch (error: any) {
      const errorMsg =
        error?.message ||
        error?.response?.errors?.[0]?.message ||
        String(error);
      
      // Handle timeout
      if (errorMsg.includes("Validation timeout")) {
        if (attempt === maxRetries) {
          return false; // Drive validation timed out
        }
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      
      // Check if this is the "no CREATE_DOCUMENT operation" error
      if (
        errorMsg.includes("no CREATE_DOCUMENT operation") ||
        errorMsg.includes("Failed to rebuild document")
      ) {
        // If it's the last attempt, return false (drive is invalid)
        if (attempt === maxRetries) {
          return false;
        }
        // Otherwise, wait and retry (drive might still be propagating)
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        continue;
      }
      // If it's a different error, re-throw it
      throw error;
    }
  }
  return false;
}

async function ensureDriveExists(
  endpoint: string,
  driveId: string,
  driveName: string,
  documentType: string,
  client: GraphQLClient,
): Promise<string> {
  // System subgraph is typically at /graphql/system
  // Handle different endpoint formats
  let systemEndpoint: string;
  if (endpoint.endsWith("/graphql")) {
    systemEndpoint = endpoint + "/system";
  } else if (endpoint.endsWith("/graphql/system")) {
    systemEndpoint = endpoint;
  } else {
    // Fallback: try appending /system
    systemEndpoint = endpoint.replace(/\/graphql$/, "") + "/graphql/system";
  }

  const systemClient = new GraphQLClient(systemEndpoint, {
    fetch,
  });

  console.log(`Checking if drive "${driveId}" exists...`);
  const exists = await checkDriveExists(systemClient, driveId);

  if (exists) {
    console.log(`✓ Drive "${driveId}" already exists`);
    
    // Validate that the drive is actually usable
    console.log(`Validating drive "${driveId}"...`);
    const isValid = await validateDrive(client, driveId, documentType);
    
    if (!isValid) {
      console.log(`⚠ Drive "${driveId}" exists but is invalid (missing CREATE_DOCUMENT operation)`);
      console.log(`  Deleting invalid drive...`);
      await deleteDrive(systemClient, driveId);
      console.log(`✓ Deleted invalid drive`);
      
      // Wait a bit for deletion to propagate
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      // Now create a new valid drive
      console.log(`Creating new drive "${driveId}"...`);
      const createdDriveId = await createDrive(systemClient, driveId, driveName);
      console.log(`✓ Created drive "${driveId}" (ID: ${createdDriveId})`);
      
      // Wait for drive to be fully initialized and propagate
      // Drive initialization can take time, especially the CREATE_DOCUMENT operation
      console.log(`Waiting for drive to initialize (3 seconds)...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      // Skip validation for newly created drives - they should be valid
      // If they're not, we'll find out when we try to create documents
      // Validation can hang if the drive isn't ready yet
      console.log(`✓ Drive created. Proceeding with document creation...`);
      return createdDriveId;
    }
    
    console.log(`✓ Drive "${driveId}" is valid`);
    return driveId;
  }

  console.log(`Drive "${driveId}" not found. Creating...`);
  try {
    const createdDriveId = await createDrive(systemClient, driveId, driveName);
    console.log(`✓ Created drive "${driveId}" (ID: ${createdDriveId})`);
    
    // Wait for drive to be fully initialized and propagate
    // Drive initialization can take time, especially the CREATE_DOCUMENT operation
    console.log(`Waiting for drive to initialize (3 seconds)...`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    // Skip validation for newly created drives - they should be valid
    // If they're not, we'll find out when we try to create documents
    // Validation can hang if the drive isn't ready yet
    console.log(`✓ Drive created. Proceeding with document creation...`);
    return createdDriveId;
  } catch (error: any) {
    console.error(`✗ Failed to create drive: ${error.message}`);
    throw error;
  }
}

async function getDriveDocumentId(
  systemClient: GraphQLClient,
  driveIdOrSlug: string,
): Promise<string> {
  const response = await systemClient.request<DriveDocumentResponse>(
    GET_DRIVE_QUERY,
    {
      idOrSlug: driveIdOrSlug,
    },
  );

  if (!response.driveDocument) {
    throw new Error(
      `Drive "${driveIdOrSlug}" not found. Please create the drive first or use a different driveId.`,
    );
  }

  return response.driveDocument.id;
}

async function getAvailableDocumentTypes(
  client: GraphQLClient,
): Promise<string[]> {
  try {
    const response = await client.request<DocumentModelsResponse>(
      GET_DOCUMENT_MODELS_QUERY,
    );
    return response.documentModels.items.map((model) => model.id);
  } catch (error) {
    console.warn("Failed to query available document types:", error);
    return [];
  }
}

async function createDocument(
  client: GraphQLClient,
  documentType: string,
  name: string,
  parentIdentifier?: string,
): Promise<string> {
  // Create empty document with optional parent (drive)
  // If parentIdentifier is provided, the document will be automatically
  // associated with the drive during creation
  const createResponse = await client.request<CreateEmptyDocumentResponse>(
    CREATE_EMPTY_DOCUMENT_MUTATION,
    {
      documentType,
      parentIdentifier: parentIdentifier || undefined,
    },
  );

  const documentId = createResponse.createEmptyDocument.id;

  // Rename the document
  await client.request<RenameDocumentResponse>(
    RENAME_DOCUMENT_MUTATION,
    {
      documentIdentifier: documentId,
      name,
    },
  );

  return documentId;
}

async function addDocumentToDrive(
  client: GraphQLClient,
  driveDocumentId: string,
  documentId: string,
): Promise<void> {
  // This function is kept for backward compatibility but is no longer
  // the recommended approach. Use parentIdentifier in createDocument instead.
  await client.request<AddChildrenResponse>(
    ADD_CHILDREN_MUTATION,
    {
      parentIdentifier: driveDocumentId,
      documentIdentifiers: [documentId],
    },
  );
}

async function main() {
  const args = process.argv.slice(2);
  let numDocuments = 10;
  let endpoint = "http://localhost:4001/graphql";
  let driveId: string | undefined;

  let documentType: string | undefined;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--endpoint" && args[i + 1]) {
      endpoint = args[i + 1];
      i++;
    } else if (arg === "--driveId" && args[i + 1]) {
      driveId = args[i + 1];
      i++;
    } else if (arg === "--documentType" && args[i + 1]) {
      documentType = args[i + 1];
      i++;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`
Usage: tsx scripts/docs-create.ts [N] [options]

Arguments:
  N                    Number of documents to create (default: 10)

Options:
  --endpoint <url>     GraphQL endpoint (default: http://localhost:4001/graphql)
  --driveId <id>       Drive ID to add documents to (default: powerhouse)
  --documentType <type> Document type to create (required)
  --help, -h           Show this help message

Examples:
  tsx scripts/docs-create.ts 10 --documentType powerhouse/document-model
  tsx scripts/docs-create.ts 100 --endpoint http://localhost:4001/graphql --documentType powerhouse/document-model
  tsx scripts/docs-create.ts 50 --driveId my-drive-id --documentType powerhouse/document-model
`);
      process.exit(0);
    } else if (!isNaN(Number(arg))) {
      numDocuments = Number(arg);
    }
  }

  // Default to "powerhouse" drive if not provided
  if (!driveId) {
    driveId = "powerhouse";
    console.log(`Using default driveId: powerhouse`);
  }

  // Determine system endpoint
  let systemEndpoint: string;
  if (endpoint.endsWith("/graphql")) {
    systemEndpoint = endpoint.replace("/graphql", "/graphql/system");
  } else if (endpoint.endsWith("/graphql/system")) {
    systemEndpoint = endpoint;
  } else {
    systemEndpoint = endpoint + "/system";
  }

  const client = new GraphQLClient(endpoint, {
    fetch,
  });

  const systemClient = new GraphQLClient(systemEndpoint, {
    fetch,
  });

  // If document type not provided, query available types and use the first one
  if (!documentType) {
    console.log("No document type specified. Querying available document types...");
    const availableTypes = await getAvailableDocumentTypes(client);
    
    if (availableTypes.length === 0) {
      console.error(
        "\n✗ No document types available. Please specify --documentType explicitly.",
      );
      process.exit(1);
    }

    // Use the first available document type as default
    documentType = availableTypes[0];
    console.log(
      `Using first available document type: ${documentType}`,
    );
    if (availableTypes.length > 1) {
      console.log(
        `  (Available types: ${availableTypes.join(", ")})`,
      );
    }
  }

  // Ensure the drive exists and is valid
  // Note: We need documentType to validate the drive, so we do this after determining the type
  try {
    const actualDriveId = await ensureDriveExists(
      endpoint,
      driveId,
      driveId.charAt(0).toUpperCase() + driveId.slice(1) + " Drive",
      documentType,
      client,
    );
    driveId = actualDriveId;
  } catch (error: any) {
    console.error(`\n✗ Cannot proceed without drive. Error: ${error.message}`);
    console.error(
      `   You can either:\n   1. Create the drive manually with admin permissions\n   2. Use a different driveId with --driveId`,
    );
    process.exit(1);
  }
  console.log();

  console.log(`Creating ${numDocuments} documents...`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Drive ID: ${driveId}`);
  console.log(`Document Type: ${documentType}`);

  // Create all documents and associate them with the drive
  // Using parentIdentifier automatically associates documents with the drive during creation
  const startTime = Date.now();
  const documentIds: string[] = [];
  const errors: Array<{ index: number; error: unknown }> = [];

  // Track if we've detected the drive is invalid during document creation
  let driveInvalidDuringCreation = false;
  let driveInvalidWarningShown = false;

  // Create all documents
  for (let i = 0; i < numDocuments; i++) {
    const name = `doc-${i + 1}`;
    try {
      let docId: string;
      
      // Try to create document with drive as parent
      // If the drive is invalid, fall back to creating without a parent
      if (!driveInvalidDuringCreation) {
        try {
          docId = await createDocument(
            client,
            documentType,
            name,
            driveId, // Use driveId as parentIdentifier to associate with drive
          );
        } catch (error: any) {
          const errorMsg =
            error?.message ||
            error?.response?.errors?.[0]?.message ||
            String(error);
          
          // Check if this is the "no CREATE_DOCUMENT operation" error
          if (
            errorMsg.includes("no CREATE_DOCUMENT operation") ||
            errorMsg.includes("Failed to rebuild document")
          ) {
            driveInvalidDuringCreation = true;
            if (!driveInvalidWarningShown) {
              console.warn(
                `\n⚠ Warning: Drive "${driveId}" is invalid (missing CREATE_DOCUMENT operation).`,
              );
              console.warn(
                `   Creating documents without drive association. Documents will still be created.`,
              );
              driveInvalidWarningShown = true;
            }
            
            // Fall back to creating without parent
            docId = await createDocument(
              client,
              documentType,
              name,
              undefined, // No parent
            );
          } else {
            // Re-throw if it's a different error
            throw error;
          }
        }
      } else {
        // Drive is invalid, create without parent
        docId = await createDocument(
          client,
          documentType,
          name,
          undefined, // No parent
        );
      }
      
      documentIds.push(docId);

      // Show progress every 10 documents or on the last one
      if ((i + 1) % 10 === 0 || i === numDocuments - 1) {
        process.stdout.write(`\r  Created ${i + 1}/${numDocuments} documents`);
      }

      // Small delay between document creations to avoid overwhelming the server
      if (i < numDocuments - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (error: any) {
      errors.push({ index: i + 1, error });
      const errorMsg =
        error?.message ||
        error?.response?.errors?.[0]?.message ||
        String(error);
      
      console.error(`\n✗ Failed to create document ${i + 1}: ${errorMsg}`);
    }
  }

  console.log(`\n✓ Created ${documentIds.length} documents`);

  if (errors.length > 0) {
    console.error(`\n✗ Failed to create ${errors.length} documents`);
  }

  // Warn if drive was invalid and documents weren't associated
  if (driveInvalidDuringCreation && documentIds.length > 0) {
    console.warn(
      `\n⚠ Note: Documents were created but not associated with drive "${driveId}".`,
    );
    console.warn(
      `   The drive is in an invalid state (missing CREATE_DOCUMENT operation).`,
    );
    console.warn(
      `   Documents are still accessible but won't appear in drive queries.`,
    );
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`\n✓ Completed in ${duration}s`);
  console.log(`  Documents created: ${documentIds.length}`);
  if (documentIds.length > 0) {
    console.log(`  First document ID: ${documentIds[0]}`);
    console.log(`  Last document ID: ${documentIds[documentIds.length - 1]}`);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
